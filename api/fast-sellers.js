// api/fast-sellers.js — Node serverless. No external deps, no Buffer.
// Reads the EPOS best-seller export straight from Google Sheets as CSV (the same
// file the till overwrites every day) and returns units-sold velocity per barcode.
//
//   GET /api/fast-sellers          -> { items: { "<barcode>": {nm,dp,u90,wk,rank} }, count, generated }
//   GET /api/fast-sellers?id=<id>  -> override which spreadsheet to read
//   GET /api/fast-sellers?gid=<g>  -> override which tab to read
//
// The file MUST be shared "Anyone with the link - Viewer" so this server can read it.
// (Already the case for the live file.)

const DEFAULT_ID  = process.env.FAST_SELLERS_FILE_ID || '1p2EOH5nn9WjgUQ5z8UMv04GBESil3VNv';
const DEFAULT_GID = process.env.FAST_SELLERS_GID     || '1293196229';

// Minimal RFC-4180 CSV parser: handles quoted fields, embedded commas/newlines,
// and "" escaped quotes.
function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r') {
      // ignore
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export default async function handler(req, res) {
  const id  = (req.query && req.query.id)  || DEFAULT_ID;
  const gid = (req.query && req.query.gid) || DEFAULT_GID;
  const url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(id) +
              '/export?format=csv&gid=' + encodeURIComponent(gid);
  try {
    const r = await fetch(url, { redirect: 'follow' });
    const text = await r.text();

    // A public CSV starts with data. If we got an HTML sign-in/permission page,
    // the file isn't shared publicly (or the id/gid is wrong).
    const head = text.slice(0, 200).toLowerCase();
    if (head.includes('<html') || head.includes('<!doctype') || head.includes('google docs')) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ items: {}, count: 0, error: 'file-not-public',
        hint: 'Share the best-sellers sheet as "Anyone with the link - Viewer".' });
    }

    const rows = parseCSV(text);

    // Header row = the one containing "Barcode" (a couple of title rows sit above it).
    let hi = rows.findIndex(row => row.map(c => ('' + c).toLowerCase().trim()).includes('barcode'));
    if (hi < 0) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ items: {}, count: 0, error: 'no-header' });
    }
    const H = rows[hi].map(c => ('' + c).toLowerCase().trim());
    const idx = {
      bc:   H.indexOf('barcode'),
      nm:   H.indexOf('description'),
      dp:   H.indexOf('department'),
      u90:  H.indexOf('units (90d)'),
      wk:   H.indexOf('avg/week'),
      rank: H.indexOf('rank'),
    };

    const items = {};
    let count = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const row = rows[i];
      const bc = ('' + (row[idx.bc] ?? '')).trim();
      if (!bc) continue;                       // skip rows with no barcode (e.g. CARRY BAG)
      items[bc] = {
        nm:   ('' + (row[idx.nm]  ?? '')).trim(),
        dp:   ('' + (row[idx.dp]  ?? '')).trim(),
        u90:  Number(row[idx.u90]) || 0,
        wk:   Number(row[idx.wk])  || 0,
        rank: Number(row[idx.rank]) || 0,
      };
      count++;
    }

    // "Generated ..." timestamp from the title rows, if present.
    let generated = '';
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const m = (rows[i] || []).join(' ').match(/Generated\s+([\d:\-\s]+)/i);
      if (m) { generated = m[1].trim(); break; }
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ items, count, generated });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ items: {}, count: 0, error: String((e && e.message) || e) });
  }
}
