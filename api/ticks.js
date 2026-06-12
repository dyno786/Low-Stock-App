// api/ticks.js — Shared tick state using Upstash Redis
// Supports all variable names Vercel might inject from Upstash integration

export const config = { runtime: 'edge' };

const ALLOWED_KEYS = ['cc_pk_ticks','cc_staff2_ticks','cc_neg_ticks','cc_auto_log','cc_staff_week','cc_whns0','cc_whns1','cc_whns2'];

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: cors });
  }

  // Use whichever variable name Vercel injected
  const REDIS_URL   = process.env.KV_REST_API_URL   || process.env.KV_URL || process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.KV_REST_API_TOKEN  || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!REDIS_URL || !REDIS_TOKEN) {
    return new Response(JSON.stringify({ fallback: true, hint: 'missing env vars' }), { status: 200, headers: cors });
  }

  const auth = { Authorization: `Bearer ${REDIS_TOKEN}` };

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const key = url.searchParams.get('key');
    if (!key || !ALLOWED_KEYS.includes(key)) {
      return new Response(JSON.stringify({ error: 'Invalid key' }), { status: 400, headers: cors });
    }
    try {
      const res = await fetch(`${REDIS_URL}/get/${key}`, { headers: auth });
      const data = await res.json();
      const value = data.result ? JSON.parse(data.result) : null;
      return new Response(JSON.stringify({ data: value }), { status: 200, headers: cors });
    } catch(e) {
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
      const res = await fetch(`${REDIS_URL}/set/${key}`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(JSON.stringify(value))
      });
      // 30 day expiry
      await fetch(`${REDIS_URL}/expire/${key}/2592000`, { method: 'POST', headers: auth });
      const data = await res.json();
      return new Response(JSON.stringify({ ok: data.result === 'OK' }), { status: 200, headers: cors });
    } catch(e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
}
