// api/refresh-stock.js
// Scheduled job: pulls the 4 heavy stock CSVs from Google Drive and stores them
// (gzip-compressed) in Redis, so every device reads ONE identical, fast snapshot.
// Runs on a Vercel Cron (see vercel.json) and can also be hit manually or by an
// external cron (e.g. cron-job.org) at /api/refresh-stock.

export const config = { runtime: 'edge' };

const FEEDS = {
  chapy:     'https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ2DoIGJsmVoJOmShcLoUJ6wFrwbVSejnPy7uft8UEf1Brj5gRNBmSTO4eRqZQkDsldlsD6GiBs2Bo/pub?gid=0&single=true&output=csv',
  city:      'https://docs.google.com/spreadsheets/d/e/2PACX-1vRfK3RbCr-2FPtGFXio6aL6UMnYrlNupoJ259jlHuLIXKkOBLraZxgcb8WvCj2ndeARlp-uVRyNMyKt/pub?gid=0&single=true&output=csv',
  roundhay:  'https://docs.google.com/spreadsheets/d/e/2PACX-1vT2w5wBKrzvkoUPjEB_f7K9_vyehT9MCAxJ32AwtSmNqZzVwJZaH2G0kg7YuRTjstWGZSLpGCVj9NzM/pub?gid=0&single=true&output=csv',
  warehouse: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR7w_JR_xjlsZTD4-WMWoxotOPHDGg7Kgj7yvGGtJLZUL8apgHzBTOQxM7eBNu2VVirn6ehnlNR4vC6/pub?gid=0&single=true&output=csv',
};

async function gzipToB64(text) {
  const cs = new CompressionStream('gzip');
  const compressed = new Response(text).body.pipeThrough(cs);
  const buf = new Uint8Array(await new Response(compressed).arrayBuffer());
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
  return btoa(bin);
}

export default async function handler() {
  const REDIS_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!REDIS_URL || !REDIS_TOKEN) {
    return new Response(JSON.stringify({ error: 'missing redis env vars' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const cmd = async (arr) => (await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(arr),
  })).json();

  const out = {};
  for (const id of Object.keys(FEEDS)) {
    try {
      const r = await fetch(FEEDS[id], { headers: { 'User-Agent': 'CC-Stock-Refresh/1.0' } });
      const csv = await r.text();
      if (!csv || csv.length < 50) { out[id] = 'skipped-empty'; continue; }
      const b64 = await gzipToB64(csv);
      await cmd(['SET', 'stock:' + id, b64, 'EX', 7200]);              // 2h safety expiry
      await cmd(['SET', 'stockts:' + id, String(Date.now()), 'EX', 7200]);
      out[id] = { rows: csv.split('\n').length, csvBytes: csv.length, storedBytes: b64.length };
    } catch (e) { out[id] = 'error: ' + (e && e.message); }
  }
  return new Response(JSON.stringify({ ok: true, at: new Date().toISOString(), feeds: out }), {
    status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
