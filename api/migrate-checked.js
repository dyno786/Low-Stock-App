// api/migrate-checked.js — ONE-TIME: every product that already has a shelf level set
// (cc_shelf_caps) is marked as "checked" (cc_shelf_checked), so the two days of work
// already done shows up in the Checked tab WITHOUT anyone re-entering anything.
// Values are untouched. Safe to run more than once (only fills gaps).
//   GET /api/migrate-checked
// NOTE: deploy the updated api/ticks.js first (so the app is allowed to read cc_shelf_checked).

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });

  const REDIS_URL   = process.env.KV_REST_API_URL   || process.env.KV_URL || process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!REDIS_URL || !REDIS_TOKEN) {
    return new Response(JSON.stringify({ error: 'missing Upstash env vars' }), { status: 500, headers: cors });
  }

  const cmd = async (arr) => {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(arr),
    });
    return r.json();
  };
  const getObj = async (key) => {
    const d = await cmd(['GET', key]);
    if (!d || d.result == null) return {};
    let v = null;
    try { v = JSON.parse(d.result); } catch { v = d.result; }
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch {} }
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  };

  try {
    const caps = await getObj('cc_shelf_caps');        // { "barcode|dest": number }
    const checked = await getObj('cc_shelf_checked');  // { "barcode|dest": {t,v,nm} }

    let added = 0, already = 0;
    const byBranch = { '0': 0, '1': 0, '2': 0, other: 0 };

    for (const key in caps) {
      const val = caps[key];
      if (!(typeof val === 'number' && val > 0)) continue;   // only real set levels
      if (checked[key]) { already++; continue; }
      checked[key] = { t: 0, v: val, nm: '', m: 1 };         // m:1 = migrated (set earlier)
      added++;
      const dest = key.split('|')[1];
      if (dest === '0' || dest === '1' || dest === '2') byBranch[dest]++; else byBranch.other++;
    }

    if (added > 0) {
      // write back WITHOUT expiry (permanent)
      await cmd(['SET', 'cc_shelf_checked', JSON.stringify(checked)]);
    }

    const branchNames = { '0': 'Chapeltown', '1': 'City Centre', '2': 'Roundhay' };
    const perBranch = {};
    Object.keys(byBranch).forEach(k => { perBranch[branchNames[k] || k] = byBranch[k]; });

    return new Response(JSON.stringify({
      ok: true,
      capsFound: Object.keys(caps).length,
      markedChecked: added,
      alreadyChecked: already,
      byBranch: perBranch,
      totalCheckedNow: Object.keys(checked).length,
    }, null, 2), { status: 200, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
