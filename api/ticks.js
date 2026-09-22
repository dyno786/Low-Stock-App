// api/ticks.js — Shared tick state via Upstash Redis (REST command API)
// Fixes the previous double-encoding bug (values were stored char-by-char).

export const config = { runtime: 'edge' };

const ALLOWED_KEYS = ['cc_pk_ticks','cc_staff2_ticks','cc_neg_ticks','cc_auto_log','cc_staff_week','cc_whns0','cc_whns1','cc_whns2','cc_wh_map','cc_wh_qty','cc_pk_log','cc_pk_session','cc_wh_set','cc_training_results','cc_wh_topsellers','cc_wh_tags','cc_pick_log','cc_wh_sent','cc_wh_cfg','cc_wh_tickmeta'];

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });

  const REDIS_URL   = process.env.KV_REST_API_URL   || process.env.KV_URL || process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!REDIS_URL || !REDIS_TOKEN) {
    return new Response(JSON.stringify({ fallback: true, hint: 'missing env vars' }), { status: 200, headers: cors });
  }

  // Run a Redis command via the Upstash REST command API: body = ["SET","key","value",...]
  const cmd = async (arr) => {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(arr),
    });
    return r.json();
  };

  const url = new URL(req.url);

  if (req.method === 'GET') {
    // Admin: wipe a corrupted key ->  /api/ticks?del=cc_pk_ticks
    const del = url.searchParams.get('del');
    if (del) {
      if (!ALLOWED_KEYS.includes(del)) return new Response(JSON.stringify({ error: 'Invalid key' }), { status: 400, headers: cors });
      try { await cmd(['DEL', del]); return new Response(JSON.stringify({ ok: true, deleted: del }), { status: 200, headers: cors }); }
      catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors }); }
    }

    const key = url.searchParams.get('key');
    if (!key || !ALLOWED_KEYS.includes(key)) {
      return new Response(JSON.stringify({ error: 'Invalid key' }), { status: 400, headers: cors });
    }
    try {
      const data = await cmd(['GET', key]);
      let value = null;
      if (data && data.result != null) {
        // Parse once (new format). If still a JSON string (legacy double-encoded), parse again.
        try { value = JSON.parse(data.result); } catch { value = data.result; }
        if (typeof value === 'string') { try { value = JSON.parse(value); } catch {} }
      }
      return new Response(JSON.stringify({ data: value }), { status: 200, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { key, value } = body;
      if (!key || !ALLOWED_KEYS.includes(key)) {
        return new Response(JSON.stringify({ error: 'Invalid key' }), { status: 400, headers: cors });
      }
      // null/undefined value = delete the key
      if (value === null || value === undefined) {
        await cmd(['DEL', key]);
        return new Response(JSON.stringify({ ok: true, deleted: key }), { status: 200, headers: cors });
      }
      // SET with 30-day expiry, atomically. Single JSON encode (the fix).
      const data = await cmd(['SET', key, JSON.stringify(value), 'EX', 2592000]);
      const ok = data && (data.result === 'OK' || data.result === 1 || data.result === 'true');
      return new Response(JSON.stringify({ ok: !!ok }), { status: 200, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
}
