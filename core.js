/* AI Quant v0.5 · pure data / calculation layer; no credentials or network access. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AQ = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  const n = (x) =>
    x == null || String(x).trim() === "" || typeof x === "boolean"
      ? null
      : Number.isFinite(Number(x))
        ? Number(x)
        : null;
  const positive = (x) => (n(x) > 0 ? n(x) : null);
  const key = (x) =>
    String(x || "")
      .toUpperCase()
      .replace(/\s/g, "")
      .replace(/^IDX:/, "");
  const truth = (x) => x === true || /^(true|1|yes|active)$/i.test(String(x));
  const blank = () => ({
    meta: {},
    regime: { chips: [] },
    signals: [],
    watchlist: [],
    decisions: {},
    history: [],
    scorecard: {},
    diagnostics: [],
  });
  function csv(text) {
    let rows = [],
      row = [],
      cell = "",
      quote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quote && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quote = !quote;
      } else if (c === "," && !quote) {
        row.push(cell);
        cell = "";
      } else if ((c === "\n" || c === "\r") && !quote) {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        if (row.some(Boolean)) rows.push(row);
        row = [];
        cell = "";
      } else cell += c;
    }
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }
  function parseFeed(text) {
    const rows = csv(text),
      h = (rows.shift() || []).map((x) => x.replace(/^\uFEFF/, "")),
      fields = [
        "record_type",
        "record_id",
        "field",
        "value",
        "value_type",
        "as_of_date",
      ];
    if (fields.some((x) => !h.includes(x)))
      throw Error("The public feed has an unsupported format.");
    const at = Object.fromEntries(fields.map((x) => [x, h.indexOf(x)])),
      latest = new Map(),
      d = blank(),
      seen = new Set();
    let duplicates = 0;
    for (const r of rows) {
      let type = r[at.record_type],
        id = r[at.record_id],
        field = r[at.field],
        date = r[at.as_of_date] || "",
        v = r[at.value],
        k = [type, id, field].join("|");
      if (!id || !field) continue;
      if (seen.has(k + "|" + date)) duplicates++;
      seen.add(k + "|" + date);
      if (!latest.has(k) || latest.get(k).date <= date)
        latest.set(k, {
          type,
          id,
          field,
          date,
          value:
            r[at.value_type] === "number"
              ? n(v)
              : r[at.value_type] === "boolean"
                ? truth(v)
                : v,
        });
    }
    const sig = {},
      watch = {},
      history = {};
    for (const o of latest.values()) {
      const { type, id, field, date, value } = o;
      if (type === "meta") {
        d.meta[field] = value;
        d.meta.asOf = date > d.meta.asOf || !d.meta.asOf ? date : d.meta.asOf;
      } else if (type === "regime") {
        d.regime[field] = value;
        d.regime._dates = d.regime._dates || {};
        d.regime._dates[field] = date;
      } else if (type === "signal") {
        (sig[id] || (sig[id] = { id, _dates: {} }))[field] = value;
        sig[id]._dates[field] = date;
      } else if (type === "watch") {
        const w = watch[id] || (watch[id] = { id, _dates: {} });
        if (field === "summary") {
          const a = String(value || "").split("|");
          Object.assign(w, {
            instrument: a[0] || id,
            action: "WAIT",
            reference: a[1],
            trigger: a[2],
            targetText: a[3],
            stopText: a[4],
            note: a[5] || "",
          });
        } else w[field] = value;
        w._dates[field] = date;
      } else if (type === "decision") {
        (d.decisions[id] || (d.decisions[id] = {}))[field] = value;
        d.decisions[id].asOf = date;
      } else if (type === "score") {
        d.scorecard[field] = value;
        d.scorecard.asOf = date;
      } else if (type === "history" && field === "summary")
        history[id] = { id, date, text: String(value) };
    }
    d.signals = Object.values(sig);
    d.watchlist = Object.values(watch);
    d.history = Object.values(history);
    d.regime.chips = Object.entries({
      brent: "Brent",
      us10y: "US 10Y",
      fedOdds: "Fed hike odds",
      usdIdr: "USD/IDR",
    })
      .filter(([f]) => d.regime[f] != null)
      .map(([f, label]) => ({
        label,
        value: d.regime[f],
        asOf: d.regime._dates[f],
      }));
    if (duplicates)
      d.diagnostics.push(
        duplicates + " repeated feed keys on the same date; latest row used.",
      );
    return d;
  }
  function dateOnly(value) {
    if (!value) return "";
    const s = String(value);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
  }
  function jakartaDate(now = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
  function calendarAge(from, to = jakartaDate()) {
    if (!dateOnly(from) || !dateOnly(to)) return null;
    return Math.max(
      0,
      Math.floor(
        (Date.parse(dateOnly(to) + "T00:00:00Z") -
          Date.parse(dateOnly(from) + "T00:00:00Z")) /
          86400000,
      ),
    );
  }
  function weekdays(from, to = jakartaDate()) {
    if (!dateOnly(from) || !dateOnly(to)) return null;
    const a = new Date(dateOnly(from) + "T12:00:00Z"),
      b = new Date(dateOnly(to) + "T12:00:00Z");
    let count = 0;
    while (a < b && count < 10000) {
      a.setUTCDate(a.getUTCDate() + 1);
      if (a.getUTCDay() !== 0 && a.getUTCDay() !== 6) count++;
    }
    return count;
  }
  function latestBy(rows, identity, date) {
    const m = new Map();
    for (const r of rows || []) {
      const k = identity(r),
        v = String(date(r) || "");
      if (k && (!m.has(k) || String(date(m.get(k)) || "") <= v)) m.set(k, r);
    }
    return [...m.values()];
  }
  function calendarDelta(value, today = jakartaDate()) {
    const valid = (v) => {
      const s = dateOnly(v);
      if (!s) return null;
      const ms = Date.parse(s + "T00:00:00Z");
      return Number.isFinite(ms) &&
        new Date(ms).toISOString().slice(0, 10) === s
        ? ms
        : null;
    };
    const a = valid(value),
      b = valid(today);
    return a === null || b === null ? null : Math.round((a - b) / 86400000);
  }
  function crucialDates(rows, today = jakartaDate()) {
    return latestBy(
      rows,
      (r) => String(r.Event_ID || "").trim(),
      (r) => r.Last_Reviewed,
    )
      .map((r) => {
        const days = calendarDelta(r.Date, today),
          recordedStatus = String(r.Status || "UPCOMING")
            .trim()
            .toUpperCase(),
          terminal = ["COMPLETED", "EXPIRED"].includes(recordedStatus),
          ready = days !== null && !!String(r.Source || "").trim(),
          rawLead = n(r.Reminder_Days),
          lead = Number.isInteger(rawLead) && rawLead >= 0 ? rawLead : null;
        let state = "upcoming";
        if (terminal) state = recordedStatus.toLowerCase();
        else if (!ready || !["UPCOMING", "TRIGGERED"].includes(recordedStatus))
          state = "incomplete";
        else if (recordedStatus === "TRIGGERED") state = "triggered";
        else if (days < 0) state = "overdue";
        else if (days === 0) state = "today";
        else if (lead !== null && days <= lead) state = "due-soon";
        const countdown = terminal
          ? recordedStatus
          : !ready
            ? "DATE / SOURCE NEEDED"
            : days < 0
              ? "OVERDUE"
              : days === 0
                ? "TODAY"
                : days === 1
                  ? "1 DAY"
                  : days + " DAYS";
        const reminder =
          terminal || state === "incomplete"
            ? ""
            : state === "triggered"
              ? "Triggered"
              : days === 0
                ? "Today"
                : days === 1 && lead >= 1
                  ? "H-1"
                  : days === 3 && lead >= 3
                    ? "H-3"
                    : "";
        return {
          id: String(r.Event_ID).trim(),
          date: days === null ? "" : dateOnly(r.Date),
          instrument: r.Instrument || "Not recorded",
          type: r.Event_Type || "Not recorded",
          title: r.Title || "Untitled checkpoint",
          triggerType: String(r.Trigger_Type || "NONE").toUpperCase(),
          low: positive(r.Trigger_Low),
          high: positive(r.Trigger_High),
          priority: r.Priority || "Not recorded",
          recordedStatus,
          state,
          terminal,
          ready,
          days,
          countdown,
          reminder,
          lead,
          source: r.Source || "",
          signal: r.Linked_Signal || "",
          watch: r.Linked_Watch || "",
          action: r.Action_On_Due || "",
          reviewed: dateOnly(r.Last_Reviewed),
          why: r.Why_It_Matters || "",
        };
      })
      .sort(
        (a, b) =>
          (a.date || "9999").localeCompare(b.date || "9999") ||
          a.id.localeCompare(b.id),
      );
  }
  function signalRow(r) {
    return {
      id: r.Signal_ID,
      version: r.Version,
      createdDate: dateOnly(r.Created_Date),
      createdTime: r.Created_Time,
      instrument: r.Instrument,
      assetClass: r.Asset_Class,
      action: r.Action,
      status: r.Status,
      entry: n(r.Reference_Price),
      entryLow: n(r.Entry_Low),
      entryHigh: n(r.Entry_High),
      target: n(r.Target),
      stop: n(r.Invalidation),
      horizon: n(r.Horizon_Days),
      confidence: n(r.Confidence_pct),
      benchmark: r.Benchmark,
      benchmarkBaseline: n(r.Benchmark_Baseline),
      thesis: r.Thesis,
      catalysts: r.Catalysts,
      risks: r.Key_Risks,
      locked: truth(r.Locked),
      exitDate: dateOnly(r.Exit_Date),
      exitPrice: n(r.Exit_Price),
      fairLow: n(r.Fair_Value_Low),
      fairBase: n(r.Fair_Value_Base),
      fairHigh: n(r.Fair_Value_High),
      targetDerivation: r.Target_Derivation,
      invalidationDerivation: r.Invalidation_Derivation,
      sourceRefs: r.Source_Refs,
    };
  }
  function watchRow(r) {
    return {
      id: r.Wait_ID,
      createdDate: dateOnly(r.Created_Date),
      instrument: r.Instrument,
      assetClass: r.Asset_Class,
      action: r.Action,
      status: r.Status,
      reference: r.Reference_Price_Text,
      triggerLow: n(r.Trigger_Low),
      triggerHigh: n(r.Trigger_High),
      trigger: r.Trigger_Text,
      target: n(r.Planned_Target),
      stop: n(r.Planned_Stop),
      horizon: n(r.Horizon_Days),
      thesis: r.Thesis,
      locked: truth(r.Locked),
      lastReview: dateOnly(r.Last_Review_Date),
      exitDate: dateOnly(r.Exit_Date),
      exitReason: r.Exit_Reason,
      version: r.Version,
      sourceRefs: r.Source_Refs,
    };
  }
  function model(m, research, legacy) {
    const t = (research && research.tables) || {},
      srows = (t.Signals || []).map(signalRow),
      wrows = (t.Watchlist || []).map(watchRow);
    const baseS = srows.length ? srows : (legacy && legacy.signals) || [],
      baseW = wrows.length ? wrows : (legacy && legacy.watchlist) || [];
    const sm = new Map((m.signals || []).map((s) => [s.id, { ...s }])),
      wm = new Map((m.watchlist || []).map((w) => [w.id, { ...w }]));
    for (const s of baseS) {
      const f = sm.get(s.id) || {},
        merged = { ...f, ...s, current: f.current, _dates: f._dates || {} };
      if (
        f.status &&
        (!srows.length ||
          (f._dates?.status || "") > dateOnly(research?.fetchedAt))
      ) {
        merged.status = f.status;
        if (f.exitDate) merged.exitDate = f.exitDate;
        if (n(f.exitPrice) !== null) merged.exitPrice = n(f.exitPrice);
      }
      sm.set(s.id, merged);
    }
    for (const w of baseW) {
      const f = wm.get(w.id) || {};
      wm.set(w.id, {
        ...f,
        ...w,
        note: f.note || "",
        reference: f.reference || w.reference,
        _dates: f._dates || {},
      });
    }
    const scores = latestBy(
        t.Scorecard || [],
        () => "latest",
        (r) => r.Date,
      )[0],
      scorecard = { ...m.scorecard };
    if (scores && String(scores.Date) >= (m.scorecard?.asOf || "")) {
      const fields = {
        Active_Signals: "active",
        Wait_Calls: "wait",
        Closed_Signals: "closed",
        Win_Rate_pct: "winRate",
        Expectancy_pct: "expectancy",
        Cumulative_Return_pct: "paperReturn",
        Benchmark_Return_pct: "benchmarkReturn",
        Alpha_pct: "alpha",
        Max_Drawdown_pct: "maxDrawdown",
        Profit_Factor: "profitFactor",
      };
      for (const [field, k] of Object.entries(fields))
        scorecard[k] = n(scores[field]);
      scorecard.asOf = scores.Date;
      scorecard.sampleWarning = scores.Sample_Warning;
    }
    return {
      ...m,
      scorecard,
      signals: [...sm.values()],
      watchlist: [...wm.values()],
      tables: t,
      observations: latestBy(
        t["Daily Observations"] || [],
        (r) => r.Signal_ID + "|" + r.Date,
        (r) => r.Date,
      ),
      universe: latestBy(
        t.Universe || [],
        (r) => key(r.Ticker),
        (r) => r.Last_Verified,
      ),
      fundamentals: latestBy(
        t["Fundamental Snapshot"] || [],
        (r) => key(r.Ticker),
        (r) => r.Last_Updated || r.Report_Date,
      ),
      radar: latestBy(
        t["Daily Radar"] || [],
        (r) => key(r.Ticker) + "|" + r.Date,
        (r) => r.Date,
      ),
      sources: t["Research Sources"] || [],
      dates: crucialDates(t["Crucial Dates"] || []),
    };
  }
  function rr(price, target, stop) {
    const p = positive(price),
      t = positive(target),
      s = positive(stop);
    return p !== null && t !== null && s !== null && p > s && t > p
      ? (t - p) / (p - s)
      : null;
  }
  function priceFor(
    instrument,
    {
      quotes = [],
      checkedAt = "",
      privatePositions = [],
      manualPrices = {},
      signals = [],
      radar = [],
    },
  ) {
    const k = key(instrument),
      q = quotes.find((x) => key(x.instrument) === k);
    if (q && positive(q.price) !== null)
      return {
        value: n(q.price),
        source: q.source || "GOOGLEFINANCE",
        checkedAt,
        asOf: q.sheetRecalcAt || "",
        quoteTimeKnown: false,
        delay: q.delayNote || "Delayed",
        kind: "quote",
      };
    const pp = privatePositions.find((x) => key(x.instrument) === k);
    if (pp && positive(pp.currentPrice) !== null)
      return {
        value: n(pp.currentPrice),
        source: "Private position snapshot",
        asOf: pp.lastUpdated || "",
        kind: "private",
      };
    if (positive(manualPrices[k]) !== null)
      return {
        value: n(manualPrices[k]),
        source: "Manual price",
        asOf: "",
        kind: "manual",
      };
    const s = signals.find((x) => key(x.instrument) === k);
    if (s && positive(s.current) !== null)
      return {
        value: n(s.current),
        source: "Daily paper feed",
        asOf: (s._dates && s._dates.current) || "",
        kind: "research",
      };
    const r = latestBy(
      radar.filter((x) => key(x.Ticker) === k),
      (x) => key(x.Ticker),
      (x) => x.Date,
    )[0];
    if (r && positive(r.Current_Price) !== null)
      return {
        value: n(r.Current_Price),
        source: r.Technical_Source || "Daily Radar",
        asOf: r.Price_AsOf || r.Date,
        kind: "research",
      };
    return {
      value: null,
      source: "No verified price",
      asOf: "",
      kind: "missing",
    };
  }
  function opportunity(s, price, decision) {
    const p = positive(price);
    let mechanical = "PRICE UNAVAILABLE",
      tone = "muted",
      reason = "A verified price is needed to compare with the locked levels.";
    if (p !== null) {
      if (positive(s.stop) !== null && p <= s.stop) {
        mechanical = "INVALIDATION REACHED";
        tone = "red";
        reason =
          "Price is at or below the locked invalidation. Review required; no automatic exit.";
      } else if (positive(s.target) !== null && p >= s.target) {
        mechanical = "TARGET REACHED";
        tone = "green";
        reason =
          "Price is at or above the locked target. Review required; the paper record stays locked.";
      } else if (positive(s.entryLow) !== null && p < s.entryLow) {
        mechanical = "BELOW ENTRY ZONE";
        tone = "amber";
        reason =
          "A lower price does not establish a better investment. Recheck the thesis and downside.";
      } else if (positive(s.entryHigh) !== null && p > s.entryHigh) {
        mechanical = "ABOVE ENTRY ZONE";
        tone = "amber";
        reason = "Do not chase beyond the original entry zone.";
      } else if (
        positive(s.entryLow) !== null &&
        positive(s.entryHigh) !== null
      ) {
        mechanical = "IN ENTRY ZONE";
        tone = "blue";
        reason =
          "A price condition only. This does not activate a BUY or override today’s review.";
      } else {
        mechanical = "REVIEW LEVELS";
        reason = "The entry range is not recorded.";
      }
    }
    return {
      mechanical,
      tone,
      reason,
      daily: (decision && decision.label) || "NO CURRENT REVIEW",
      dailyReason:
        (decision && decision.reason) || "No daily decision is available.",
      asOf: (decision && decision.asOf) || "",
      rr: rr(p, s.target, s.stop),
    };
  }
  function trigger(w, price) {
    const p = positive(price),
      lo = n(w.triggerLow),
      hi = n(w.triggerHigh);
    if (p === null) return { label: "PRICE UNAVAILABLE", hit: false };
    if (lo !== null && hi !== null)
      return {
        label:
          p < lo
            ? "BELOW TRIGGER"
            : p > hi
              ? "ABOVE TRIGGER"
              : "TRIGGER REACHED",
        hit: p >= lo && p <= hi,
      };
    if (lo === null && hi !== null)
      return { label: p <= hi ? "TRIGGER REACHED" : "WAIT", hit: p <= hi };
    return { label: "REVIEW TRIGGER", hit: false };
  }
  function horizon(s, observations, now = jakartaDate()) {
    const o = latestBy(
        (observations || []).filter(
          (r) => r.Signal_ID === s.id && n(r.Days_Elapsed) !== null,
        ),
        (r) => r.Signal_ID,
        (r) => r.Date,
      )[0],
      days = o ? n(o.Days_Elapsed) : weekdays(s.createdDate, s.exitDate || now);
    return {
      elapsed: days,
      remaining:
        n(s.horizon) !== null && days !== null
          ? Math.max(0, s.horizon - days)
          : null,
      total: n(s.horizon),
      asOf: o ? dateOnly(o.Date) : s.exitDate || now,
      estimated: !o,
      end: s.exitDate || null,
    };
  }
  function currency(i) {
    const k = key(i);
    if (k.includes("XAU") || /^((NASDAQ|NYSE|AMEX):)/.test(k)) return "USD";
    if (/^[A-Z]{4}$/.test(k) || k === "USD/IDR") return "IDR";
    return "UNKNOWN";
  }
  function positions(txs, getPrice) {
    const map = new Map(),
      issues = [];
    const sorted = [...txs].sort((a, b) =>
      (String(a.date) + String(a.createdAt || "")).localeCompare(
        String(b.date) + String(b.createdAt || ""),
      ),
    );
    for (const t of sorted) {
      const k = key(t.instrument),
        q = n(t.quantity) * (t.unit === "lot" ? 100 : 1),
        pr = positive(t.price),
        fee = n(t.fee) || 0;
      if (
        !k ||
        q <= 0 ||
        pr === null ||
        fee < 0 ||
        !["BUY", "SELL"].includes(t.action)
      ) {
        issues.push(t.id + ": invalid transaction");
        continue;
      }
      const p = map.get(k) || {
        instrument: k,
        qty: 0,
        avg: 0,
        realized: 0,
        sources: new Set(),
        links: new Set(),
        currency: currency(t.instrument),
      };
      p.sources.add(t.source);
      if (t.linkedSignal) p.links.add(t.linkedSignal);
      if (t.action === "BUY") {
        p.avg = (p.qty * p.avg + q * pr + fee) / (p.qty + q);
        p.qty += q;
      } else {
        const sold = Math.min(q, p.qty);
        if (q > p.qty) issues.push(t.id + ": sell exceeds recorded holding");
        p.realized += (pr - p.avg) * sold - fee;
        p.qty -= sold;
        if (p.qty <= 0) {
          p.qty = 0;
          p.avg = 0;
        }
      }
      map.set(k, p);
    }
    return {
      issues,
      items: [...map.values()]
        .filter((p) => p.qty > 0 || Math.abs(p.realized) > 0.0001)
        .map((p) => {
          const quote = getPrice(p.instrument),
            v = positive(quote.value);
          return {
            ...p,
            sources: [...p.sources],
            links: [...p.links],
            quote,
            current: v,
            value: v === null ? null : v * p.qty,
            cost: p.avg * p.qty,
            unreal: v === null ? null : (v - p.avg) * p.qty,
            unrealPct: v === null || !p.avg ? null : (v / p.avg - 1) * 100,
          };
        }),
    };
  }
  function mergeTransactions(local, remote, pending = [], ack = []) {
    const rm = new Map(remote.map((t) => [t.id, t])),
      keep = new Map(remote.map((t) => [t.id, t])),
      pend = new Map(pending.map((p) => [p.id, p])),
      am = new Set(ack);
    for (const t of local) {
      const op = pend.get(t.id),
        r = rm.get(t.id);
      if (op && op.action === "delete") {
        keep.delete(t.id);
        continue;
      }
      if (op && op.action === "upsert") {
        keep.set(t.id, t);
        continue;
      }
      if (!r && !am.has(t.id)) keep.set(t.id, t);
      else if (
        r &&
        (Date.parse(t.updatedAt || t.createdAt) || 0) >
          (Date.parse(r.updatedAt || r.createdAt) || 0)
      )
        keep.set(t.id, t);
    }
    for (const p of pending) if (p.action === "delete") keep.delete(p.id);
    return [...keep.values()];
  }
  function validateTx(t, others = []) {
    if (
      !String(t.instrument || "").trim() ||
      !dateOnly(t.date) ||
      !["BUY", "SELL"].includes(t.action) ||
      positive(t.price) === null ||
      positive(t.quantity) === null ||
      n(t.fee) === null ||
      n(t.fee) < 0
    )
      return "Enter a date, instrument, positive price and quantity, and non-negative fee.";
    if (t.unit === "lot" && !Number.isInteger(n(t.quantity)))
      return "IDX lots must be whole numbers.";
    const result = positions(
      [...others.filter((x) => x.id !== t.id), t],
      () => ({ value: null }),
    );
    if (result.issues.some((x) => x.endsWith("sell exceeds recorded holding")))
      return "This change would create a sell larger than the holding available on that date.";
    return "";
  }
  function riskScenario({
    capital,
    riskPct,
    entry,
    target,
    stop,
    allocationPct = 100,
    lotSize = 100,
    feePct = 0,
  }) {
    [capital, riskPct, entry, target, stop, allocationPct, lotSize, feePct] = [
      capital,
      riskPct,
      entry,
      target,
      stop,
      allocationPct,
      lotSize,
      feePct,
    ].map(n);
    if (
      !capital ||
      !riskPct ||
      riskPct > 100 ||
      !entry ||
      !stop ||
      stop >= entry ||
      !target ||
      target <= entry ||
      !allocationPct ||
      allocationPct > 100 ||
      !lotSize ||
      feePct === null ||
      feePct < 0 ||
      feePct >= 100
    )
      return null;
    const fee = feePct / 100,
      budget = (capital * riskPct) / 100,
      lossPer = entry - stop + (entry + stop) * fee,
      costPer = entry * (1 + fee),
      qty =
        Math.floor(
          Math.min(
            budget / lossPer,
            (capital * allocationPct) / 100 / costPer,
          ) / lotSize,
        ) * lotSize;
    const cost = qty * costPer,
      loss = qty * lossPer,
      gain = qty * (target - entry - (target + entry) * fee);
    return {
      qty,
      lots: qty / lotSize,
      cost,
      loss,
      gain,
      rr: loss > 0 ? gain / loss : null,
      budget,
      allocation: (cost / capital) * 100,
      lossPer,
    };
  }
  function validEndpoint(value) {
    try {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        u.hostname === "script.google.com" &&
        /^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(u.pathname) &&
        !u.search &&
        !u.hash
      );
    } catch {
      return false;
    }
  }
  function validGoogleOrigin(value) {
    try {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        (u.hostname === "script.google.com" ||
          u.hostname === "script.googleusercontent.com" ||
          /^[a-z0-9-]+-script\.googleusercontent\.com$/.test(u.hostname))
      );
    } catch {
      return false;
    }
  }
  function validSourceURL(value) {
    try {
      const u = new URL(value);
      return ["http:", "https:"].includes(u.protocol) ? u.href : null;
    } catch {
      return null;
    }
  }
  return {
    n,
    positive,
    key,
    truth,
    blank,
    csv,
    parseFeed,
    dateOnly,
    jakartaDate,
    calendarAge,
    weekdays,
    latestBy,
    calendarDelta,
    crucialDates,
    signalRow,
    watchRow,
    model,
    rr,
    priceFor,
    opportunity,
    trigger,
    horizon,
    currency,
    positions,
    mergeTransactions,
    validateTx,
    riskScenario,
    validEndpoint,
    validGoogleOrigin,
    validSourceURL,
  };
});
