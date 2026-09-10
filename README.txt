AI Quant PWA v0.4 — Free Price Layer

New:
- Free delayed price layer from GOOGLEFINANCE via the private Google Sheet backend.
- Refresh Prices button on Today/Portfolio.
- Auto-refresh every 5 minutes while app is visible.
- Paper current price/P&L/RR uses delayed quote when available; locked paper entry/target/stop never changes.
- Watchlist shows delayed current price and mechanically flags trigger zones.
- Actual portfolio P/L uses delayed current quote.
- Gold remains daily-only because GOOGLEFINANCE does not provide a reliable free spot-XAU feed for this design.

IMPORTANT:
- Replace existing GitHub repo root files with this package.
- ALSO update Apps Script Code.gs to AI_Quant_Private_Sync_Backend_v0.4.gs and redeploy as a New version.
- Keep the same AI_QUANT_TOKEN and same /exec URL.
- Quotes can be delayed up to ~20 minutes and are not tick-by-tick real-time.
- Manual price remains only as a fallback.
