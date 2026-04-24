// api/stock-data.js — Vercel Serverless Function
// Fetches Google Sheets CSV, parses it, caches for 5 minutes on Vercel's CDN
// Usage: /api/stock-data?branch=roundhay
//
// This means the app fetches from Vercel (fast, cached, nearby CDN)
// instead of Google Sheets (slow, cold start, far away)

const SHEETS = {
  roundhay: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT2w5wBKrzvkoUPjEB_f7K9_vyehT9MCAxJ32AwtSmNqZzVwJZaH2G0kg7YuRTjstWGZSLpGCVj9NzM/pub?gid=0&single=true&output=csv',
  chapy:    'https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ2DoIGJsmVoJOmShcLoUJ6wFrwbVSejnPy7uft8UEf1Brj5gRNBmSTO4eRqZQkDsldlsD6GiBs2Bo/pub?gid=0&single=true&output=csv',
  city:     'https://docs.google.com/spreadsheets/d/e/2PACX-1vRfK3RbCr-2FPtGFXio6aL6UMnYrlNupoJ259jlHuLIXKkOBLraZxgcb8WvCj2ndeARlp-uVRyNMyKt/pub?gid=0&single=true&output=csv',
};

// Only the columns director.html needs
const COLS = ['Barcode','ProductName','Size','StockQty','Price','AvgCost','LastSold','DateCreated','Department'];

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const branch = (url.searchParams.get('branch') || 'roundhay').toLowerCase();
  const sheetUrl = SHEETS[branch];

  if (!sheetUrl) {
    return new Response(JSON.stringify({ error: 'Unknown branch' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Fetch from Google Sheets
    const res = await fetch(sheetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error('Sheet HTTP ' + res.status);

    const csv = await res.text();
    const lines = csv.trim().split('\n');
    if (lines.length < 2) throw new Error('Empty sheet');

    // Parse headers
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
    const colIdx = {};
    COLS.forEach(col => {
      const i = headers.findIndex(h => h.toLowerCase() === col.toLowerCase());
      if (i >= 0) colIdx[col] = i;
    });

    // Parse rows into compact arrays
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      const bc = get(cells, colIdx['Barcode']);
      if (!bc) continue;
      rows.push([
        bc,
        get(cells, colIdx['ProductName']),
        get(cells, colIdx['Size']),
        parseInt(get(cells, colIdx['StockQty'])) || 0,
        parseFloat(get(cells, colIdx['Price'])) || 0,
        parseFloat(get(cells, colIdx['AvgCost'])) || 0,
        get(cells, colIdx['LastSold']),
        get(cells, colIdx['DateCreated']),
        get(cells, colIdx['Department']),
      ]);
    }

    const body = JSON.stringify({
      branch,
      count: rows.length,
      ts: Date.now(),
      cols: ['bc','nm','sz','qty','prc','cst','ls','dc','dp'],
      rows
    });

    // Cache on Vercel CDN for 5 minutes, stale-while-revalidate 1 hour
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 's-maxage=300, stale-while-revalidate=3600',
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, branch }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

function get(cells, idx) {
  if (idx === undefined || idx < 0 || idx >= cells.length) return '';
  return cells[idx].replace(/^"|"$/g, '').trim();
}

function parseCSVLine(line) {
  const cells = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { cells.push(cur); cur = ''; }
    else cur += c;
  }
  cells.push(cur);
  return cells;
}
