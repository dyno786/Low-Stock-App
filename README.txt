CC HAIR & BEAUTY — STOCK MANAGEMENT SYSTEM
==========================================
Upload ALL files to your GitHub repo root.

PAGES (8 files):
  home.html       → Central hub & login  ← BOOKMARK THIS
  index.html      → Staff: negative stock checker + WhatsApp
  stock.html      → Full stock intelligence
  urgent.html     → Urgent transfers + history
  director.html   → Director dashboard
  lostsales.html  → Lost sales £ calculator
  compare.html    → Branch best/worst comparison
  images.html     → Missing Shopify images collector

API FOLDER (create "api" folder in GitHub):
  api/log-access.js   → captures IP on login
  api/stock-data.js   → caches Google Sheets (speeds up director)

PINS:
  Staff:    1979  → home, index, stock, urgent, images
  Manager:  3030  → above + compare
  Director: 2025  → everything + lostsales, director

NAV BAR:
  All pages have a shared bottom nav bar
  Staff see: Home · Low stock · Stock · Urgent · Images
  Manager+:  + Compare
  Director:  + Lost £ · Director
