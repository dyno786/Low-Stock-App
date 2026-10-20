// Attendance data and opaque sessions are private Redis keys, never generic ticks.
export const BRANCHES = [
  { id: 0, name: 'Chapeltown', file: 'chapeltown.html', color: '#7c3aed' },
  { id: 1, name: 'City Centre', file: 'citycenter.html', color: '#2563eb' },
  { id: 2, name: 'Roundhay', file: 'roundhay.html', color: '#0f766e' },
  { id: 3, name: 'Warehouse', file: 'warehouse.html', color: '#c2410c' },
];
export function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
export async function redis(command) {
  const url = process.env.KV_REST_API_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) fail('Attendance storage is not configured. Please contact the manager.', 503);
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(8000) });
  if (!res.ok) fail('Attendance storage is unavailable. Nothing has been confirmed saved.', 503);
  const result = await res.json();
  if (result.error) fail('Attendance storage could not save this change. Please retry.', 503);
  return result.result;
}
export const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
export async function sha(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join(''); }
export function equal(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
export function londonDay(ts = Date.now()) { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ts); const get = k => p.find(x => x.type === k).value; return `${get('year')}-${get('month')}-${get('day')}`; }
export function londonMinutes(ts = Date.now()) { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ts); return +p.find(x => x.type === 'hour').value * 60 + +p.find(x => x.type === 'minute').value; }
export function clockMinutes(value) { const [h, m] = value.split(':').map(Number); return h * 60 + m; }
export function clock(value) { return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
export function branchId(value) { if (value === null || value === undefined || value === '' || !/^\d$/.test(String(value)) || !BRANCHES[Number(value)]) fail('Choose a valid branch.'); return Number(value); }
function decode(raw) { if (!raw) return null; let val = raw; for (let i = 0; i < 2 && typeof val === 'string'; i++) { try { val = JSON.parse(val); } catch { return null; } } return val; }
export async function loadBranch(id) {
  const key = `attendance:v2:branch:${id}`;
  let raw = await redis(['GET', key]);
  if (!raw) {
    const legacy = id < 3 ? decode(await redis(['GET', `cc_team${id}`])) : null;
    const state = { staff: {}, days: {}, shiftStart: '09:00', revision: 0 };
    for (const [k, s] of Object.entries(legacy?.staff || {})) {
      if (['__proto__', 'constructor', 'prototype'].includes(k) || !s || typeof s.name !== 'string') continue;
      state.staff[k] = { name: s.name.slice(0, 80), legacyHash: s.hash, active: !s.removed, shiftStart: '09:00' };
    }
    // Preserve historical arrivals; the old store remains untouched for recovery.
    for (const [date, d] of Object.entries(legacy?.days || {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      state.days[date] = { arrivals: {}, tasks: [] };
      for (const [k, s] of Object.entries(d.signins || {})) {
        if (!Object.hasOwn(state.staff, k) || !Number.isFinite(s.ts)) continue;
        state.days[date].arrivals[k] = { name: s.name || state.staff[k].name, at: s.ts, lateMinutes: Math.max(0, londonMinutes(s.ts) - 540), legacy: true, ...(s.outTs ? { outAt: s.outTs } : {}) };
      }
    }
    await redis(['SET', key, JSON.stringify(state), 'NX']);
    raw = await redis(['GET', key]);
  }
  const state = decode(raw);
  if (!state || !state.staff || !state.days) fail('Attendance data needs manager attention.', 503);
  return { key, raw, state };
}
// Compare-and-set prevents simultaneous phones from overwriting one another.
const CAS = "if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]); return 1 else return 0 end";
export async function mutateBranch(id, update) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { key, raw, state } = await loadBranch(id);
    const result = update(state);
    state.revision = (state.revision || 0) + 1;
    if (await redis(['EVAL', CAS, 1, key, raw, JSON.stringify(state)]) === 1) return { state, result };
  }
  fail('Another device is updating this branch. Please retry.', 409);
}
export function todayState(state, date = londonDay()) { return state.days[date] ||= { arrivals: {}, tasks: [] }; }
export function cookie(req, name) { const entry = (req.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '=')); return entry?.slice(name.length + 1) || ''; }
export async function session(req, name = 'cc_attendance') {
  const token = cookie(req, name); if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return decode(await redis(['GET', 'attendance:session:' + await sha(token)]));
}
export async function makeSession(data, seconds = 43200) {
  const token = random(); await redis(['SET', 'attendance:session:' + await sha(token), JSON.stringify(data), 'EX', seconds]); return token;
}
export function sessionCookie(name, token, seconds = 43200) { return `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`; }
export async function requireManager(req) { const s = await session(req, 'cc_manager'); if (s?.role !== 'manager') fail('Please sign in as manager.', 401); return s; }
export async function limit(req, bucket, max = 12) {
  const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const key = `attendance:limit:${bucket}:${await sha(ip)}:${Math.floor(Date.now() / 900000)}`;
  const n = await redis(['INCR', key]); if (n === 1) await redis(['EXPIRE', key, 960]);
  if (n > max) fail('Too many attempts. Please wait 15 minutes before trying again.', 429);
}
export async function hashPin(pin, salt = random()) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 210000 }, material, 256);
  return { salt, hash: Array.from(new Uint8Array(bits), x => x.toString(16).padStart(2, '0')).join('') };
}
export function publicStaff(state) { return Object.entries(state.staff).map(([id, s]) => ({ id, name: s.name, active: s.active, shiftStart: s.shiftStart || state.shiftStart, seniority: s.seniority || 'new', skills: s.skills || {}, confirmedSkills: s.confirmedSkills || {}, trainingUpdatedAt: s.trainingUpdatedAt || null })); }
export function requestOrigin(req) { const u = new URL(req.url); const proto = req.headers.get('x-forwarded-proto') || u.protocol.replace(':', ''); const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || u.host; return `${proto}://${host}`; }
