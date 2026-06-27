// api/fast-sellers.js — Node serverless. Reads the EPOS best-seller export from
// Google Sheets as CSV (the file the till overwrites). Reads the FIRST sheet, so it
// won't break when the export regenerates and the tab id changes.
const DEFAULT_ID  = process.env.FAST_SELLERS_FILE_ID || '1p2EOH5nn9WjgUQ5z8UMv04GBESil3VNv';
const DEFAULT_GID = process.env.FAST_SELLERS_GID     || '';   // blank = first/default sheet

function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export default async function handler(req, res) {
  const id  = (req.query && req.query.id)  || DEFAULT_ID;
  const gid = (req.query && req.query.gid) || DEFAULT_GID;
  const url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(id) +
              '/export?format=csv' + (gid ? ('&gid=' + encodeURIComponent(gid)) : '');
  try {
    const r = await fetch(url, { redirect: 'follow' });
    const text = await r.text();
    const head = text.slice(0, 200).toLowerCase();
    if (head.includes('<html') || head.includes('<!doctype') || head.includes('google docs')) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ items: {}, count: 0, error: 'file-not-public',
        hint: 'Share the best-sellers sheet as "Anyone with the link - Viewer".' });
    }
    const rows = parseCSV(text);
    let hi = rows.findIndex(row => row.map(c => ('' + c).toLowerCase().trim()).includes('barcode'));
    if (hi < 0) { res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ items: {}, count: 0, error: 'no-header' }); }
    const H = rows[hi].map(c => ('' + c).toLowerCase().trim());
    const idx = { bc:H.indexOf('barcode'), nm:H.indexOf('description'), dp:H.indexOf('department'),
                  u90:H.indexOf('units (90d)'), wk:H.indexOf('avg/week'), rank:H.indexOf('rank') };
    const items = {}; let count = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const row = rows[i]; const bc = ('' + (row[idx.bc] ?? '')).trim();
      if (!bc) continue;
      items[bc] = { nm:('' + (row[idx.nm] ?? '')).trim(), dp:('' + (row[idx.dp] ?? '')).trim(),
                    u90:Number(row[idx.u90])||0, wk:Number(row[idx.wk])||0, rank:Number(row[idx.rank])||0 };
      count++;
    }
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
