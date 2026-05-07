// api/ticks.js — Shared tick state using Upstash Redis
// GET /api/ticks?key=cc_pk_ticks → returns {data: {...}}
// POST /api/ticks with {key, value} → saves and returns {ok: true}
//
// SETUP: Install Upstash Redis from Vercel Marketplace
// This adds UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN automatically

export const config = { runtime: 'edge' };

const ALLOWED_KEYS = ['cc_pk_ticks','cc_staff2_ticks','cc_neg_ticks','cc_auto_log','cc_staff_week'];

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

  const URL   = process.env.UPSTASH_REDIS_REST_URL;
  const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!URL || !TOKEN) {
    // Not configured — tell client to use localStorage fallback
    return new Response(JSON.stringify({ fallback: true }), { status: 200, headers: cors });
  }

  const auth = { Authorization: `Bearer ${TOKEN}` };

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const key = url.searchParams.get('key');
    if (!key || !ALLOWED_KEYS.includes(key)) {
      return new Response(JSON.stringify({ error: 'Invalid key' }), { status: 400, headers: cors });
    }
    try {
      const res = await fetch(`${URL}/get/${key}`, { headers: auth });
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
      // Store with 30-day expiry (TTL in seconds)
      const res = await fetch(`${URL}/set/${key}`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(JSON.stringify(value))
      });
      // Set expiry separately
      await fetch(`${URL}/expire/${key}/2592000`, { method: 'POST', headers: auth });
      const data = await res.json();
      return new Response(JSON.stringify({ ok: data.result === 'OK' }), { status: 200, headers: cors });
    } catch(e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
}
