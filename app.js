/* AI Quant v0.5. Uses the original v0.4 storage keys and backend actions. */
(() => {
  "use strict";
  const Q = window.AQ,
    S = window.AQ_SEED,
    $ = (id) => document.getElementById(id);
  const KEYS = {
    tx: "quantPrivateTransactionsV3",
    manual: "quantPrivatePricesV3",
    feed: "quantFeedUrlV3",
    market: "quantMarketCacheV3",
    url: "quantPrivateSyncUrlV3",
    token: "quantPrivateSyncTokenV3",
    quotes: "quantLivePricesV4",
    checked: "quantPriceCheckedAtV4",
    research: "quantResearchV5",
    outbox: "quantPrivateOutboxV5",
    ack: "quantPrivateAckV5",
    positions: "quantPrivatePositionsV5",
    hide: "quantHideBalancesV5",
    auto: "quantAutoPricesV5",
  };
  const DEFAULT_FEED =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBDuJV6VmbwRheiQP9XwAXWlR89IUORKFRSwDk9U2AbR_tVcPTJKuGTCLjeR0F__jNy1zlL68jQQn_/pub?gid=2110283304&single=true&output=csv";
  try {
    const pending = JSON.parse(
      localStorage.getItem("quantPendingCommitV5") || "null",
    );
    if (
      pending &&
      Array.isArray(pending.transactions) &&
      Array.isArray(pending.outbox) &&
      Array.isArray(pending.ack)
    ) {
      localStorage.setItem(KEYS.tx, JSON.stringify(pending.transactions));
      localStorage.setItem(KEYS.outbox, JSON.stringify(pending.outbox));
      localStorage.setItem(KEYS.ack, JSON.stringify(pending.ack));
      localStorage.setItem(
        KEYS.manual,
        JSON.stringify(pending.manualPrices || {}),
      );
      localStorage.removeItem("quantPendingCommitV5");
    }
  } catch {}
  let storageError = "",
    syncStatus = "Cached research",
    privateStatus = "Device only",
    researchStatus = "Not connected",
    priceError = "",
    feedBusy = false,
    privateBusy = false,
    priceBusy = false,
    researchBusy = false,
    transport = Promise.resolve(),
    toastTimer;
  function read(k, f) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : f;
    } catch {
      storageError =
        "A saved value could not be read. Existing storage has been kept; export recovery data before editing.";
      return f;
    }
  }
  function write(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      storageError =
        "Device storage is full or unavailable. Changes cannot be saved safely.";
      toast(storageError);
      return false;
    }
  }
  if (
    !localStorage.getItem(KEYS.tx) &&
    localStorage.getItem("quantPrivateTransactionsV2")
  ) {
    localStorage.setItem(
      KEYS.tx,
      localStorage.getItem("quantPrivateTransactionsV2"),
    );
    if (localStorage.getItem("quantPrivatePricesV2"))
      localStorage.setItem(
        KEYS.manual,
        localStorage.getItem("quantPrivatePricesV2"),
      );
  }
  let market = read(KEYS.market, S.market),
    txs = read(KEYS.tx, []),
    manual = read(KEYS.manual, {}),
    quotes = read(KEYS.quotes, []),
    checked = localStorage.getItem(KEYS.checked) || "",
    research = read(KEYS.research, null),
    privatePositions = read(KEYS.positions, []),
    outbox = read(KEYS.outbox, []),
    ack = read(KEYS.ack, []),
    hide = read(KEYS.hide, false),
    auto = read(KEYS.auto, 5);
  if (
    !Array.isArray(txs) ||
    !Array.isArray(quotes) ||
    !Array.isArray(outbox) ||
    !Array.isArray(ack)
  ) {
    storageError =
      "Saved portfolio data has an unexpected format. It has not been overwritten.";
    txs = Array.isArray(txs) ? txs : [];
    quotes = Array.isArray(quotes) ? quotes : [];
    outbox = Array.isArray(outbox) ? outbox : [];
    ack = Array.isArray(ack) ? ack : [];
  }
  if (!market || !Array.isArray(market.signals)) market = S.market;
  if (
    (!localStorage.getItem(KEYS.feed) ||
      localStorage.getItem(KEYS.feed) === DEFAULT_FEED) &&
    String(market.meta?.date || market.meta?.asOf || "") < S.capturedAt
  )
    market = S.market;
  if (!localStorage.getItem("quantUpgradeBackupV05") && !storageError)
    write("quantUpgradeBackupV05", {
      capturedAt: new Date().toISOString(),
      transactions: txs,
      manualPrices: manual,
    });
  let view = location.hash.slice(1) || "today",
    calendarDay = Q.jakartaDate(),
    stage = "open",
    radarFilter = "All",
    datesFilter = "Active",
    radarSearch = "",
    detail = null,
    detailTab = "overview",
    chartIndex = null,
    journalSignal = "",
    riskInput = {
      capital: "10000000",
      riskPct: "1",
      allocationPct: "20",
      entry: "",
      target: "",
      stop: "",
      feePct: "0.25",
      move: "0",
    };
  const icons = {
    dates:
      '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 17h3"/>',
    today: '<path d="M3 10 12 3l9 7v11h-6v-7H9v7H3Z"/>',
    radar:
      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 7-7"/><circle cx="12" cy="12" r="1"/>',
    signals:
      '<path d="M5 4v16M12 4v16M19 4v16"/><rect x="3" y="7" width="4" height="7" rx="1"/><rect x="10" y="11" width="4" height="6" rx="1"/><rect x="17" y="5" width="4" height="6" rx="1"/>',
    portfolio:
      '<rect x="3" y="6" width="18" height="15" rx="3"/><path d="M8 6V3h8v3M3 12h18M10 12v3h4v-3"/>',
    risk: '<path d="M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7Z"/><path d="m8 12 3 3 5-6"/>',
    journal: '<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>',
    settings:
      '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    methodology:
      '<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4Zm16 0h-4a3 3 0 0 0-3 3M20 4v14h-3"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    alert: '<path d="m12 3 10 18H2ZM12 9v5M12 17h.01"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    refresh:
      '<path d="M20 7v5h-5M4 17v-5h5M20 12a8 8 0 0 0-14-5M4 12a8 8 0 0 0 14 5"/>',
  };
  const icon = (k) =>
    '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' +
    (icons[k] || icons.radar) +
    "</svg>";
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const num = (x) =>
    Q.n(x) === null
      ? "—"
      : Number(x).toLocaleString("id-ID", { maximumFractionDigits: 2 });
  const money = (x, c = "IDR") =>
    Q.n(x) === null
      ? "—"
      : (c === "IDR" ? "Rp" : c === "USD" ? "US$" : "") +
        Number(x).toLocaleString(c === "IDR" ? "id-ID" : "en-US", {
          maximumFractionDigits: c === "IDR" ? 0 : 2,
        });
  const percent = (x) =>
    Q.n(x) === null
      ? "—"
      : (Number(x) > 0 ? "+" : "") + Number(x).toFixed(2) + "%";
  const pctPlain = (x) => (Q.n(x) === null ? "—" : Number(x).toFixed(1) + "%");
  const tone = (x) => (Q.n(x) === null ? "" : x < 0 ? "negative" : "positive");
  const masked = (x) => (hide ? "••••••" : x);
  function date(v, short = false) {
    if (!v) return "Not recorded";
    const s = Q.dateOnly(v);
    if (!s) return esc(v);
    return new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      ...(!short ? { year: "numeric" } : {}),
    });
  }
  function timestamp(v) {
    if (!v) return "Not checked";
    const d = new Date(v);
    if (!Number.isFinite(+d)) return esc(v);
    return (
      d.toLocaleString("en-GB", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }) + " WIB"
    );
  }
  function dataAge(v) {
    const days = Q.calendarAge(v);
    return days === null
      ? "Date unavailable"
      : days === 0
        ? "Today"
        : days === 1
          ? "1 day old"
          : days + " days old";
  }
  function pill(text, c = "") {
    return `<span class="pill ${c}">${esc(text)}</span>`;
  }
  function notice(text, c = "") {
    return `<div class="notice ${c}">${icon(c === "error" ? "alert" : "clock")}<span>${text}</span></div>`;
  }
  function empty(title, text, action = "") {
    return `<div class="empty"><span class="empty-icon">${icon("radar")}</span><h3>${title}</h3><p>${text}</p>${action}</div>`;
  }
  function head(eyebrow, title, sub, action = "") {
    return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ""}</div>${action}</div>`;
  }
  function metric(label, value, sub = "", cls = "") {
    return `<div class="metric"><div class="label">${label}</div><div class="value ${cls}">${value}</div><small>${sub}</small></div>`;
  }
  function cells(items) {
    return `<div class="data-grid">${items.map(([l, v, sub]) => `<div class="data-cell"><span>${l}</span><strong>${v}</strong>${sub ? `<small>${sub}</small>` : ""}</div>`).join("")}</div>`;
  }
  function M() {
    return Q.model(
      market,
      research,
      localStorage.getItem(KEYS.feed) &&
        localStorage.getItem(KEYS.feed) !== DEFAULT_FEED
        ? null
        : S.legacy,
    );
  }
  function price(i) {
    return Q.priceFor(i, {
      quotes,
      checkedAt: checked,
      privatePositions,
      manualPrices: manual,
      signals: M().signals,
      radar: M().radar,
    });
  }
  function quoteNote(q) {
    if (q.value === null) return "No verified price available";
    if (q.kind === "quote") {
      const age = Date.now() - (Date.parse(q.checkedAt) || 0),
        stale = age > 30 * 60000;
      return `${esc(q.source)} · ${esc(q.delay)}${stale ? ' · <b class="amber-text">cached / recheck</b>' : ""}<br>Checked ${timestamp(q.checkedAt)} · trade time unavailable`;
    }
    return `${esc(q.source)} · ${q.asOf ? date(q.asOf) : "date not recorded"}`;
  }
  function safeText(value, fallback = "Not recorded") {
    return value == null || value === ""
      ? `<span class="muted">${fallback}</span>`
      : esc(value);
  }
  function activeSignals(m = M()) {
    return m.signals.filter((s) => String(s.status).toUpperCase() === "OPEN");
  }
  function activeWatch(m = M()) {
    return m.watchlist.filter(
      (w) =>
        !w.exitDate &&
        ![
          "CLOSED",
          "THESIS_INVALIDATED",
          "OPPORTUNITY_EXPIRED",
          "REPLACED",
          "REPLACED_BY_BETTER_SETUP",
          "ACTIVATED",
          "TRIGGERED",
        ].includes(String(w.status).toUpperCase()),
    );
  }
  function signalVersion(s) {
    return (
      s.version ||
      (/^Q1-|^W1-/.test(s.id) ? "Quant v1.0" : "Version not recorded")
    );
  }
  function connected() {
    return (
      !!localStorage.getItem(KEYS.url) && !!localStorage.getItem(KEYS.token)
    );
  }
  function rowDetails(i, type = "stock", label = "Explore research") {
    return `<button class="text-btn" data-detail="${esc(i)}" data-kind="${type}">${label} ↗</button>`;
  }
  function toast(text) {
    $("toast").textContent = text;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("toast").hidden = true), 5000);
  }
  function updateBar() {
    const asOf = market.meta?.date || market.meta?.asOf || S.capturedAt;
    const stale = Q.calendarAge(asOf) > 1;
    const qChecked = checked ? timestamp(checked) : "not connected";
    $("connectionBar").innerHTML =
      `<span><i class="status-dot ${stale ? "amber" : ""}"></i>${esc(syncStatus)} · ${date(asOf)}${stale ? " · " + dataAge(asOf) : ""}</span><span>${priceError ? '<i class="status-dot amber"></i>' + esc(priceError) : "Prices checked " + qChecked}</span>`;
  }
  function setView(next, replace = false) {
    const allowed = [
      "today",
      "radar",
      "signals",
      "dates",
      "portfolio",
      "risk",
      "journal",
      "methodology",
      "settings",
      "more",
    ];
    view = allowed.includes(next) ? next : "today";
    if (replace) history.replaceState(null, "", "#" + view);
    else if (location.hash !== "#" + view)
      history.pushState(null, "", "#" + view);
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function render() {
    calendarDay = Q.jakartaDate();
    updateBar();
    const labels = {
      today: "Today",
      radar: "Radar",
      signals: "Signals & watch",
      dates: "Crucial dates",
      portfolio: "My portfolio",
      risk: "Risk lab",
      journal: "Paper journal",
      methodology: "Methodology",
      settings: "Settings",
      more: "More",
    };
    $("pageName").textContent = labels[view] || "Today";
    document.querySelectorAll("nav button[data-view]").forEach((b) => {
      const active =
        b.dataset.view === view ||
        (b.dataset.view === "more" &&
          !["today", "radar", "signals", "dates", "portfolio"].includes(view) &&
          b.closest(".mobile-nav"));
      b.classList.toggle("active", active);
      b.setAttribute("aria-current", active ? "page" : "false");
    });
    const pages = {
      today: todayPage,
      radar: radarPage,
      signals: signalsPage,
      dates: datesPage,
      portfolio: portfolioPage,
      risk: riskPage,
      journal: journalPage,
      methodology: methodologyPage,
      settings: settingsPage,
      more: morePage,
    };
    $("main").innerHTML =
      (storageError ? notice(esc(storageError), "error") : "") +
      (pages[view] || todayPage)();
    bindPage();
  }
  function researchReadiness() {
    const m = M(),
      uni = m.universe.filter((r) => Q.truth(r.Active) && !r.Removed_Date),
      dates = m.radar
        .map((r) => Q.dateOnly(r.Date))
        .filter(Boolean)
        .sort(),
      latest = dates.at(-1) || "",
      screened = m.radar.filter(
        (r) =>
          Q.dateOnly(r.Date) === latest &&
          uni.some((u) => Q.key(u.Ticker) === Q.key(r.Ticker)),
      );
    return {
      uni,
      latest,
      screened,
      fundCount: m.fundamentals.filter((f) =>
        uni.some((u) => Q.key(u.Ticker) === Q.key(f.Ticker)),
      ).length,
    };
  }
  function readinessCard() {
    const r = researchReadiness();
    return `<div class="card"><div class="row card-title"><h2>Research coverage</h2>${pill("QUANT v1.1", "green")}</div><div class="pipeline-row"><span>IDX30 universe loaded</span><span class="num">${r.uni.length ? r.uni.length : "—"}<small class="tiny"> / 30</small></span></div><div class="pipeline-row"><span>Fundamental snapshots</span><span class="num">${r.fundCount}</span></div><div class="pipeline-row"><span>Names screened · ${r.latest ? date(r.latest, true) : "pending"}</span><span class="num">${r.screened.length}</span></div><p class="pipeline-note">${r.uni.length ? "Admission needs verified fundamentals, valuation, catalyst, technical support and R/R ≥ 2×." : "The research tables are ready. The first verified IDX30 research batch has not been populated."}</p><button class="text-btn" data-view="radar">Open the full radar →</button></div>`;
  }
  const eventStates = {
    upcoming: ["Upcoming", ""],
    "due-soon": ["Due soon", "amber"],
    today: ["Today", "green"],
    overdue: ["Overdue", "red"],
    triggered: ["Triggered · review", "lime"],
    completed: ["Completed", "green"],
    expired: ["Expired", ""],
    incomplete: ["Needs review", "amber"],
  };
  function datesNote() {
    if (researchBusy) return "Refreshing dates · cached items remain visible.";
    if (!research)
      return "Connect the read-only research adapter in Settings to load recorded dates.";
    if (!research.datesAvailable)
      return "The connected adapter does not yet expose Crucial Dates. Install the Dates adapter update, then refresh research.";
    return `Research read ${timestamp(research.fetchedAt)} · ${esc(researchStatus)}. Event review dates are shown separately.`;
  }
  function eventCondition(e) {
    const c = Q.currency(e.instrument),
      level = (v) => money(v, c);
    if (e.triggerType === "NONE")
      return "Calendar / lifecycle review · no price condition";
    if (
      e.triggerType === "BETWEEN" &&
      e.low !== null &&
      e.high !== null &&
      e.low <= e.high
    )
      return `Review whether price is within ${level(e.low)}–${level(e.high)}.`;
    if (e.triggerType === "AT_OR_BELOW" && e.high !== null)
      return `Review whether price is at or below ${level(e.high)}.`;
    if (e.triggerType === "AT_OR_ABOVE" && e.low !== null)
      return `Review whether price is at or above ${level(e.low)}.`;
    return "Price condition incomplete · verify the recorded trigger levels.";
  }
  function eventCard(e, compact = false) {
    const [label, color] = eventStates[e.state],
      m = M(),
      sourceURL = Q.validSourceURL(e.source),
      link = (id, type, exists) =>
        !id
          ? ""
          : exists
            ? rowDetails(id, type, esc(id))
            : `<span class="tiny">${esc(id)} · linked record unavailable</span>`,
      links =
        link(
          e.signal,
          "signal",
          m.signals.some((s) => s.id === e.signal),
        ) +
        link(
          e.watch,
          "watch",
          m.watchlist.some((w) => w.id === e.watch),
        ),
      source = sourceURL
        ? `<a href="${esc(sourceURL)}" target="_blank" rel="noopener noreferrer">${esc(e.source)} ↗</a>`
        : safeText(e.source),
      stamp = e.date ? new Date(e.date + "T12:00:00Z") : null;
    return `<article class="event-card event-${e.state} ${compact ? "event-compact" : ""}" data-event-id="${esc(e.id)}"><div class="event-date"><span>${stamp ? stamp.toLocaleDateString("en-GB", { month: "short" }) : "DATE"}</span><strong>${stamp ? stamp.getUTCDate() : "—"}</strong><small>${stamp ? stamp.getUTCFullYear() : "Pending"}</small></div><div class="event-body"><div class="event-top"><span class="label">${esc(e.instrument)} · ${esc(e.type.replace(/_/g, " "))}</span>${pill(e.countdown, color)}</div><h3>${esc(e.title)}</h3><p class="event-condition">${eventCondition(e)}</p><div class="chipline">${pill(label, color)}${e.reminder ? pill(e.reminder + " REVIEW") : ""}</div><div class="event-action"><span class="label">ACTION ON DUE DATE</span><p>${safeText(e.action, "Required review action not recorded.")}</p></div>${compact ? "" : `<details class="event-details"><summary>Why it matters & source</summary><div class="event-meta"><div><span class="label">WHY IT MATTERS</span><p>${safeText(e.why)}</p></div><div><span class="label">LINKED RESEARCH</span><div class="actions">${links || '<span class="muted">No linked item recorded</span>'}</div></div><div><span class="label">SOURCE / CHECKPOINT RULE</span><p>${source}</p></div><div><span class="label">REMINDER LEAD TIME</span><p>${e.lead === null ? "Not recorded · no advance reminder" : e.lead === 0 ? "On due date" : e.lead + " calendar day" + (e.lead === 1 ? "" : "s")}</p></div><div><span class="label">LAST REVIEWED</span><p>${date(e.reviewed)}</p></div><div><span class="label">PRIORITY / RECORDED STATUS</span><p>${esc(e.priority)} · ${esc(e.recordedStatus)}</p></div></div><p class="hint">${esc(e.id)} · ${date(e.date)} · Asia/Jakarta. A price condition is a review checkpoint, not a forecast or an automatic portfolio action.</p></details>`}</div></article>`;
  }
  function datesPreview(m) {
    const active = m.dates.filter(
        (e) => !e.terminal && e.state !== "incomplete",
      ),
      next = active.slice(0, 3);
    return `<section class="card dates-preview"><div class="row card-title"><h2>Crucial dates</h2><button class="text-btn" data-view="dates">All dates →</button></div><p class="hint">Nearest recorded reviews & catalysts · WIB</p>${next.length ? next.map((e) => eventCard(e, true)).join("") : `<div class="dates-empty"><h3>${m.dates.length ? "No active dated checkpoints" : "No sourced dates recorded yet"}</h3><p>No calendar or price-review date is inferred from a target. ${m.dates.length ? "Open Dates to review the archive or incomplete entries." : "Verified events will appear here when research adds them."}</p></div>`}<p class="tiny">${datesNote()}</p></section>`;
  }
  function datesPage() {
    const m = M(),
      active = m.dates.filter((e) => !e.terminal),
      list = m.dates.filter(
        (e) =>
          datesFilter === "All" ||
          (datesFilter === "Completed / expired"
            ? e.terminal
            : datesFilter === "Needs attention"
              ? ["overdue", "today", "triggered", "incomplete"].includes(
                  e.state,
                )
              : !e.terminal),
      );
    return (
      head(
        "YOUR RESEARCH CALENDAR",
        "Crucial dates & catalysts",
        "Know when to review — and what to check. Conditional levels are review criteria, never price forecasts.",
        `<button class="btn" data-action="research">${icon("refresh")} Refresh dates</button>`,
      ) +
      `<div class="dates-intro"><div class="dates-context"><span class="label">ASIA/JAKARTA</span><strong>${date(Q.jakartaDate())}</strong><span class="tiny">${datesNote()}</span></div><div class="dates-count"><strong>${active.length}</strong><span>active checkpoints</span></div></div><div class="filters"><div class="filter-pills dates-filters" role="group" aria-label="Dates filter">${["Active", "Needs attention", "Completed / expired", "All"].map((x) => `<button data-dates-filter="${x}" aria-pressed="${x === datesFilter}" class="${x === datesFilter ? "active" : ""}">${x}</button>`).join("")}</div><span class="tiny">Chronological · oldest unresolved first</span></div><div class="dates-list">${list.length ? list.map((e) => eventCard(e)).join("") : empty(m.dates.length ? "No checkpoints in this view" : "No sourced dates recorded yet", m.dates.length ? "Choose another filter to see the remaining records." : "Fixed corporate and macro calendars, price reviews and lifecycle checkpoints will appear once recorded with a source. No deadlines have been invented for existing v1.0 records.")}</div><div class="notice neutral spacer">${icon("clock")}<span><b>Review reminders, separate from trade decisions.</b> H-3 / H-1 / Today follow the recorded lead time; Triggered reflects a backend review. These are in-app indicators. Scheduled notifications are not enabled. Watch checkpoints do not start the 60-day clock; it starts only when a signal is activated.</span></div>`
    );
  }
  function todayPage() {
    const m = M(),
      s = activeSignals(m)[0],
      decision = s ? m.decisions[s.id] : null,
      observ = m.observations
        .filter((o) => o.Signal_ID === s?.id)
        .sort((a, b) => String(a.Date).localeCompare(String(b.Date)))
        .at(-1),
      r = researchReadiness(),
      feedDate = m.meta.date || m.meta.asOf;
    return (
      head(
        "YOUR DAILY RESEARCH DESK",
        "A clearer view. A steadier decision.",
        "Paper research and your private portfolio, with every decision kept in context.",
      ) +
      `<div class="today-grid"><div class="stack"><section class="card hero"><span class="hero-orbit"></span><div class="row"><div class="regime-banner">${pill("LATEST DAILY RESEARCH", "dark")}</div>${pill(m.regime.risk || "Risk not recorded", "lime")}</div><h2>${/NO ACTION/i.test(m.regime.takeaway || "") ? "Patience is a position." : esc(decision?.label || "Research before action.")}</h2><p>${esc(m.regime.takeaway || "No daily market decision is available. A quiet screen is not a completed screen.")}</p><div class="hero-bottom"><span>${date(feedDate)} · ${esc(m.meta.updatedAt || "timestamp unavailable")}<br>Historical paper record · ${esc(m.meta.version || "version unavailable")}</span><button class="text-btn" data-view="journal">Review the record →</button></div></section><div class="metrics" style="margin:0">${metric("Open paper signals", activeSignals(m).length, "Normally max. 5 equities")}${metric("Watch candidates", activeWatch(m).length, "Activation requires review")}${metric("Daily paper return", percent(m.scorecard.paperReturn), "As of " + date(m.scorecard.asOf || feedDate, true), tone(m.scorecard.paperReturn))}${metric("New framework", r.screened.length ? "In progress" : "Awaiting data", r.screened.length + " names screened · v1.1", "")}</div>${datesPreview(m)}<div class="section-head" style="margin:5px 0 -3px"><h2>On your decision desk</h2><button class="text-btn" data-view="signals">All signals →</button></div>${s ? signalCard(s, true) : empty("No open paper signals", "New signals appear only after research and admission checks.")}<div class="notice neutral" style="margin:0">${icon("lock")}<span><b>Three distinct decisions.</b> The locked paper signal preserves history. Today’s opportunity reflects the latest review. Your actual portfolio action stays private.</span></div></div><aside class="stack today-aside"><div class="card"><div class="row card-title"><h2>Market context</h2>${icon("radar")}</div><h3>${esc(m.regime.label || "No regime assessment")}</h3><div class="tiny" style="margin-top:7px">Research date · ${date(feedDate)}</div>${(m.regime.chips || []).map((c) => `<div class="macro-row"><div><div class="label">${esc(c.label)}</div><span class="tiny">${date(c.asOf || feedDate, true)}</span></div><strong>${esc(c.value)}</strong></div>`).join("")}<details><summary>What does this change?</summary><p>${esc(m.regime.takeaway || "No current assessment.")}</p><p>Context from the daily research feed. A fresh price check does not refresh this assessment.</p></details></div>${readinessCard()}<div class="card"><div class="row card-title"><h2>Your actual portfolio</h2>${icon("lock")}</div><p class="sub">${txs.length ? `${txs.length} private transaction${txs.length === 1 ? "" : "s"} on this device.` : "Add existing holdings to keep your own cost basis and decisions separate from the paper experiment."}</p><button class="btn full-width spacer" data-view="portfolio">Open private portfolio ${icon("arrow")}</button><p class="tiny spacer">${esc(privateStatus)}</p></div></aside></div>`
    );
  }
  function signalCard(s, compact = false) {
    const q = price(s.instrument),
      o = Q.opportunity(s, q.value, M().decisions[s.id]),
      h = Q.horizon(s, M().observations),
      closed = String(s.status).toUpperCase() !== "OPEN",
      p = closed ? Q.n(s.exitPrice) : q.value,
      ret = p !== null && s.entry ? (p / s.entry - 1) * 100 : null;
    return `<article class="card signal-card"><div class="row"><div class="signal-top"><span class="ticker-mark">${esc(String(s.instrument).slice(0, 4))}</span><div><div class="ticker-title">${esc(s.instrument)}</div><div class="tiny">${esc(s.id)} · ${esc(signalVersion(s))} · ${s.locked ? "locked" : "paper record"}</div></div></div>${pill(closed ? s.status : "OPEN PAPER", "green")}</div><div class="prices"><div><div class="label">LOCKED ENTRY</div><div class="value">${money(s.entry)}</div></div><div><div class="label">${closed ? "RECORDED EXIT" : "CURRENT / INDICATIVE"}</div><div class="value">${money(p)}</div></div><div><div class="label">${closed ? "EXIT RETURN" : "PRICE RETURN"}</div><div class="value ${tone(ret)}">${percent(ret)}</div></div></div><div class="tiny">${closed ? "Exit " + date(s.exitDate) : quoteNote(q)}</div><div class="divider"></div><div class="row tiny"><span>Created ${date(s.createdDate, true)}</span><span>${h.elapsed === null ? "Clock not recorded" : `${h.estimated ? "~" : ""}${h.elapsed} / ${h.total || "—"} ${h.estimated ? "weekdays" : "trading days"}`}</span></div><div class="progress"><span style="width:${h.elapsed !== null && h.total ? Math.min(100, (h.elapsed / h.total) * 100) : 0}%"></span></div><div class="row tiny"><span>${h.remaining === null ? "Horizon unavailable" : h.remaining + " remaining" + (h.estimated ? " · estimate" : " · recorded")}</span><span>As of ${date(h.asOf, true)}</span></div><div class="decision-note spacer"><div class="row wrap"><div class="label">TODAY’S OPPORTUNITY</div>${pill(o.mechanical, o.tone)}</div><strong style="font-size:12px">${esc(o.daily)}</strong><p>${esc(o.dailyReason)}</p><div class="tiny spacer">Daily review ${date(o.asOf, true)} · Price condition is mechanical</div></div><div class="row wrap spacer"><span class="tiny">Target <b>${money(s.target)}</b> · Invalidation <b>${money(s.stop)}</b></span>${rowDetails(s.id, "signal", "Why this stock?")}</div></article>`;
  }
  function lifecycle() {
    const m = M();
    return `<div class="lifecycle" aria-label="Research lifecycle">${[
      ["radar", "Radar", researchReadiness().screened.length + " screened"],
      ["watch", "Watch", activeWatch(m).length + " candidates"],
      ["open", "Open signal", activeSignals(m).length + " locked"],
      [
        "closed",
        "Closed",
        m.signals.filter((s) => s.status === "CLOSED").length + " signals",
      ],
    ]
      .map(
        ([k, l, v], i) =>
          `<button data-stage="${k}" class="${stage === k ? "active" : ""}"><span class="stage-number">0${i + 1}</span><span><b>${l}</b><small>${v}</small></span></button>`,
      )
      .join("")}</div>`;
  }
  function signalsPage() {
    const m = M();
    return (
      head(
        "THE LIFECYCLE",
        "Signals & watch",
        "A watch is a candidate. A signal starts its own clock only when activated.",
      ) +
      lifecycle() +
      (activeSignals(m).length > 5
        ? notice(
            "The normal five-signal cap is exceeded. Review the recorded exception; no record is changed automatically.",
            "error",
          )
        : "") +
      (stage === "watch"
        ? `<div class="grid-2">${activeWatch(m)
            .map((w) => watchCard(w))
            .join("")}</div>${
            m.watchlist.filter((w) => !activeWatch(m).includes(w)).length
              ? '<div class="section-head"><h2>Archived watch items</h2></div><div class="grid-2">' +
                m.watchlist
                  .filter((w) => !activeWatch(m).includes(w))
                  .map((w) => watchCard(w))
                  .join("") +
                "</div>"
              : ""
          }`
        : stage === "closed"
          ? m.signals.filter((s) => s.status !== "OPEN").length
            ? '<div class="grid-2">' +
              m.signals
                .filter((s) => s.status !== "OPEN")
                .map((s) => signalCard(s))
                .join("") +
              "</div>"
            : empty(
                "No closed signals yet",
                "Open paper records remain in the experiment until a recorded exit. A price touch alone does not silently close them.",
              )
          : '<div class="grid-2">' +
            activeSignals(m)
              .map((s) => signalCard(s))
              .join("") +
            "</div>") +
      notice(
        "Trading-day progress uses recorded Daily Observations when available. Without an exchange calendar, any weekday estimate is explicitly marked; no exact horizon end date is invented.",
        "neutral",
      )
    );
  }
  function watchCard(w) {
    const activated = ["ACTIVATED", "TRIGGERED"].includes(
        String(w.status).toUpperCase(),
      ),
      archived = !!w.exitDate || !activeWatch().some((x) => x.id === w.id);
    const q = price(w.instrument),
      t = Q.trigger(w, q.value),
      age = Q.calendarAge(w.createdDate),
      cur = Q.currency(w.instrument);
    return `<article class="card"><div class="row"><div class="signal-top"><span class="ticker-mark ${/gold/i.test(w.instrument) ? "gold" : ""}">${/gold/i.test(w.instrument) ? "Au" : esc(String(w.instrument).slice(0, 4))}</span><div><div class="ticker-title" style="font-size:17px">${esc(w.instrument)}</div><div class="tiny">${esc(w.id)} · ${esc(signalVersion(w))}</div></div></div>${pill(activated ? "ACTIVATED" : archived ? "ARCHIVED" : "WATCH", "amber")}</div><div class="prices grid-2 spacer"><div><div class="label">MONITORED TRIGGER</div><div class="value">${esc(w.trigger || "Not recorded")}</div></div><div><div class="label">CURRENT</div><div class="value">${money(q.value, cur)}</div></div></div><div class="tiny spacer">${quoteNote(q)}</div><div class="chipline">${pill(t.label, t.hit ? "amber" : "")}${pill(activated ? "ACTIVATION RECORDED" : archived ? "EXIT RECORDED" : "NOT ACTIVATED")}</div>${w.note ? `<p class="sub spacer">${esc(w.note)}</p>` : ""}<div class="divider"></div><div class="mini-stats"><div><div class="label">Added to watch</div><div class="sub">${date(w.createdDate)}</div></div><div><div class="label">Watch age</div><div class="sub">${age === null ? "Not recorded" : age + " calendar days"}</div></div><div><div class="label">Last review date</div><div class="sub">${date(w.lastReview)}</div></div><div><div class="label">Activation horizon</div><div class="sub">${w.horizon ? w.horizon + " trading days" : "Not set"}</div></div></div><p class="hint">${w.horizon ? "The " + w.horizon + "-day clock starts only after activation." : "No fixed signal horizon has been recorded."} ${w.exitDate ? "Exit " + date(w.exitDate) + ": " + esc(w.exitReason || "reason not recorded") : "Exit reason: " + esc(w.exitReason || "none recorded") + "."}</p>${rowDetails(w.id, "watch", "Thesis & lifecycle")}</article>`;
  }
  function radarRows() {
    const m = M(),
      r = researchReadiness(),
      latest = r.latest;
    return m.radar
      .filter((x) => Q.dateOnly(x.Date) === latest)
      .map((x) => {
        const old = m.radar
          .filter((y) => Q.key(y.Ticker) === Q.key(x.Ticker) && y.Date < x.Date)
          .sort((a, b) => String(a.Date).localeCompare(String(b.Date)))
          .at(-1);
        const change = !old
          ? "New"
          : Q.n(x.Research_Score) !== null && Q.n(old.Research_Score) !== null
            ? Q.n(x.Research_Score) > Q.n(old.Research_Score)
              ? "Improving"
              : Q.n(x.Research_Score) < Q.n(old.Research_Score)
                ? "Deteriorating"
                : "Unchanged"
            : "Unchanged";
        return { ...x, change };
      });
  }
  function radarPage() {
    const r = researchReadiness(),
      rows = radarRows();
    const filtered = rows.filter(
      (x) =>
        (radarFilter === "All" || x.change === radarFilter) &&
        (!radarSearch ||
          String(x.Ticker).toLowerCase().includes(radarSearch.toLowerCase())),
    );
    const intro = head(
      "QUANT v1.1 · DAILY SCREENING",
      "Research radar",
      "The full eligible IDX30 universe is re-screened each trading day. Fundamentals refresh when new disclosures arrive.",
      `<button class="btn" data-action="research">${icon("refresh")}Refresh</button>`,
    );
    const summary = `<div class="metrics" style="margin-top:0">${metric("Active universe", r.uni.length || "—", "IDX30 · verified membership required")}${metric("Fundamental files", r.fundCount, "Stored snapshots · not a BUY count")}${metric("Latest technical screen", r.screened.length, r.latest ? "As of " + date(r.latest, true) : "No screening date recorded")}${metric("Open equity signals", activeSignals().filter((s) => /Equity/i.test(s.assetClass || "Equity")).length, "Normally at most 5")}</div>`;
    const filters = `<div class="filters"><div class="filter-pills" role="group" aria-label="Radar filter">${["All", "New", "Improving", "Deteriorating"].map((x) => `<button data-radar-filter="${x}" class="${x === radarFilter ? "active" : ""}">${x}</button>`).join("")}</div><input id="radarSearch" class="search" aria-label="Search radar ticker" placeholder="Search ticker…" value="${esc(radarSearch)}"></div>`;
    let results = "";
    if (!rows.length)
      results = empty(
        "The next opportunity needs evidence.",
        "No Quant v1.1 screening rows have been recorded yet. This is an honest empty radar, not a completed “NO ACTION” screen.",
        `<button class="btn" data-view="methodology">See the admission rules ${icon("arrow")}</button>`,
      );
    else if (!filtered.length)
      results = empty("No matching names", "Try another ticker or filter.");
    else
      results =
        (r.screened.length < r.uni.length
          ? notice(
              "Coverage is incomplete. Only " +
                r.screened.length +
                " of " +
                r.uni.length +
                " loaded universe names have a row on the latest screening date.",
            )
          : "") +
        `<div class="grid-2">${filtered
          .map(
            (x) =>
              `<article class="card"><div class="row"><div><div class="ticker-title">${esc(x.Ticker)}</div><span class="tiny">${date(x.Date)} · ${esc(x.Trend || "Trend unavailable")}</span></div>${pill(x.change, x.change === "Improving" ? "green" : x.change === "Deteriorating" ? "red" : "blue")}</div><div class="chipline">${pill(x.Decision || "UNDER REVIEW")}${pill(x.Fundamental_Status || "FUNDAMENTALS UNVERIFIED", "amber")}</div><p class="sub spacer">${esc(x.Decision_Reason || "No decision rationale recorded.")}</p>${cells(
                [
                  ["Price", money(x.Current_Price)],
                  [
                    "Current R/R",
                    Q.rr(x.Current_Price, x.Target, x.Invalidation) === null
                      ? "—"
                      : Q.rr(x.Current_Price, x.Target, x.Invalidation).toFixed(
                          2,
                        ) + "×",
                  ],
                  [
                    "Research score",
                    Q.n(x.Research_Score) === null
                      ? "—"
                      : num(x.Research_Score),
                  ],
                ],
              )}${rowDetails(x.Ticker)}<p class="tiny">Price as of ${esc(x.Price_AsOf || "not recorded")} · ${esc(x.Technical_Source || "source missing")}</p></article>`,
          )
          .join("")}</div>`;
    const universe =
      `<div class="section-head"><h2>Universe register</h2><span class="tiny">${r.uni.length ? "Membership from the ledger" : "Awaiting official constituent list"}</span></div>` +
      (r.uni.length
        ? `<div class="card table-wrap"><table><thead><tr><th>Ticker</th><th>Company / sector</th><th>Verified</th><th>Snapshot</th></tr></thead><tbody>${r.uni.map((u) => `<tr><td>${rowDetails(u.Ticker, "stock", esc(u.Ticker))}</td><td>${esc(u.Company || "—")}<div class="tiny">${esc(u.Sector || "—")}</div></td><td>${date(u.Last_Verified, true)}</td><td>${M().fundamentals.some((f) => Q.key(f.Ticker) === Q.key(u.Ticker)) ? "Present" : "Pending"}</td></tr>`).join("")}</tbody></table></div>`
        : notice(
            "Universe membership is not inferred from historical holdings or a fixed list. Current constituents must be verified and loaded by the research process.",
            "neutral",
          ));
    return (
      intro +
      summary +
      (!research
        ? notice(
            'The research adapter is not connected yet. Public paper data and private sync still work. <button class="text-btn" data-view="settings">Check connection →</button>',
          )
        : "") +
      (research?.diagnostics?.length
        ? notice(esc(research.diagnostics.join(" · ")))
        : "") +
      filters +
      results +
      universe +
      '<p class="hint">“Improving” and “Deteriorating” compare recorded research scores with the previous available screen. No statistical win probability is implied.</p>'
    );
  }
  function portfolioPage() {
    const ps = Q.positions(txs, price),
      open = ps.items.filter((p) => p.qty > 0),
      currencies = [...new Set(ps.items.map((p) => p.currency))],
      localOnly = txs.filter(
        (t) => !ack.includes(t.id) && !outbox.some((p) => p.id === t.id),
      );
    return (
      head(
        "PRIVATE · YOUR COST BASIS",
        "My portfolio",
        "Your trades and AI portfolio reviews stay separate from the public paper experiment.",
        `<button class="btn primary" data-action="addTx">${icon("plus")}Transaction</button>`,
      ) +
      `<div class="row wrap spacer" style="margin-top:-5px;margin-bottom:20px"><div class="private-strip">${icon("lock")}<span>${esc(privateStatus)}${outbox.length ? " · " + outbox.length + " queued change(s)" : ""}</span></div><div class="actions"><button class="btn small" data-action="toggleHide">${hide ? "Show balances" : "Hide balances"}</button><button class="btn small" data-action="prices">↻ Prices</button><button class="btn small" data-action="privateSync">Sync</button></div></div>` +
      (ps.issues.length ? notice(esc(ps.issues.join(" · ")), "error") : "") +
      (localOnly.length
        ? notice(
            localOnly.length +
              " local transaction(s) have not been confirmed in the cloud. They have been preserved. " +
              `<button class="text-btn" data-action="uploadLocal">Review & upload local records</button>`,
          )
        : "") +
      (open.length
        ? `<div class="grid-2">${currencies
            .map((c) => {
              const all = ps.items.filter((p) => p.currency === c),
                list = all.filter((p) => p.qty > 0),
                missing = list.some((p) => p.value === null),
                total = list.reduce((a, p) => a + (p.value || 0), 0),
                cost = list.reduce((a, p) => a + p.cost, 0),
                unreal = list.reduce((a, p) => a + (p.unreal || 0), 0);
              return `<div class="card"><div class="row"><div class="label">${c === "UNKNOWN" ? "UNASSIGNED CURRENCY" : c} · ${missing ? "PRICED SUBTOTAL" : "HOLDINGS VALUE"}</div>${icon("lock")}</div><div class="portfolio-total">${masked(money(total, c))}</div>${cells(
                [
                  ["Cost basis", masked(money(cost, c))],
                  [
                    "Unrealized P/L",
                    masked(money(unreal, c)),
                    missing ? "Partial · missing prices" : "",
                  ],
                  [
                    "Realized P/L",
                    masked(
                      money(
                        all.reduce((a, p) => a + p.realized, 0),
                        c,
                      ),
                    ),
                  ],
                ],
              )}${missing ? '<p class="hint">Some holdings have no verified price. Their value is excluded from the subtotal.</p>' : ""}<div class="allocation-bar">${list
                .filter((p) => p.value !== null)
                .map(
                  (p, i) =>
                    `<span style="width:${total ? (p.value / total) * 100 : 0}%;background:${["#3e714b", "#93af6c", "#c0d4a0", "#8ab5a2", "#d0ba82"][i % 5]}"></span>`,
                )
                .join(
                  "",
                )}</div><div class="allocation-legend">${list.map((p, i) => `<span><i style="background:${["#3e714b", "#93af6c", "#c0d4a0", "#8ab5a2", "#d0ba82"][i % 5]}"></i>${esc(p.instrument)} ${hide ? "••" : p.value !== null && total ? Math.round((p.value / total) * 100) + "%" : "—"}</span>`).join("")}</div></div>`;
            })
            .join("")}</div>`
        : empty(
            "Give your holdings their own context.",
            "Record an Existing Holding using your total quantity and average cost, or add a new purchase with its decision source.",
            `<button class="btn primary" data-action="addTx">${icon("plus")}Add a transaction</button>`,
          )) +
      `<div class="section-head"><h2>Actual positions</h2><span class="tiny">Private actions · never published</span></div><div class="grid-2">${open
        .map((p) => {
          const s =
              M().signals.find((s) => p.links.includes(s.id)) ||
              activeSignals().find((s) => Q.key(s.instrument) === p.instrument),
            cloud = privatePositions.find(
              (x) => Q.key(x.instrument) === p.instrument,
            ),
            mech =
              s && s.status === "OPEN"
                ? Q.opportunity(s, p.current, null)
                : null;
          return `<article class="card"><div class="row"><div class="ticker-title">${esc(p.instrument)}</div>${pill("MY ACTUAL POSITION", "blue")}</div><p class="tiny spacer">${masked(num(p.qty))} shares / units · Average ${masked(money(p.avg, p.currency))}</p>${cells(
            [
              ["Current", masked(money(p.current, p.currency))],
              ["Unrealized P/L", masked(money(p.unreal, p.currency))],
              ["Return on cost", masked(percent(p.unrealPct))],
            ],
          )}<div class="tiny">${quoteNote(p.quote)}</div><div class="decision-note spacer"><div class="label">PORTFOLIO ACTION</div><strong style="font-size:13px">${esc(cloud?.aiAction || "AWAITING PRIVATE REVIEW")}</strong><p>${esc(cloud?.aiReason || "No private AI review is recorded. An open paper BUY is not an instruction for this holding.")}</p>${cloud?.aiAction ? '<p class="tiny">Private AI review · review date not supplied by v0.4. Quote updates do not establish review freshness.</p>' : ""}</div>${mech ? `<div class="chipline">${pill(mech.mechanical, mech.tone)}</div><p class="hint">${esc(mech.reason)}</p>` : ""}<div class="actions spacer"><button class="btn small" data-manual="${esc(p.instrument)}">Manual price</button>${Object.hasOwn(manual, p.instrument) ? `<button class="btn small" data-remove-manual="${esc(p.instrument)}">Clear manual</button>` : ""}${s ? rowDetails(s.id, "signal", "Linked paper signal") : ""}</div></article>`;
        })
        .join(
          "",
        )}</div><div class="section-head"><h2>Transaction history</h2><span class="tiny">${txs.length} records</span></div><div class="card">${
        txs.length
          ? [...txs]
              .sort((a, b) => String(b.date).localeCompare(String(a.date)))
              .map(
                (t) =>
                  `<div class="tx-card"><div><div class="row-start">${pill(t.action, t.action === "BUY" ? "green" : "amber")}<b>${esc(t.instrument)}</b><span class="tiny">${date(t.date, true)}</span></div><p>${masked(num(t.quantity))} ${esc(t.unit)} @ ${masked(money(t.price, Q.currency(t.instrument)))} · ${esc(t.source)}</p><p>${t.linkedSignal ? "Linked " + esc(t.linkedSignal) + " · " : ""}Fee ${masked(money(t.fee, Q.currency(t.instrument)))}${outbox.some((o) => o.id === t.id) ? " · Pending sync" : ""}</p></div><div class="actions"><button class="btn small" data-edit-tx="${esc(t.id)}">Edit</button><button class="btn small danger" data-delete-tx="${esc(t.id)}">Delete</button></div></div>`,
              )
              .join("")
          : '<p class="empty-inline">No transactions recorded. Closed-position realized results will remain in this history.</p>'
      }</div><p class="hint">Totals are grouped by known currency. Gold monitoring is XAU/USD per ounce, not a live local physical-gold redemption price.</p>`
    );
  }
  function chartHTML(obs) {
    const valid = obs
      .filter(
        (o) =>
          Q.n(o.Return_pct) !== null && Q.n(o.Benchmark_Return_pct) !== null,
      )
      .sort((a, b) => String(a.Date).localeCompare(String(b.Date)));
    if (valid.length < 2)
      return empty(
        "A chart needs actual observations.",
        "The chart appears after the research adapter supplies at least two Daily Observations. No price path is simulated here.",
      );
    const values = valid.flatMap((o) => [
        Q.n(o.Return_pct),
        Q.n(o.Benchmark_Return_pct),
      ]),
      low = Math.min(...values, 0) - 0.6,
      high = Math.max(...values, 0) + 0.6,
      x = (i) => 42 + (i / (valid.length - 1)) * 600,
      y = (v) => 20 + ((high - v) / (high - low)) * 175,
      line = (field) =>
        valid
          .map(
            (o, i) =>
              (i ? "L" : "M") +
              x(i).toFixed(2) +
              "," +
              y(Q.n(o[field])).toFixed(2),
          )
          .join(" ");
    chartIndex =
      chartIndex === null
        ? valid.length - 1
        : Math.min(valid.length - 1, chartIndex);
    const selected = valid[chartIndex];
    return `<div class="chart-legend"><span><i class="legend-dot" style="background:#3b7551"></i>Paper signal return</span><span><i class="legend-dot" style="background:#a6afa1"></i>Benchmark return</span></div><svg class="chart" viewBox="0 0 680 230" role="group" aria-label="Recorded paper returns by research run date">${[
      0, 1, 2, 3,
    ]
      .map((i) => {
        const v = low + ((high - low) * i) / 3;
        return `<path d="M42 ${y(v)}H642" stroke="#e9ede2" stroke-dasharray="3 5"/><text x="0" y="${y(v) + 4}">${v.toFixed(1)}%</text>`;
      })
      .join(
        "",
      )}<path d="${line("Benchmark_Return_pct")}" fill="none" stroke="#a6afa1" stroke-width="2" stroke-dasharray="6 4"/><path d="${line("Return_pct")}" fill="none" stroke="#3b7551" stroke-width="2.5"/>${valid.map((o, i) => `<g><circle cx="${x(i)}" cy="${y(o.Return_pct)}" r="${chartIndex === i ? 5 : 3}" fill="#3b7551"/><circle class="point" data-chart-point="${i}" cx="${x(i)}" cy="${y(o.Return_pct)}" r="15" fill="transparent" role="button" tabindex="0" aria-label="${date(o.Date)}, paper ${percent(o.Return_pct)}, benchmark ${percent(o.Benchmark_Return_pct)}"/></g>`).join("")}<text x="42" y="224">${date(valid[0].Date, true)}</text><text x="640" y="224" text-anchor="end">${date(valid.at(-1).Date, true)}</text></svg><div class="chart-detail" aria-live="polite"><span>${date(selected.Date)} · research run</span><b>Paper ${percent(selected.Return_pct)}</b><span>Benchmark ${percent(selected.Benchmark_Return_pct)}</span><span>Price ${money(selected.Price)}</span></div><p class="hint">Tap a point for exact values. These are recorded research observations, not an intraday price chart. Run dates can reference a previous market close; weekends may carry the same close.</p><details><summary>Selected observation & source</summary><p>${esc(selected.Notes || "No note recorded.")}</p><p>Source: ${esc(selected.Source || "not recorded")}</p></details>`;
  }
  function journalPage() {
    const m = M(),
      s = m.signals.find((s) => s.id === journalSignal) || m.signals[0],
      obs = m.observations.filter((o) => o.Signal_ID === s?.id),
      history = m.tables.History || [];
    return (
      head(
        "FORWARD TEST · PUBLIC PAPER",
        "The research record",
        "The scorecard uses scheduled daily observations. Live prices and your real trades do not rewrite it.",
      ) +
      `<div class="metrics" style="margin-top:0">${metric("Recorded paper return", percent(m.scorecard.paperReturn), "As of " + date(m.scorecard.asOf || m.meta.date, true), tone(m.scorecard.paperReturn))}${metric("Closed signals", m.scorecard.closed ?? "—", "No inference from unrealized results")}${metric("Win rate", m.scorecard.winRate == null ? "Not established" : pctPlain(m.scorecard.winRate), "No fabricated track record")}${metric("Expectancy", m.scorecard.expectancy == null ? "Not established" : percent(m.scorecard.expectancy), "Requires recorded closed outcomes")}</div><div class="card"><div class="row card-title"><h2>${s ? esc(s.instrument) + " · " + esc(s.id) : "Performance observations"}</h2>${pill("RECORDED DATA")}</div><label class="hint">Paper signal<select id="journalSignal">${m.signals.map((x) => `<option value="${esc(x.id)}" ${x.id === s?.id ? "selected" : ""}>${esc(x.instrument)} · ${esc(x.id)}</option>`).join("")}</select></label>${chartHTML(obs)}</div><div class="metrics">${metric("Alpha vs benchmark", percent(m.scorecard.alpha), "Recorded daily comparison", tone(m.scorecard.alpha))}${metric("Maximum drawdown", percent(m.scorecard.maxDrawdown), "Recorded scorecard only")}${metric("Profit factor", m.scorecard.profitFactor == null ? "Not established" : num(m.scorecard.profitFactor), "Closed outcomes required")}${metric("Benchmark return", percent(m.scorecard.benchmarkReturn), "Same recorded observation date")}</div>${notice(esc(m.scorecard.sampleWarning || "An early paper experiment is not an established track record. Judge recorded outcomes, drawdown and benchmark-relative results together."), "neutral")}<div class="section-head"><h2>Decision journal</h2><span class="tiny">Original dates & outcomes</span></div><div class="card">${
        history.length
          ? [...history]
              .reverse()
              .map(
                (h) =>
                  `<article class="journal-item"><div class="tiny">${date(h.Date)} · ${esc(h.Event_ID || "")}</div><h3>${esc(h.Event || "")}</h3><p>${esc(h.Outcome || "")}</p><details><summary>Research note</summary><p>${esc(h.Notes || "No additional note.")}</p></details></article>`,
              )
              .join("")
          : m.history?.length
            ? m.history
                .map(
                  (h) =>
                    `<article class="journal-item"><div class="tiny">${date(h.date)}</div><h3>${esc(h.text)}</h3></article>`,
                )
                .join("")
            : '<p class="empty-inline">Connect the research adapter to read the existing History tab.</p>'
      }</div>`
    );
  }
  function riskPage() {
    const opts = activeSignals();
    if (!riskInput.entry && opts.length) {
      const s = opts[0];
      riskInput.entry = String(price(s.instrument).value || s.entry || "");
      riskInput.target = String(s.target || "");
      riskInput.stop = String(s.stop || "");
    }
    return (
      head(
        "LOCAL SCENARIO · NOT AN ORDER",
        "Risk lab",
        "Test a hypothetical IDX equity position. Nothing here changes a signal or records a transaction.",
      ) +
      `<div class="grid-2"><div class="card"><div class="row card-title"><h2>Build a scenario</h2>${pill("HYPOTHETICAL", "blue")}</div><label>Use paper levels<select id="riskSignal"><option value="">Custom levels</option>${opts.map((s) => `<option value="${esc(s.id)}">${esc(s.instrument)} · ${esc(s.id)}</option>`).join("")}</select></label><div class="form-grid spacer">${[
        ["capital", "Available capital · IDR"],
        ["riskPct", "Risk budget · % of capital"],
        ["allocationPct", "Maximum allocation · %"],
        ["entry", "Hypothetical entry"],
        ["target", "Target scenario"],
        ["stop", "Invalidation scenario"],
        ["feePct", "Fee per side · %"],
      ]
        .map(
          ([k, l]) =>
            `<label>${l}<input data-risk="${k}" id="risk-${k}" type="number" step="any" min="0" value="${esc(riskInput[k])}"></label>`,
        )
        .join(
          "",
        )}</div><p class="hint">Quantity rounds down to whole 100-share lots. The smaller of the loss budget and allocation limit sets the maximum size. Fees apply on entry and exit.</p></div><div class="card"><div class="row card-title"><h2>What the risk allows</h2>${icon("risk")}</div><div id="riskResults"></div><label class="spacer">Price shock · <span id="moveLabel">${riskInput.move}%</span><input data-risk="move" type="range" min="-30" max="30" step="1" value="${riskInput.move}" aria-label="Simulated price shock"></label><div id="shockResult"></div><p class="hint">A stop is not a guaranteed execution price. Gaps, slippage, tax and illiquidity can make the loss larger. This tool does not estimate probability.</p></div></div>`
    );
  }
  function updateRisk() {
    if (!$("riskResults")) return;
    const result = Q.riskScenario(riskInput);
    $("moveLabel").textContent = riskInput.move + "%";
    if (!result) {
      $("riskResults").innerHTML = notice(
        "Enter positive capital and valid levels: invalidation below entry, target above entry; percentages between 0 and 100.",
      );
      $("shockResult").innerHTML = "";
      return;
    }
    const { qty, lots, cost, loss, gain, rr } = result;
    $("riskResults").innerHTML =
      `<div class="portfolio-total">${num(lots)} <span class="muted" style="font-size:16px;letter-spacing:0">lots</span></div><p class="sub">${num(qty)} shares · ${pctPlain(result.allocation)} of hypothetical capital</p>${cells(
        [
          ["Cash required", money(cost)],
          ["Loss at invalidation", money(-loss)],
          ["R/R after fees", rr === null ? "—" : rr.toFixed(2) + "×"],
        ],
      )}${qty === 0 ? notice("The budget is too small for one lot under these assumptions.") : ""}<div class="risk-chart"><div class="risk-row"><span>Target</span><div class="bar"><span style="width:${gain > 0 ? 100 : 0}%"></span></div><b>${money(gain)}</b></div><div class="risk-row"><span>Invalidation</span><div class="bar loss"><span style="width:${Math.min(100, (loss / Math.max(loss, Math.abs(gain), 1)) * 100)}%"></span></div><b>${money(-loss)}</b></div></div><div class="hint">${rr !== null && rr >= 2 ? "R/R ≥ 2× on these assumptions. The remaining admission gates still matter." : "Below the normal 2× R/R admission threshold, or no viable size."}</div>`;
    const shocked =
        Number(riskInput.entry) * (1 + Number(riskInput.move) / 100),
      pnl =
        (shocked - Number(riskInput.entry)) * qty -
        ((shocked + Number(riskInput.entry)) * qty * Number(riskInput.feePct)) /
          100;
    $("shockResult").innerHTML =
      `<div class="decision-note"><div class="label">HYPOTHETICAL EXIT · ${money(shocked)}</div><strong class="${tone(pnl)}">${money(pnl)}</strong><p>After modeled fees · ${percent((pnl / Number(riskInput.capital)) * 100)} of capital</p></div>`;
  }
  function methodologyPage() {
    return (
      head(
        "RESEARCH FRAMEWORK",
        "What earns a place here.",
        "Quant v1.1 applies prospectively. The original v1.0 signal and Day-1 watch records keep their original terms.",
      ) +
      `<div class="grid-2"><div class="card"><div class="row card-title"><h2>From radar to a decision</h2>${pill("v1.1", "green")}</div>${[
        [
          "01",
          "Verify the universe",
          "Use the current official IDX30 constituent list. Gold and USD/IDR remain separate macro watch items. Membership and verification dates must be recorded.",
        ],
        [
          "02",
          "Read the company first",
          "A verified fundamental snapshot is required before a new BUY. Primary evidence is issuer financial statements, IDX filings, official IR material and disclosures. News and analyst reports are cross-checks.",
        ],
        [
          "03",
          "Refresh the right evidence",
          "Update fundamentals when results or material disclosures change. Every trading day, screen the full eligible universe for trend, volume, 20/50/200DMA, relative strength, RSI, ATR, support/resistance, 52-week position and abnormal behaviour where reliable data exist.",
        ],
        [
          "04",
          "Make the numbers reconstructable",
          "Store low/base/high fair value. Banks use P/B–ROE, cost of equity and DDM logic; other sectors use appropriate P/E, EV/EBITDA, FCF, DCF or SOTP. Record the target bridge and both thesis and price invalidation.",
        ],
        [
          "05",
          "Admit selectively",
          "A normal BUY needs verified fundamentals, valuation support, a credible catalyst, an acceptable technical setup and current R/R ≥ 2×. Normally at most five concurrent equity paper BUYs. NO ACTION is valid after screening.",
        ],
      ]
        .map(
          ([n, t, p]) =>
            `<div class="method-step"><span>${n}</span><div><h3>${t}</h3><p>${p}</p></div></div>`,
        )
        .join(
          "",
        )}</div><div class="stack"><div class="card"><h2>The three decisions</h2>${[
        [
          "Locked Paper Signal",
          "The original entry, target, invalidation, thesis, created date and horizon form the experiment’s historical record. Actual trades do not rewrite them.",
        ],
        [
          "Today’s Opportunity",
          "A daily research judgment, with its own date. A price crossing a level is a mechanical warning and cannot silently activate a BUY or close a signal.",
        ],
        [
          "My Actual Position",
          "Your private cost basis, quantity and portfolio review. A signal can be attractive for the experiment while adding to your personal position is inappropriate.",
        ],
      ]
        .map(
          ([t, p]) =>
            `<div class="detail-section"><h3>${t}</h3><p>${p}</p></div>`,
        )
        .join(
          "",
        )}</div><div class="card"><h2>What the clock means</h2><p class="sub spacer">A watch records its created date, age, latest review and exit reason. Its 60-trading-day horizon starts only when a new signal is activated. New names can enter the radar every day.</p><p class="sub spacer">Signal progress uses the latest recorded trading-day count. Weekday estimates are labeled. An exact expiry date requires a verified exchange calendar.</p></div><div class="card"><h2>Evidence, not certainty</h2><p class="sub spacer">Research scores and legacy confidence scores are not calibrated win probabilities. Missing data stay missing. A high R/R near invalidation does not mean a higher chance of success.</p><p class="sub spacer">This interface reads the research process. Opening or refreshing the app does not conduct a new fundamental analysis or guarantee the daily research job ran.</p></div></div></div>`
    );
  }
  function settingsPage() {
    return (
      head(
        "CONNECTIONS & DEVICE",
        "Settings",
        "Your existing endpoint, token, transactions and public feed remain in place.",
      ) +
      `<div class="settings-grid"><section class="card"><div class="row card-title"><h2>Private sync</h2>${pill(connected() ? "CONFIGURED" : "DEVICE ONLY", connected() ? "green" : "")}</div><p class="sub">${esc(privateStatus)}</p><label>Apps Script web app URL<input id="privateUrl" type="url" value="${esc(localStorage.getItem(KEYS.url) || "")}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></label><label>Private token<input id="privateToken" type="password" placeholder="${localStorage.getItem(KEYS.token) ? "Saved on this device · leave blank to keep" : "Paste your existing token"}" autocomplete="off" spellcheck="false"></label><div class="actions"><button class="btn primary" data-action="savePrivate">Connect & Sync</button><button class="btn" data-action="privateSync">Sync private now</button></div><details><summary>Token transfer tools</summary><p>Your existing token remains valid. A QR is generated locally, with no external QR service.</p><div class="actions"><button class="btn small" data-action="copyToken">Copy token</button><button class="btn small" data-action="qr">Show QR</button><button class="btn small" data-action="downloadToken">Download token.txt</button></div><button class="warning-link" data-action="generateToken">Generate a new token</button></details><p class="hint">Keep the token out of GitHub and the public feed. Delete any transfer file when setup is finished.</p></section><section class="card"><div class="row card-title"><h2>Quant v1.1 research</h2>${pill(research ? "DATA CONNECTED" : "ADAPTER NEEDED", research ? "green" : "amber")}</div><p class="sub">${esc(researchStatus)}${research?.fetchedAt ? " · read " + timestamp(research.fetchedAt) : ""}</p><div class="pipeline-row"><span>Universe / Fundamentals / Radar / Sources / Dates</span><span>Read only</span></div><div class="pipeline-row"><span>Private actual portfolio in public feed</span><span>Never</span></div><div class="actions"><button class="btn" data-action="research">Refresh research details</button></div><details><summary>One-time backend addition</summary><p>The release includes backend/QuantResearch.gs. Add it as a separate Apps Script file. Insert its one-line research dispatcher at the start of your existing doPost(e), then deploy a new version of the existing deployment. Keep Code.gs, the token and the URL.</p><p>Crucial Dates is already present in the Master Ledger. No setup function is required. Without the adapter, the app retains the existing public feed, private sync and prices.</p></details></section><section class="card"><h2>Public paper feed</h2><p class="hint">Only non-sensitive market and paper records. Your actual holdings are never added to this feed.</p><label>Published CSV URL<input id="feedUrl" type="url" value="${esc(localStorage.getItem(KEYS.feed) || DEFAULT_FEED)}"></label><div class="actions"><button class="btn primary" data-action="saveFeed">Save & sync</button><button class="btn" data-action="publicSync">Refresh public feed</button></div><p class="hint">${esc(syncStatus)}</p></section><section class="card"><h2>Prices & privacy</h2><div class="setting-line"><div><h3>Price auto-refresh</h3><p>Only while the app is visible</p></div><select id="autoPrices" aria-label="Price auto refresh"><option value="0" ${auto === 0 ? "selected" : ""}>Off</option><option value="5" ${auto === 5 ? "selected" : ""}>Every 5 minutes</option><option value="15" ${auto === 15 ? "selected" : ""}>Every 15 minutes</option></select></div><div class="setting-line"><div><h3>Balance visibility</h3><p>On this device</p></div><button class="btn small" data-action="toggleHide">${hide ? "Show balances" : "Hide balances"}</button></div><p class="hint">Google Finance quotes may be delayed. “Checked” is the time the app received the response, not the trade timestamp. A sheet recalculation timestamp is not proof of a new trade.</p><button class="btn" data-action="prices">↻ Refresh prices</button></section><section class="card"><h2>Private backup</h2><p class="hint">Backup exports contain private transactions and manual prices, never your token or endpoint. Imports merge by transaction ID instead of replacing your portfolio.</p><div class="actions"><button class="btn" data-action="export">Export backup</button><label class="btn" style="margin:0;display:block">Import backup<input id="importBackup" type="file" accept=".json,application/json" style="position:absolute;width:1px;height:1px;opacity:0;padding:0;min-height:0"></label></div><div class="actions"><button class="text-btn" data-action="uploadLocal">Upload preserved local changes</button></div></section><section class="card"><div class="row"><h2>App & data health</h2>${pill("APP v0.5")}</div><div class="pipeline-row"><span>Paper methodology</span><span>v1.0 history + v1.1</span></div><div class="pipeline-row"><span>Pending local changes</span><span>${outbox.length}</span></div><div class="pipeline-row"><span>Feed diagnostics</span><span>${market.diagnostics?.length || 0}</span></div><p class="hint">${esc((market.diagnostics || []).join(" "))}</p><div class="actions"><button class="btn" data-action="update">Check app update</button><button class="btn" data-action="recovery">Export storage recovery</button></div><details><summary>Local reset</summary><p>Cloud data is kept. This only clears device transactions, manual prices and cached private positions after confirmation. It preserves your connection settings.</p><button class="btn danger" data-action="clearLocal">Clear local portfolio</button></details></section></div>`
    );
  }
  function morePage() {
    return (
      head(
        "YOUR WORKSPACE",
        "More",
        "Research tools, records and connections.",
      ) +
      `<div class="more-list">${[
        [
          "risk",
          "Risk lab",
          "Size a hypothetical position and stress the downside",
        ],
        [
          "journal",
          "Paper journal",
          "Recorded observations and decision history",
        ],
        ["methodology", "Methodology", "What earns a BUY under Quant v1.1"],
        ["settings", "Settings", "Private sync, prices, backups and updates"],
      ]
        .map(
          ([v, t, d]) =>
            `<button class="more-link" data-view="${v}"><span><b>${t}</b><small>${d}</small></span>${icon(v)}</button>`,
        )
        .join(
          "",
        )}</div><p class="hint spacer">App v0.5 · Historical Quant v1.0 + prospective Quant v1.1</p>`
    );
  }
  function detailData() {
    const m = M(),
      s =
        detail.kind === "signal"
          ? m.signals.find((s) => s.id === detail.id)
          : null,
      w =
        detail.kind === "watch"
          ? m.watchlist.find((w) => w.id === detail.id)
          : null,
      i = s?.instrument || w?.instrument || detail.id,
      f = m.fundamentals.find((f) => Q.key(f.Ticker) === Q.key(i)),
      r = radarRows().find((r) => Q.key(r.Ticker) === Q.key(i)),
      u = m.universe.find((u) => Q.key(u.Ticker) === Q.key(i)),
      sources = m.sources.filter((s) => Q.key(s.Ticker) === Q.key(i)),
      q = price(i);
    return { m, s, w, i, f, r, u, sources, q };
  }
  function openDetail(id, kind = "stock") {
    detail = { id, kind };
    detailTab = "overview";
    renderDetail();
    $("detailDialog").showModal();
  }
  function renderDetail() {
    if (!detail) return;
    const { m, s, w, i, f, r, u, sources, q } = detailData(),
      item = s || w || {},
      legacy = s || w ? signalVersion(item) : "Quant v1.1";
    $("detailHeader").innerHTML =
      `<div><div class="eyebrow">${esc(legacy)} · ${s ? "LOCKED PAPER SIGNAL" : w ? "WATCH CANDIDATE" : "RESEARCH FILE"}</div><h2>${esc(i)}${u?.Company ? ' <span class="tiny">' + esc(u.Company) + "</span>" : ""}</h2></div><button class="icon-btn" data-close="detailDialog" aria-label="Close research detail">×</button>`;
    const tabs = `<div class="tabs" aria-label="Stock research sections">${[
      ["overview", "Thesis & value"],
      ["fundamental", "Fundamentals"],
      ["technical", "Technicals"],
      ["sources", "Sources"],
    ]
      .map(
        ([k, l]) =>
          `<button data-detail-tab="${k}" class="${detailTab === k ? "active" : ""}">${l}</button>`,
      )
      .join("")}</div>`;
    let body = "";
    if (detailTab === "overview") {
      const low = s?.fairLow ?? Q.n(f?.Fair_Value_Low),
        base = s?.fairBase ?? Q.n(f?.Fair_Value_Base),
        high = s?.fairHigh ?? Q.n(f?.Fair_Value_High),
        h = s ? Q.horizon(s, m.observations) : null,
        hasVal =
          [low, base, high].every((x) => Q.positive(x) !== null) &&
          low <= base &&
          base <= high;
      body = `${s && signalVersion(s).includes("v1.1") && !f ? notice("This v1.1 signal has no fundamental snapshot. Its admission evidence is incomplete; review the research record.", "error") : ""}<div class="chipline" style="margin-top:0">${pill(item.status || r?.Decision || "RESEARCH PENDING")}${pill(item.id || "UNACTIVATED")}${s ? pill("ORIGINAL TERMS PRESERVED", "green") : ""}</div><div class="detail-section"><h3>Why this stock?</h3><p>${safeText(item.thesis || f?.Quality_Assessment, "No verified thesis is recorded yet.")}</p></div>${
        s
          ? cells([
              ["Created", date(s.createdDate)],
              [
                "Signal clock",
                h.elapsed === null
                  ? "Not recorded"
                  : `${h.estimated ? "~" : ""}${h.elapsed} / ${h.total || "—"} days`,
                h.estimated
                  ? "Weekday estimate; holidays not verified"
                  : "Recorded trading-day count",
              ],
              [
                "Remaining",
                h.remaining === null ? "Not recorded" : h.remaining + " days",
                "As of " + date(h.asOf, true),
              ],
              ["Locked entry", money(s.entry)],
              ["Locked target", money(s.target)],
              ["Price invalidation", money(s.stop)],
            ]) +
            `<p class="hint">${s.exitDate ? "Closed on " + date(s.exitDate) : "Exact calendar end: not recorded. A verified exchange calendar is needed."} Confidence score ${s.confidence == null ? "not recorded" : num(s.confidence) + "/100"} is not a win probability.</p>`
          : w
            ? cells([
                ["Added", date(w.createdDate)],
                ["Watch age", Q.calendarAge(w.createdDate) + " calendar days"],
                ["Last review", date(w.lastReview)],
                ["Trigger", esc(w.trigger || "Not recorded")],
                [
                  "Clock",
                  w.horizon
                    ? w.horizon + " days after activation"
                    : "No fixed horizon",
                ],
                ["Exit reason", esc(w.exitReason || "None recorded")],
              ]) +
              notice(
                ["ACTIVATED", "TRIGGERED"].includes(
                  String(w.status).toUpperCase(),
                )
                  ? "Activation is recorded. The linked signal has its own clock; its ID must be traced in the ledger."
                  : "This watch item has not started a signal horizon. Activation creates a separate signal and created date.",
                "neutral",
              )
            : ""
      }<div class="detail-section"><h3>Valuation range</h3>${hasVal ? `<div class="range-bar"></div><div class="range-labels"><span>Low<br><b>${money(low)}</b></span><span>Base<br><b>${money(base)}</b></span><span>High<br><b>${money(high)}</b></span></div><p class="hint">${esc(f?.Valuation_Method || "Signal fair-value range")} · valuation as of ${date(f?.Valuation_AsOf)} · financial period ${esc(f?.Fiscal_Period || "not recorded")}${s && s.fairBase == null ? " · current snapshot, not original signal valuation" : ""}</p>` : empty("Fair value not recorded", "Low / base / high values must come from verified sector-specific research. Existing targets are not relabeled as fair value.")}</div><div class="detail-section"><h3>How the target is derived</h3><p>${safeText(s?.targetDerivation || r?.Target_Derivation, legacy.includes("v1.0") ? "The original v1.0 record does not store a contemporaneous derivation. No formula has been backfilled." : "Awaiting the formula and bridge from fair value to the signal horizon.")}</p></div><div class="detail-section"><h3>What invalidates the idea?</h3><p>${safeText(s?.invalidationDerivation || r?.Invalidation_Derivation, "The derivation is not recorded. A price level alone is not a documented fundamental invalidation thesis.")}</p></div><div class="grid-2"><div class="decision-note"><div class="label">CATALYST / RERATING PATH</div><p>${safeText(s?.catalysts || r?.Catalyst)}</p></div><div class="decision-note"><div class="label">KEY RISKS</div><p>${safeText(s?.risks || r?.Key_Risk)}</p></div></div>${s ? `<div class="detail-section"><h3>Today’s opportunity · separate from the lock</h3>${pill(Q.opportunity(s, q.value, m.decisions[s.id]).mechanical, "amber")}<p class="spacer">${safeText(m.decisions[s.id]?.reason, "No daily review recorded.")}</p><p>Review ${date(m.decisions[s.id]?.asOf)} · Current R/R ${Q.rr(q.value, s.target, s.stop) === null ? "unavailable" : Q.rr(q.value, s.target, s.stop).toFixed(2) + "×"}. High R/R near a stop is not a probability estimate.</p><button class="btn spacer" data-simulate="${esc(s.id)}">Explore this in Risk lab ${icon("arrow")}</button></div>` : ""}`;
    } else if (detailTab === "fundamental") {
      body = f
        ? `<div class="row wrap">${pill(f.Fiscal_Period || "PERIOD MISSING", "green")}<span class="tiny">Snapshot updated ${date(f.Last_Updated)} · ${dataAge(f.Last_Updated)}</span></div><p class="hint">Report date ${date(f.Report_Date)} · ${esc(f.Source_Type || "Source type missing")}<br>Freshness requires checking for new disclosures; age alone does not certify currency.</p>${cells(
            [
              ["Net income", num(f.Net_Income)],
              ["EPS", num(f.EPS)],
              ["ROE", pctPlain(f.ROE_pct)],
              ["ROA", pctPlain(f.ROA_pct)],
              ["Growth YoY", pctPlain(f.Growth_YoY_pct)],
              ["Margin / NIM", pctPlain(f.Margin_or_NIM_pct)],
              ["CASA", pctPlain(f.CASA_pct)],
              ["NPL", pctPlain(f.NPL_pct)],
              ["LAR", pctPlain(f.LAR_pct)],
              ["Cost of credit", pctPlain(f.CoC_pct)],
              ["CAR", pctPlain(f.CAR_pct)],
              ["Debt / equity", num(f.Debt_to_Equity)],
              ["Operating cash flow", num(f.CFO)],
              ["Free cash flow", num(f.FCF)],
              ["Net debt", num(f.Net_Debt)],
            ],
          )}<p class="hint">Financial amounts are shown as recorded. Reporting units must be documented in the source / assumptions; no scale is inferred.</p>${[
            ["Quality", f.Quality_Assessment],
            ["Growth", f.Growth_Assessment],
            ["Balance sheet", f.Balance_Sheet_Assessment],
            ["Earnings durability", f.Earnings_Durability],
            ["Governance & events", f.Governance_Event_Risk],
            ["Valuation method", f.Valuation_Method],
            ["Assumptions", f.Assumptions],
            ["Sector KPIs", f.Other_Sector_KPIs],
          ]
            .map(
              ([l, v]) =>
                `<div class="detail-section"><h3>${l}</h3><p>${safeText(v)}</p></div>`,
            )
            .join("")}`
        : empty(
            "Verified fundamentals are pending",
            "The current Fundamental Snapshot table has no record for this stock. New Quant v1.1 BUY eligibility is not established.",
          );
      body += `<div class="detail-section"><h3>Admission evidence</h3>${[
        ["Fundamental verification", r?.Fundamental_Status],
        ["Valuation support", r?.Valuation_Status],
        ["Catalyst / rerating path", r?.Catalyst],
        ["Technical setup", r?.Trend],
        [
          "Current R/R ≥ 2×",
          Q.rr(q.value, r?.Target || s?.target, r?.Invalidation || s?.stop) ===
          null
            ? null
            : Q.rr(
                q.value,
                r?.Target || s?.target,
                r?.Invalidation || s?.stop,
              ).toFixed(2) + "×",
        ],
        ["Daily decision", r?.Decision],
      ]
        .map(
          ([l, v]) =>
            `<div class="gate"><span class="gate-marker">${v ? "◦" : "—"}</span><div>${l}<small>${esc(v || "No evidence recorded")}</small></div></div>`,
        )
        .join(
          "",
        )}<p class="hint">These are recorded research inputs. Presence of a value does not automatically verify it or admit a new BUY.</p></div>`;
    } else if (detailTab === "technical") {
      body = r
        ? `<div class="row wrap">${pill(r.Trend || "TREND UNAVAILABLE", "blue")}<span class="tiny">Screen ${date(r.Date)} · ${dataAge(r.Date)}</span></div>${cells(
            [
              ["Recorded price", money(r.Current_Price)],
              ["20 DMA", num(r.MA20)],
              ["50 DMA", num(r.MA50)],
              ["200 DMA", num(r.MA200)],
              ["RSI (14)", num(r.RSI14)],
              ["ATR (14)", num(r.ATR14)],
              ["RS vs IHSG", safeText(r.Relative_Strength_vs_IHSG)],
              ["RS vs sector", safeText(r.Relative_Strength_vs_Sector)],
              ["Volume", safeText(r.Volume_Signal)],
              ["Support", safeText(r.Support)],
              ["Resistance", safeText(r.Resistance)],
              [
                "52-week position",
                r.Position_52W_pct == null
                  ? "Not recorded"
                  : pctPlain(r.Position_52W_pct),
              ],
            ],
          )}<div class="detail-section"><h3>Abnormal price / volume behaviour</h3><p>${safeText(r.Abnormal_Behaviour)}</p></div><p class="hint">Price as of ${esc(r.Price_AsOf || "not recorded")} · Technical source ${esc(r.Technical_Source || "not recorded")}. A quote refresh does not recalculate these technical indicators.</p>`
        : empty(
            "No verified technical snapshot",
            "No DMA, RSI, ATR or relative-strength figures are available yet. This app will not derive indicators from a handful of paper observations.",
          );
      body += `<div class="decision-note spacer"><div class="label">CURRENT PRICE LAYER</div><strong>${money(q.value, Q.currency(i))}</strong><p>${quoteNote(q)}</p></div>`;
    } else {
      body = sources.length
        ? sources
            .map((source) =>
              sourceCard(
                source.Title,
                source.URL_or_Ref,
                `${source.Primary_or_Secondary || "Classification missing"} · ${source.Source_Type || ""} · ${source.Period_or_Event_Date || source.Date || ""}`,
                source.Used_For,
              ),
            )
            .join("")
        : empty(
            "Source register is empty",
            "Primary source documents and their periods will appear here as the research process populates Research Sources.",
          );
      if (f?.Source_URL_or_Ref)
        body += sourceCard(
          "Fundamental snapshot source",
          f.Source_URL_or_Ref,
          f.Source_Type || "",
          f.Fiscal_Period,
        );
      if (item.sourceRefs)
        body += `<div class="detail-section"><h3>Original source references</h3><p>${esc(item.sourceRefs)}</p></div>`;
      body += `<p class="hint">Issuer statements, IDX filings, official IR releases and material disclosures take priority. Analyst targets and news do not substitute for company-reported evidence.</p>`;
    }
    $("detailBody").innerHTML = tabs + body;
    bindDetail();
  }
  function sourceCard(title, url, meta, used) {
    const valid = Q.validSourceURL(url);
    return valid
      ? `<a class="source-link" href="${esc(valid)}" target="_blank" rel="noopener noreferrer">${esc(title || "Source document")} ↗<small>${esc(meta || "")} · ${esc(used || "")}</small></a>`
      : `<div class="source-link">${esc(title || "Source reference")}<small>${esc(meta || "")} · ${esc(url || "No URL recorded")} · ${esc(used || "")}</small></div>`;
  }
  function savePrivateState() {
    if (storageError) return false;
    const state = { transactions: txs, outbox, ack, manualPrices: manual };
    try {
      localStorage.setItem("quantPendingCommitV5", JSON.stringify(state));
      localStorage.setItem(KEYS.tx, JSON.stringify(txs));
      localStorage.setItem(KEYS.outbox, JSON.stringify(outbox));
      localStorage.setItem(KEYS.ack, JSON.stringify(ack));
      localStorage.setItem(KEYS.manual, JSON.stringify(manual));
      localStorage.removeItem("quantPendingCommitV5");
      return true;
    } catch {
      storageError =
        "Storage could not complete the save. A recovery copy was kept if space allowed. Export recovery before closing.";
      toast(storageError);
      return false;
    }
  }
  function enqueueOp(id, action) {
    outbox = outbox.filter((o) => o.id !== id);
    outbox.push({
      id,
      action,
      revision: crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() + "-" + Math.random().toString(16).slice(2),
    });
  }
  function privateRequest(action, payload = {}) {
    const task = () =>
      new Promise((resolve, reject) => {
        const url = localStorage.getItem(KEYS.url),
          token = localStorage.getItem(KEYS.token);
        if (!Q.validEndpoint(url) || !token)
          return reject(
            Error("Valid Apps Script /exec endpoint and saved token required."),
          );
        const bytes = new Uint8Array(20);
        crypto.getRandomValues(bytes);
        const requestId =
            "R-" +
            [...bytes].map((x) => x.toString(16).padStart(2, "0")).join(""),
          iframe = document.createElement("iframe"),
          form = document.createElement("form");
        iframe.name = requestId;
        iframe.title = "Private sync response";
        iframe.hidden = true;
        form.method = "POST";
        form.action = url;
        form.target = requestId;
        form.hidden = true;
        for (const [k, v] of Object.entries({
          action,
          token,
          requestId,
          payload: JSON.stringify(payload),
        })) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = k;
          input.value = v;
          form.appendChild(input);
        }
        let timer;
        const clean = () => {
          clearTimeout(timer);
          window.removeEventListener("message", listener);
          form.remove();
          iframe.remove();
        };
        const listener = (e) => {
          const d = e.data;
          if (
            !Q.validGoogleOrigin(e.origin) ||
            !d ||
            d.source !== "ai-quant-private-sync" ||
            d.requestId !== requestId
          )
            return;
          clean();
          d.ok ? resolve(d) : reject(Error(d.error || "Private sync error"));
        };
        window.addEventListener("message", listener);
        document.body.append(iframe, form);
        timer = setTimeout(() => {
          clean();
          reject(
            Error(
              "Private sync timeout. Check the existing Apps Script deployment.",
            ),
          );
        }, 30000);
        form.submit();
      });
    const result = transport.then(task, task);
    transport = result.catch(() => {});
    return result;
  }
  function cachePrices(result) {
    if (Array.isArray(result.livePrices)) {
      quotes = result.livePrices.filter(
        (q) => q && typeof q.instrument === "string",
      );
      write(KEYS.quotes, quotes);
    }
    if (result.priceCheckedAt) {
      checked = String(result.priceCheckedAt);
      localStorage.setItem(KEYS.checked, checked);
    }
    if (Array.isArray(result.positions)) {
      privatePositions = result.positions;
      write(KEYS.positions, privatePositions);
    }
    priceError = "";
  }
  async function syncPublic() {
    if (feedBusy) return;
    feedBusy = true;
    syncStatus = "Checking public research";
    updateBar();
    const ctrl = new AbortController(),
      timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const u = localStorage.getItem(KEYS.feed) || DEFAULT_FEED,
        res = await fetch(u, { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) throw Error("Feed not available");
      const fresh = Q.parseFeed(await res.text());
      market = fresh;
      write(KEYS.market, market);
      syncStatus = "Public research synced";
    } catch {
      syncStatus = "Cached research · refresh failed";
    } finally {
      clearTimeout(timer);
      feedBusy = false;
      renderIfIdle();
    }
  }
  async function syncPrivate() {
    if (privateBusy) return;
    if (!connected()) {
      privateStatus = "Device only · private sync not configured";
      renderIfIdle();
      return;
    }
    if (storageError) {
      toast("Resolve the storage issue before syncing transactions.");
      return;
    }
    privateBusy = true;
    privateStatus = "Syncing private portfolio";
    updateBar();
    try {
      let result = await privateRequest("list");
      if (!Array.isArray(result.transactions))
        throw Error("Backend did not return transactions.");
      let remote = result.transactions;
      txs = Q.mergeTransactions(txs, remote, outbox, ack);
      ack = remote.map((t) => t.id);
      cachePrices(result);
      savePrivateState();
      for (const queued of [...outbox]) {
        const current = outbox.find((o) => o.id === queued.id);
        if (!current || current.revision !== queued.revision) continue;
        const transaction = txs.find((t) => t.id === queued.id);
        if (queued.action === "upsert" && !transaction) continue;
        await privateRequest(
          queued.action,
          queued.action === "delete"
            ? { transactionId: queued.id }
            : { transaction },
        );
        outbox = outbox.filter(
          (o) => !(o.id === queued.id && o.revision === queued.revision),
        );
        savePrivateState();
      }
      if (result && Array.isArray(result.transactions)) {
        result = await privateRequest("list");
        if (!Array.isArray(result.transactions))
          throw Error("Backend did not return transactions.");
        txs = Q.mergeTransactions(txs, result.transactions, outbox, ack);
        ack = result.transactions.map((t) => t.id);
        cachePrices(result);
        savePrivateState();
      }
      privateStatus = "Connected · " + txs.length + " private transactions";
    } catch (e) {
      privateStatus = "Sync failed · local changes preserved";
      toast(e.message);
    } finally {
      privateBusy = false;
      renderIfIdle();
    }
  }
  async function refreshPrices(silent = false) {
    if (priceBusy || privateBusy) return;
    if (!connected()) {
      if (!silent)
        toast(
          "Use your existing private sync connection in Settings to refresh free prices.",
        );
      return;
    }
    priceBusy = true;
    priceError = "Checking delayed prices";
    updateBar();
    try {
      const result = await privateRequest("refreshPrices");
      cachePrices(
        result,
      ); /* Deliberately do not replace local transactions from a price response. */
    } catch (e) {
      priceError = "Price refresh failed · cached quotes";
      if (!silent) toast(e.message);
    } finally {
      priceBusy = false;
      renderIfIdle();
    }
  }
  async function syncResearch() {
    if (researchBusy) return;
    if (!connected()) {
      researchStatus = "Private connection required to read research details";
      renderIfIdle();
      return;
    }
    researchBusy = true;
    researchStatus = "Reading research tables";
    try {
      const result = await privateRequest("research");
      if (!result.research || !result.research.tables)
        throw Error("Research adapter response missing.");
      const allowed = [
        "Signals",
        "Watchlist",
        "Universe",
        "Fundamental Snapshot",
        "Daily Radar",
        "Research Sources",
        "Crucial Dates",
        "Daily Observations",
        "History",
        "Scorecard",
        "Methodology",
      ];
      const tables = {};
      for (const name of allowed)
        tables[name] = Array.isArray(result.research.tables[name])
          ? result.research.tables[name]
          : [];
      research = {
        ...result.research,
        tables,
        datesAvailable:
          Object.hasOwn(result.research.tables, "Crucial Dates") &&
          !(result.research.diagnostics || []).includes(
            "Crucial Dates: missing table",
          ),
      };
      write(KEYS.research, research);
      researchStatus = "Read-only research connected";
    } catch (e) {
      researchStatus = /Unknown action/i.test(e.message)
        ? "Current backend needs the read-only research adapter"
        : "Research refresh failed · " +
          (research ? "cached details retained" : "no details loaded");
    } finally {
      researchBusy = false;
      renderIfIdle();
    }
  }
  function renderIfIdle() {
    if ($("txDialog").open || $("tokenDialog").open) return;
    if (view === "risk") {
      updateBar();
      return;
    }
    if (view === "settings" && document.activeElement?.tagName === "INPUT") {
      updateBar();
      return;
    }
    render();
    if ($("detailDialog").open) renderDetail();
  }
  function openTx(id = "") {
    if (storageError) {
      toast(storageError);
      return;
    }
    const t = txs.find((t) => t.id === id);
    $("txTitle").textContent = t ? "Edit transaction" : "Add transaction";
    $("txId").value = t?.id || "";
    $("txInstrument").value = t?.instrument || "";
    $("txAction").value = t?.action || "BUY";
    $("txDate").value = t?.date || Q.jakartaDate();
    $("txPrice").value = t?.price ?? "";
    $("txQty").value = t?.quantity ?? "";
    $("txUnit").value = t?.unit || "lot";
    $("txFee").value = t?.fee ?? 0;
    $("txSource").value = t?.source || "Existing Holding";
    $("txLink").value = t?.linkedSignal || "";
    $("txAccount").value = t?.account || "";
    $("txNotes").value = t?.notes || "";
    $("txError").textContent = "";
    $("txDialog").showModal();
  }
  $("txForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (storageError) {
      $("txError").textContent = storageError;
      return;
    }
    const id =
        $("txId").value ||
        "T-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()),
      existing = txs.find((t) => t.id === id),
      now = new Date().toISOString(),
      t = {
        ...existing,
        id,
        date: $("txDate").value,
        instrument: $("txInstrument").value.trim().toUpperCase(),
        assetClass: existing?.assetClass || "Equity",
        action: $("txAction").value,
        price: Number($("txPrice").value),
        quantity: Number($("txQty").value),
        unit: $("txUnit").value,
        fee: Number($("txFee").value || 0),
        source: $("txSource").value,
        linkedSignal: $("txLink").value.trim(),
        account: $("txAccount").value.trim(),
        notes: $("txNotes").value.trim(),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
    const error = Q.validateTx(t, txs);
    if (error) {
      $("txError").textContent = error;
      return;
    }
    txs = txs.filter((t) => t.id !== id);
    txs.push(t);
    enqueueOp(id, "upsert");
    if (!savePrivateState()) return;
    $("txDialog").close();
    setView("portfolio");
    toast("Transaction saved on this device.");
    if (connected()) await syncPrivate();
  });
  async function deleteTx(id) {
    if (storageError) return toast(storageError);
    const t = txs.find((t) => t.id === id);
    if (
      !t ||
      !confirm(
        "Delete this " +
          t.instrument +
          " " +
          t.action +
          " transaction? The change will sync to the private ledger.",
      )
    )
      return;
    txs = txs.filter((t) => t.id !== id);
    enqueueOp(id, "delete");
    if (!savePrivateState()) return;
    render();
    if (connected()) await syncPrivate();
  }
  function download(name, text, type = "application/json") {
    const a = document.createElement("a"),
      url = URL.createObjectURL(new Blob([text], { type }));
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function savedToken() {
    return (
      $("privateToken")?.value.trim() || localStorage.getItem(KEYS.token) || ""
    );
  }
  async function copyToken() {
    const t = savedToken();
    if (!t) return toast("No saved token.");
    try {
      await navigator.clipboard.writeText(t);
      toast("Token copied.");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      toast(
        ok
          ? "Token copied."
          : "Clipboard unavailable. Use the local QR or token file.",
      );
    }
  }
  async function importBackup(file) {
    try {
      const d = JSON.parse(await file.text());
      if (!Array.isArray(d.transactions)) throw Error("Not a portfolio backup");
      const incoming = d.transactions;
      if (
        incoming.some(
          (t) =>
            !t.id ||
            !t.instrument ||
            Q.positive(t.price) === null ||
            Q.positive(t.quantity) === null ||
            !["BUY", "SELL"].includes(t.action) ||
            !["lot", "share"].includes(t.unit),
        )
      )
        throw Error("Backup contains invalid transaction records");
      if (
        !confirm(
          "Merge " +
            incoming.length +
            " transactions by ID? Your existing records and connection settings will be kept.",
        )
      )
        return;
      const map = new Map(txs.map((t) => [t.id, t]));
      for (const t of incoming) {
        const old = map.get(t.id);
        if (
          !old ||
          (Date.parse(t.updatedAt || t.createdAt) || 0) >
            (Date.parse(old.updatedAt || old.createdAt) || 0)
        ) {
          map.set(t.id, t);
          enqueueOp(t.id, "upsert");
        }
      }
      txs = [...map.values()];
      for (const [k, v] of Object.entries(d.manualPrices || {}))
        if (Q.positive(v) !== null && !Object.hasOwn(manual, k)) manual[k] = v;
      if (!savePrivateState()) return;
      render();
      toast("Backup merged locally. Sync private now to send queued records.");
    } catch (e) {
      toast(e.message || "Invalid backup.");
    }
  }
  async function uploadLocal() {
    if (!connected()) return toast("Connect private sync first.");
    if (!txs.length) return toast("No local transactions to upload.");
    if (
      !confirm(
        "Upload preserved local transactions to your private ledger? This may restore records deleted on another device. Only continue if this local copy is correct.",
      )
    )
      return;
    for (const t of txs) enqueueOp(t.id, "upsert");
    savePrivateState();
    await syncPrivate();
  }
  async function action(name) {
    switch (name) {
      case "addTx":
        openTx();
        break;
      case "toggleHide":
        hide = !hide;
        write(KEYS.hide, hide);
        render();
        break;
      case "prices":
        await refreshPrices();
        break;
      case "privateSync":
        await syncPrivate();
        break;
      case "research":
        await syncResearch();
        break;
      case "publicSync":
        await syncPublic();
        break;
      case "savePrivate": {
        const u = $("privateUrl").value.trim(),
          t = savedToken();
        if (!Q.validEndpoint(u) || !t)
          return toast(
            "Use the existing https://script.google.com/macros/s/…/exec URL and token.",
          );
        localStorage.setItem(KEYS.url, u);
        localStorage.setItem(KEYS.token, t);
        await syncPrivate();
        await syncResearch();
        break;
      }
      case "saveFeed": {
        const u = $("feedUrl").value.trim();
        try {
          const parsed = new URL(u);
          if (parsed.protocol !== "https:") throw Error();
        } catch {
          return toast("Enter a valid HTTPS feed URL.");
        }
        localStorage.setItem(KEYS.feed, u);
        await syncPublic();
        break;
      }
      case "copyToken":
        await copyToken();
        break;
      case "qr": {
        const t = savedToken();
        if (!t) return toast("No saved token.");
        AIQuantQR.render($("tokenQr"), t, 8, 4);
        $("tokenDialog").showModal();
        break;
      }
      case "downloadToken": {
        const t = savedToken();
        if (t) {
          download("AI_Quant_Private_Token.txt", t + "\n", "text/plain");
          toast("Delete the token file after transfer.");
        }
        break;
      }
      case "generateToken": {
        if (
          !confirm(
            "Generate a NEW token? Your current private connection will stop working until you put the same new token in Apps Script properties.",
          )
        )
          return;
        const a = new Uint8Array(32);
        crypto.getRandomValues(a);
        const t = [...a].map((x) => x.toString(16).padStart(2, "0")).join("");
        localStorage.setItem(KEYS.token, t);
        $("privateToken").value = t;
        toast(
          "New token saved locally. Update the existing Script Property to match.",
        );
        break;
      }
      case "export":
        download(
          "AI_Quant_Private_Portfolio_Backup.json",
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              transactions: txs,
              manualPrices: manual,
              pendingChanges: outbox,
            },
            null,
            2,
          ),
        );
        break;
      case "recovery": {
        const values = {};
        for (const k of [
          KEYS.tx,
          KEYS.manual,
          KEYS.outbox,
          KEYS.ack,
          "quantUpgradeBackupV05",
          "quantPendingCommitV5",
        ])
          values[k] = localStorage.getItem(k);
        download(
          "AI_Quant_Private_Storage_Recovery.json",
          JSON.stringify(values, null, 2),
        );
        break;
      }
      case "uploadLocal":
        await uploadLocal();
        break;
      case "update": {
        const r = await navigator.serviceWorker?.getRegistration();
        if (!r) return toast("No installed service worker on this preview.");
        await r.update();
        if (r.waiting) {
          $("updateBanner").hidden = false;
        }
        toast(
          "Update checked. Keep this same app address and reload when ready.",
        );
        break;
      }
      case "clearLocal": {
        if (outbox.length)
          return toast(
            "There are unsynced changes. Export a backup and sync them before clearing local data.",
          );
        if (
          !confirm(
            "Clear local portfolio data on THIS device? Cloud records and connection settings stay.",
          )
        )
          return;
        download(
          "AI_Quant_Before_Local_Reset.json",
          JSON.stringify({ transactions: txs, manualPrices: manual }, null, 2),
        );
        txs = [];
        manual = {};
        ack = [];
        privatePositions = [];
        write(KEYS.positions, []);
        savePrivateState();
        render();
        break;
      }
    }
  }
  function bindPage() {
    if (view === "journal" && $("journalSignal"))
      $("journalSignal").addEventListener("change", (e) => {
        journalSignal = e.target.value;
        chartIndex = null;
        render();
      });
    if (view === "radar")
      $("radarSearch").addEventListener("input", (e) => {
        const pos = e.target.selectionStart;
        radarSearch = e.target.value;
        render();
        $("radarSearch").focus();
        $("radarSearch").setSelectionRange(pos, pos);
      });
    if (view === "risk") {
      document.querySelectorAll("[data-risk]").forEach((input) =>
        input.addEventListener("input", () => {
          riskInput[input.dataset.risk] = input.value;
          updateRisk();
        }),
      );
      $("riskSignal").addEventListener("change", (e) => {
        const s = M().signals.find((s) => s.id === e.target.value);
        if (!s) return;
        riskInput.entry = String(price(s.instrument).value || s.entry || "");
        riskInput.target = String(s.target || "");
        riskInput.stop = String(s.stop || "");
        render();
        $("riskSignal").value = s.id;
      });
      updateRisk();
    }
    if (view === "settings") {
      $("autoPrices").addEventListener("change", (e) => {
        auto = Number(e.target.value);
        write(KEYS.auto, auto);
        toast("Price refresh preference saved.");
      });
      $("importBackup").addEventListener("change", (e) => {
        if (e.target.files?.[0]) importBackup(e.target.files[0]);
      });
    }
  }
  function bindDetail() {}
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button,a");
    if (!b) return;
    if (b.dataset.view) {
      e.preventDefault();
      setView(b.dataset.view);
      return;
    }
    if (b.dataset.close) {
      $(b.dataset.close).close();
      if (b.dataset.close === "tokenDialog") $("tokenQr").innerHTML = "";
      return;
    }
    if (b.dataset.action) {
      Promise.resolve(action(b.dataset.action)).catch((err) =>
        toast(err.message || "Action failed."),
      );
      return;
    }
    if (b.dataset.stage) {
      if (b.dataset.stage === "radar") return setView("radar");
      stage = b.dataset.stage;
      render();
      return;
    }
    if (b.dataset.detail) {
      openDetail(b.dataset.detail, b.dataset.kind || "stock");
      return;
    }
    if (b.dataset.detailTab) {
      detailTab = b.dataset.detailTab;
      renderDetail();
      return;
    }
    if (b.dataset.radarFilter) {
      radarFilter = b.dataset.radarFilter;
      render();
      return;
    }
    if (b.dataset.datesFilter) {
      datesFilter = b.dataset.datesFilter;
      render();
      document
        .querySelector('[data-dates-filter="' + datesFilter + '"]')
        ?.focus();
      return;
    }
    if (b.dataset.editTx) {
      openTx(b.dataset.editTx);
      return;
    }
    if (b.dataset.deleteTx) {
      deleteTx(b.dataset.deleteTx);
      return;
    }
    if (b.dataset.manual) {
      const k = b.dataset.manual,
        v = prompt(
          "Manual price for " +
            k +
            ". Valid Google Finance prices still take priority.",
          manual[k] ?? "",
        );
      if (v === null) return;
      if (Q.positive(v) === null) return toast("Enter a positive price.");
      manual[k] = Number(v);
      savePrivateState();
      render();
      return;
    }
    if (b.dataset.removeManual) {
      delete manual[b.dataset.removeManual];
      savePrivateState();
      render();
      return;
    }
    if (b.dataset.simulate) {
      const s = M().signals.find((s) => s.id === b.dataset.simulate);
      if (!s) return;
      riskInput.entry = String(price(s.instrument).value || s.entry || "");
      riskInput.target = String(s.target || "");
      riskInput.stop = String(s.stop || "");
      $("detailDialog").close();
      setView("risk");
      return;
    }
  });
  document.addEventListener("click", (e) => {
    const p = e.target.closest("[data-chart-point]");
    if (p) {
      chartIndex = Number(p.dataset.chartPoint);
      render();
    }
  });
  document.addEventListener("keydown", (e) => {
    const p = e.target.closest("[data-chart-point]");
    if (p && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      chartIndex = Number(p.dataset.chartPoint);
      render();
      document.querySelector(`[data-chart-point="${chartIndex}"]`)?.focus();
    }
  });
  window.addEventListener("popstate", () => {
    view = location.hash.slice(1) || "today";
    render();
  });
  window.addEventListener("hashchange", () => {
    view = location.hash.slice(1) || "today";
    render();
  });
  $("globalRefresh").innerHTML = icon("refresh");
  $("globalRefresh").onclick = async () => {
    await syncPublic();
    await syncPrivate();
    await syncResearch();
  };
  $("tokenDialog").addEventListener(
    "close",
    () => ($("tokenQr").innerHTML = ""),
  );
  for (const b of document.querySelectorAll("nav button[data-view]"))
    b.innerHTML = icon(b.dataset.view) + `<span>${b.textContent}</span>`;
  setView(view, true);
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            )
              $("updateBanner").hidden = false;
          });
        });
      })
      .catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      $("updateBanner").hidden = false;
    });
  }
  $("applyUpdate").onclick = async () => {
    if ($("txDialog").open)
      return toast("Save or close the transaction form before reloading.");
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.waiting) {
      const waiting = reg.waiting;
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 4000);
        waiting.addEventListener("statechange", () => {
          if (waiting.state === "activated") {
            clearTimeout(timeout);
            resolve();
          }
        });
        waiting.postMessage({ type: "SKIP_WAITING" });
      });
    }
    location.reload();
  };
  setInterval(() => {
    if (
      document.visibilityState === "visible" &&
      calendarDay !== Q.jakartaDate()
    )
      renderIfIdle();
    if (
      auto > 0 &&
      document.visibilityState === "visible" &&
      Date.now() - (Date.parse(checked) || 0) >= auto * 60000
    )
      refreshPrices(true);
  }, 60000);
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      calendarDay !== Q.jakartaDate()
    )
      renderIfIdle();
    if (
      auto > 0 &&
      document.visibilityState === "visible" &&
      Date.now() - (Date.parse(checked) || 0) >= auto * 60000
    )
      refreshPrices(true);
  });
  (async () => {
    await syncPublic();
    if (connected()) {
      await syncPrivate();
      await syncResearch();
    }
  })();
})();
