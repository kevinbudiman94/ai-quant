
const FALLBACK = window.__FALLBACK_DATA__;
let state = null;

function money(v){ return typeof v==="number" ? "Rp"+v.toLocaleString("id-ID") : v; }
function pct(v){ if(v===null||v===undefined) return "N/A"; return (v>0?"+":"")+Number(v).toFixed(2)+"%"; }
function esc(s){ return String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }

async function loadData(){
  const saved = localStorage.getItem("quantData");
  if(saved){ try{ return JSON.parse(saved); }catch(e){} }
  try{
    const r = await fetch("./data.json",{cache:"no-store"});
    if(r.ok) return await r.json();
  }catch(e){}
  return FALLBACK;
}

function saveData(d){ localStorage.setItem("quantData", JSON.stringify(d)); }

function render(){
  const d=state, sig=d.signals[0], sc=d.scorecard;
  document.getElementById("meta").textContent=`${d.meta.version} · Day ${d.meta.day} · ${d.meta.date}`;
  document.getElementById("updated").textContent=`Updated: ${d.meta.updatedAt}`;
  document.getElementById("regime").textContent=d.regime.label;
  document.getElementById("risk").textContent=d.regime.risk;
  document.getElementById("takeaway").textContent=d.regime.takeaway;
  document.getElementById("macrochips").innerHTML=d.regime.chips.map(x=>`<div class="kpi"><div class="label">${esc(x.label)}</div><div class="medium">${esc(x.value)}</div></div>`).join("");

  document.getElementById("hero").innerHTML=`
    <div class="card signal">
      <div class="row wrap">
        <div>
          <div class="label">TODAY'S BEST SETUP</div>
          <div class="row" style="justify-content:flex-start;margin-top:4px">
            <div class="big">${esc(sig.instrument)}</div>
            <div class="badge green">${esc(sig.action)}</div>
          </div>
          <div class="muted small" style="margin-top:5px">${esc(sig.benchmark)}</div>
        </div>
        <div style="text-align:right"><div class="label">REFERENCE ENTRY</div><div class="big">${money(sig.entry)}</div></div>
      </div>
      <div class="kpi-grid" style="margin-top:14px">
        <div class="kpi"><div class="label">TARGET</div><div class="medium green">${money(sig.target)}</div></div>
        <div class="kpi"><div class="label">INVALIDATION</div><div class="medium red">${money(sig.stop)}</div></div>
        <div class="kpi"><div class="label">REWARD / RISK</div><div class="medium">${sig.rr}×</div></div>
        <div class="kpi"><div class="label">CONFIDENCE</div><div class="medium">${sig.confidence}%</div></div>
      </div>
      <hr>
      <div class="row wrap small">
        <span><span class="muted">Upside</span> <b class="green">+${sig.upside}%</b></span>
        <span><span class="muted">Downside</span> <b class="red">${sig.downside}%</b></span>
        <span><span class="muted">Horizon</span> <b>${esc(sig.horizon)}</b></span>
      </div>
      <div style="margin-top:12px"><div class="label">LOCKED THESIS</div><ul>${sig.thesis.map(t=>`<li>${esc(t)}</li>`).join("")}</ul></div>
    </div>`;

  document.getElementById("watchcards").innerHTML=d.watchlist.map(w=>`
    <div class="card wait">
      <div class="row"><div class="medium">${esc(w.instrument)}</div><span class="badge amber">${esc(w.action)}</span></div>
      <div class="small muted" style="margin-top:8px">Day-1 ref ${esc(w.reference)}</div>
      <div style="margin-top:10px"><div class="label">TRIGGER / WATCH ZONE</div><div class="medium">${esc(w.trigger)}</div></div>
      <div class="small" style="margin-top:8px">${esc(w.note)}</div>
    </div>`).join("");

  document.getElementById("openRows").innerHTML=d.signals.filter(s=>s.status==="OPEN").map(s=>{
    const pl=((s.current-s.entry)/s.entry)*100;
    return `<tr><td>${esc(s.id)}</td><td><b>${esc(s.instrument)}</b></td><td>${money(s.entry)}</td><td>${money(s.current)}</td><td>${pct(pl)}</td><td>${money(s.target)}</td><td>${money(s.stop)}</td></tr>`;
  }).join("") || `<tr><td colspan="7" class="empty">No open signals.</td></tr>`;

  document.getElementById("historyList").innerHTML=d.history.map(h=>`<div class="timeline-item"><div class="label">${esc(h.date)}</div><div>${esc(h.text)}</div></div>`).join("");

  document.getElementById("scoregrid").innerHTML=[
    ["Active BUY",sc.active],["Wait Calls",sc.wait],["Closed",sc.closed],
    ["Win Rate",sc.winRate===null?"N/A":sc.winRate+"%"],
    ["Paper Return",pct(sc.paperReturn)],["Expectancy",sc.expectancy===null?"N/A":pct(sc.expectancy)],
    ["Max Drawdown",sc.maxDrawdown===null?"N/A":pct(sc.maxDrawdown)],["Profit Factor",sc.profitFactor===null?"N/A":sc.profitFactor]
  ].map(([a,b])=>`<div class="kpi"><div class="label">${a}</div><div class="medium">${b}</div></div>`).join("");

  document.getElementById("audit").innerHTML=`
    <div class="card">
      <div class="row"><div class="medium">Locked Thesis · ${esc(sig.id)}</div><span class="badge">LOCKED</span></div>
      <ul>${sig.thesis.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
      <hr>
      <div class="label">KEY RISKS</div><ul>${sig.risks.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
    </div>
    <div class="card">
      <div class="medium">What are we learning?</div>
      <div class="empty" style="margin-top:8px">${esc(d.learning.insufficient.join(" · "))}</div>
    </div>`;
}

function showTab(name){
  document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.dataset.panel===name));
  document.querySelectorAll("[data-nav]").forEach(b=>b.classList.toggle("active",b.dataset.nav===name));
  window.scrollTo({top:0,behavior:"smooth"});
}

document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.nav)));

document.getElementById("importFile").addEventListener("change",async e=>{
  const f=e.target.files?.[0]; if(!f) return;
  try{
    const d=JSON.parse(await f.text());
    state=d; saveData(d); render();
    document.getElementById("settingsStatus").textContent="Imported and saved on this phone.";
  }catch(err){
    document.getElementById("settingsStatus").textContent="Invalid JSON file.";
  }
});

document.getElementById("resetData").addEventListener("click",()=>{
  localStorage.removeItem("quantData");
  state=FALLBACK; render();
  document.getElementById("settingsStatus").textContent="Reset to bundled Day-1 data.";
});

document.getElementById("syncBtn").addEventListener("click",async ()=>{
  const url=document.getElementById("syncUrl").value.trim();
  if(!url){ document.getElementById("settingsStatus").textContent="Paste a public JSON feed URL first."; return; }
  try{
    const r=await fetch(url,{cache:"no-store"});
    if(!r.ok) throw new Error("HTTP "+r.status);
    const d=await r.json();
    state=d; saveData(d); localStorage.setItem("quantSyncUrl",url); render();
    document.getElementById("settingsStatus").textContent="Synced successfully.";
  }catch(err){
    document.getElementById("settingsStatus").textContent="Sync failed. Feed must be public JSON with CORS allowed.";
  }
});

(async()=>{
  state=await loadData();
  const u=localStorage.getItem("quantSyncUrl"); if(u) document.getElementById("syncUrl").value=u;
  render();
})();
