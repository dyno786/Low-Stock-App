PUSH THESE FILES TO GITHUB:

ROOT FOLDER:
  home.html, stock.html, urgent.html, director.html, index.html

API FOLDER (create "api" folder in GitHub):
  api/stock-data.js  ← NEW: caches Google Sheets data (makes director fast)
  api/log-access.js  ← captures IP on login

HOW THE SPEED FIX WORKS:
  director.html now calls /api/stock-data?branch=roundhay etc
  Vercel runs stock-data.js which fetches Google Sheets and caches it for 5 mins
  Second person to load gets instant response from Vercel cache
  First load after 5 mins = ~3-5s, subsequent loads = <1s
