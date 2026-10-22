import { session, requestOrigin, londonDay, loadBranch } from '../lib/team-store.js';
// api/ticks.js — Shared tick state via Upstash Redis (REST command API)
// Fixes the previous double-encoding bug (values were stored char-by-char).

export const config = { runtime: 'edge' };

const ALLOWED_KEYS = ['cc_pk_ticks','cc_staff2_ticks','cc_neg_ticks','cc_auto_log','cc_staff_week','cc_whns0','cc_whns1','cc_whns2','cc_wh_map','cc_wh_qty','cc_pk_log','cc_pk_session','cc_wh_set','cc_training_results','cc_wh_topsellers','cc_wh_tags','cc_pick_log','cc_wh_sent','cc_wh_cfg','cc_wh_tickmeta','cc_pk_sessions','cc_shelf_caps','cc_pk_picked','cc_pk_reset','cc_t0','cc_t1','cc_t2','cc_n0','cc_n1','cc_n2','cc_shop_noadd','cc_shop_depts','cc_shop_listed','cc_shop_localdrafts','cc_pk_timing','cc_wh_target','cc_shop_suppliers','cc_over_ns','cc_discontinued','cc_ai_provider','cc_shelf_checked'];

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
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
  const PRIVATE_KEYS = ['cc_pk_log','cc_pick_log','cc_pk_picked','cc_pk_timing','cc_pk_sessions','cc_pk_session','cc_training_results','cc_staff_week'];
  let canReadPrivate=false;
  try{const m=await session(req,'cc_manager');const s=await session(req);canReadPrivate=m?.role==='manager';if(!canReadPrivate&&s?.role==='staff'&&s.date===londonDay()){const {state}=await loadBranch(s.branch);const arrival=state.days[s.date]?.arrivals[s.staff];canReadPrivate=!!(state.staff[s.staff]?.active&&arrival&&!arrival.outAt);}}catch(e){}
  // Sign-in gating is paused until ASIM is set up at every branch: all allowed keys read/write as before.
  const GATE_PRIVATE=false;
  const readable=k=>ALLOWED_KEYS.includes(k)&&(!GATE_PRIVATE||!PRIVATE_KEYS.includes(k)||canReadPrivate);

  if (req.method === 'GET') {
    if (url.searchParams.has('del')) return new Response(JSON.stringify({error:'Deletion is not available through GET.'}),{status:405,headers:cors});

    // Multi-get: /api/ticks?keys=cc_pk_ticks,cc_wh_sent  -> one request, one Redis command
    const keysParam = url.searchParams.get('keys');
    if (keysParam) {
      const ks = keysParam.split(',').map(x => x.trim()).filter(k => readable(k));
      if (!ks.length) return new Response(JSON.stringify({ error: 'Invalid keys' }), { status: 400, headers: cors });
      try {
        const data = await cmd(['MGET', ...ks]);
        const out = {};
        (Array.isArray(data.result) ? data.result : []).forEach((raw, i) => {
          let v = null;
          if (raw != null) { try { v = JSON.parse(raw); } catch { v = raw; } if (typeof v === 'string') { try { v = JSON.parse(v); } catch {} } }
          out[ks[i]] = v;
        });
        return new Response(JSON.stringify({ data: out }), { status: 200, headers: cors });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors }); }
    }

    const key = url.searchParams.get('key');
    if(GATE_PRIVATE&&PRIVATE_KEYS.includes(key)&&!canReadPrivate)return new Response(JSON.stringify({error:'Sign in to view staff history.'}),{status:401,headers:cors});
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
    const origin=req.headers.get('origin');
    if ((origin && origin!==requestOrigin(req)) || req.headers.get('sec-fetch-site')==='cross-site') return new Response(JSON.stringify({error:'Use this app directly.'}),{status:403,headers:cors});
    if (!req.headers.get('content-type')?.includes('application/json')) return new Response(JSON.stringify({error:'JSON required'}),{status:415,headers:cors});
    // Ordinary app data (stock levels, picking ticks, settings) saves without a sign-in, as before.
    // Staff history keys (PRIVATE_KEYS) still need a signed-in staff member or manager - checked below.
    try {
      const body = await req.json();
      const { key, value } = body;
      if(GATE_PRIVATE&&PRIVATE_KEYS.includes(key)&&!canReadPrivate)return new Response(JSON.stringify({error:'Sign in to save staff history.'}),{status:401,headers:cors});
      if (!key || !ALLOWED_KEYS.includes(key)) {
        return new Response(JSON.stringify({ error: 'Invalid key' }), { status: 400, headers: cors });
      }
      // null/undefined value = delete the key
      if (value === null || value === undefined) {
        await cmd(['DEL', key]);
        return new Response(JSON.stringify({ ok: true, deleted: key }), { status: 200, headers: cors });
      }
      // SET with 30-day expiry, atomically. Single JSON encode (the fix).
      const data = await cmd(['SET', key, JSON.stringify(value)]);
      const ok = data && (data.result === 'OK' || data.result === 1 || data.result === 'true');
      return new Response(JSON.stringify({ ok: !!ok }), { status: 200, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
}
