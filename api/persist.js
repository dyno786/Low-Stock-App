// api/persist.js — ONE-TIME: remove the 30-day expiry from existing app data so it
// lasts forever, WITHOUT changing any values. Uses Redis PERSIST (value untouched).
// Run once after deploying the no-expiry ticks.js:   GET /api/persist
// Safe to run multiple times. Only touches cc_* keys (app state), never the stock:* caches.

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

  try {
    // find all app-state keys (never the stock:* 2h caches)
    const keysRes = await cmd(['KEYS', 'cc_*']);
    const keys = (keysRes && Array.isArray(keysRes.result)) ? keysRes.result : [];
    const report = [];
    let madePermanent = 0, alreadyPermanent = 0;

    for (const k of keys) {
      // ttl before: -1 = no expiry, -2 = missing, >0 = seconds left
      const ttlBefore = await cmd(['TTL', k]);
      const tb = ttlBefore && typeof ttlBefore.result === 'number' ? ttlBefore.result : null;
      let action = 'skip';
      if (tb !== null && tb > 0) {
        const p = await cmd(['PERSIST', k]);           // remove the countdown, value untouched
        action = (p && p.result === 1) ? 'persisted' : 'persist-failed';
        if (action === 'persisted') madePermanent++;
      } else if (tb === -1) {
        action = 'already-permanent';
        alreadyPermanent++;
      } else {
        action = 'missing';
      }
      report.push({ key: k, ttlWas: tb, action });
    }

    return new Response(JSON.stringify({
      ok: true,
      scanned: keys.length,
      madePermanent,
      alreadyPermanent,
      report,
    }, null, 2), { status: 200, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
