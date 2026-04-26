CC HAIR & BEAUTY — STOCK MANAGEMENT SYSTEM
==========================================
All 4 branches: Roundhay · Chapy · City · Warehouse

PUSH TO GITHUB (root folder):
  home.html       → Central hub & login  ← BOOKMARK THIS
  index.html      → Staff negative stock checker
  stock.html      → Full stock intelligence
  urgent.html     → Urgent transfers (all 4 branches)
  director.html   → Director dashboard
  lostsales.html  → Lost sales £ calculator
  compare.html    → Branch best/worst comparison
  images.html     → Missing Shopify images
  kpi.html        → Daily KPI leaderboard

API FOLDER (create "api" folder in GitHub):
  api/log-access.js   → Login IP tracking
  api/stock-data.js   → Caches Google Sheets data

BAT FILES (already set up on branch PCs):
  bat-files/ — all 4 branch export scripts

PINS:
  Staff:    1979
  Manager:  3030
  Director: 2025

WAREHOUSE:
  Server: localhost\SQLEXPRESS
  Branch PK: 5
  Export: Desktop\CC-StockExport\stock_export_warehouse.csv
  Schedule: CC_Stock_Warehouse (every 30 mins)
