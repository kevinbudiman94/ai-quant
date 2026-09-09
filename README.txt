AI QUANT PAPER PORTFOLIO — PWA v0.1

Files:
- index.html
- styles.css
- app.js
- data.json
- manifest.webmanifest
- sw.js
- icon-192.png
- icon-512.png

What works now:
- Mobile-first dashboard
- Today / Open / Watchlist / History / Scorecard / Audit / Settings
- Day-1 locked data bundled
- Offline cache after first hosted visit
- Installable as PWA once served over HTTPS
- Manual JSON import
- Optional public JSON-feed sync

Important:
A PWA cannot be reliably installed from a local file:// URL. Host the folder via HTTPS first.

Recommended architecture:
Daily research -> master ledger -> public JSON feed -> this installed PWA.

The UI does not rewrite locked historical signal parameters. New daily observations should be appended in the data feed.
