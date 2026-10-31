import { BRANCHES, fail, redis, random, sha, equal, londonDay, londonMinutes, clockMinutes, clock, branchId, loadBranch, mutateBranch, todayState, cookie, session, makeSession, sessionCookie, requireManager, limit, hashPin, publicStaff, requestOrigin } from '../lib/team-store.js';
import { SKILLS, LEVELS, branchConfig, training, allocate } from '../lib/allocation.js';
import { endWork, closeArrival, pauseStaffTasks } from '../lib/work-time.js';
import { locationConfig, checkLocation, geocode } from '../lib/location.js';
import { validateSections, cityCentreTemplate, genericTemplate } from '../lib/sections.js';
export const config = { runtime: 'edge' };
const LEGACY_MANAGER_HASH = '77f1cec5dabf986e5d5aea8b199033ecaa62b0f991e27512ddf3ee3fb6c86cd7';
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...headers } });
async function qrRecord(branch, rotate = false) {
  const at = Date.now(), minute = Math.floor(at / 60000);
  const date = londonDay(at); const key = `attendance:qr:v3:${branch}:${minute}`;
  if (rotate) await redis(['SET', key, random(), 'EX', 180]);
  else await redis(['SET', key, random(), 'NX', 'EX', 180]);
  return { date, token: await redis(['GET', key]), expiresAt: (minute + 1) * 60000 };
}
async function validQr(branch, token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) fail('Scan today’s QR code on the branch computer.', 401);
  const key = `attendance:qr:v3:${branch}:${Math.floor(Date.now()/60000)}`;
  const current = await redis(['GET', key]);
  if (!equal(token, current)) fail('This QR code has expired or was rotated. Scan the current code on the branch computer.', 401);
  return key;
}
// Phone tag for each scan: a random id the phone keeps + a short browser/model summary + a hashed network address.
function deviceSummary(ua=''){
  ua=String(ua);let m;
  if(/iPhone/.test(ua))return 'iPhone'+((m=ua.match(/OS (\d+)_/))?' iOS '+m[1]:'');
  if(/iPad/.test(ua))return 'iPad'+((m=ua.match(/OS (\d+)_/))?' iOS '+m[1]:'');
  if(/Android/.test(ua)){m=ua.match(/Android [\d.]+;\s*([^;)]+?)(?:\s+Build|\))/);return 'Android'+(m&&m[1]&&!/^[a-z]{2}-[a-z]{2}$/i.test(m[1].trim())?' · '+m[1].trim().slice(0,30):'');}
  if(/Windows/.test(ua))return 'Windows PC';if(/Macintosh/.test(ua))return 'Mac';
  return ua?'Other device':'Unknown';
}
async function deviceTag(req, body, at){
  const id=typeof body.device==='string'&&/^[a-f0-9]{16,40}$/.test(body.device)?body.device:'';
  const ip=req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'';
  return {at,id:id||('nodevice-'+(await sha(ip+'|'+(req.headers.get('user-agent')||''))).slice(0,12)),model:deviceSummary(req.headers.get('user-agent')),net:ip?(await sha('net|'+ip)).slice(0,8):'',anon:!id};
}
// UK mobile -> +447xxxxxxxxx; also accepts other international numbers starting with +.
function ukMobile(v){ const raw=String(v||'').replace(/[\s()-]/g,''); if(!raw) return ''; let n=raw; if(/^07\d{9}$/.test(n)) n='+44'+n.slice(1); else if(/^447\d{9}$/.test(n)) n='+'+n; else if(/^00\d{8,15}$/.test(n)) n='+'+n.slice(2); if(!/^\+\d{8,15}$/.test(n)) fail('Enter a mobile number like 07700 900123.'); return n; }
function otherOnPhone(state, date, staff, device){
  if (!device || device.anon) return null;
  const d = state.days?.[date]; if (!d) return null;
  for (const [sid, a] of Object.entries(d.arrivals || {})) { if (sid === staff) continue; if ((a.devices || []).some(x => x.id === device.id && !x.override)) return a.name || 'someone else'; }
  return null;
}
async function verifyScan(branch, body) {
  if (!body.ticket) return validQr(branch, body.token);
  if (!/^[a-f0-9]{64}$/.test(body.ticket)) fail('Scan the current branch QR code again.', 401);
  const raw = await redis(['GET', 'attendance:scan:' + await sha(body.ticket)]);
  const proof = raw ? JSON.parse(raw) : null;
  if (!proof || proof.branch !== branch || proof.date !== londonDay()) fail('Your sign-in window has expired. Scan the current branch QR code again.', 401);
  const current = await redis(['GET', proof.qrKey]);
  if (!equal(current, proof.token)) fail('This code was rotated. Scan the current branch QR again.', 401);
}
async function activeStaffSession(req) {
  const s = await session(req); if (s?.role !== 'staff' || s.date !== londonDay()) fail('Please scan today’s branch QR code and sign in.', 401);
  const { state } = await loadBranch(s.branch);
  if (!state.staff[s.staff]?.active || !todayState(state).arrivals[s.staff] || todayState(state).arrivals[s.staff].outAt) fail('Your shift has ended. Scan the branch QR code to sign in again.', 401);
  return { s, state };
}
export default async function handler(req) {
  try {
    if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' });
    if (req.method === 'POST') {
      const origin = req.headers.get('origin');
      if ((origin && origin !== requestOrigin(req)) || req.headers.get('sec-fetch-site') === 'cross-site') fail('Please use this app directly.', 403);
      if (!req.headers.get('content-type')?.includes('application/json')) fail('JSON required.', 415);
      if (Number(req.headers.get('content-length') || 0) > 64000) fail('Request too large.', 413);
    }
    const url = new URL(req.url); let body = {};
    if (req.method === 'POST') { try { const raw = await req.text(); if (raw.length > 64000) fail('Request too large.', 413); body = JSON.parse(raw); } catch (e) { if (e.status) throw e; fail('Invalid request.'); } }
    const action = req.method === 'GET' ? url.searchParams.get('action') : body.action;
    const postOnly = !['status', 'dashboard', 'me', 'qr', 'health', 'report', 'sections'].includes(action);
    if (postOnly && req.method !== 'POST') fail('POST required.', 405);
    if(action === 'health') {
      // Report the storage provider's own status message (no credentials) so limits/outages are diagnosable.
      const u=process.env.KV_REST_API_URL||process.env.KV_URL||process.env.UPSTASH_REDIS_REST_URL, k=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
      let status=0,detail='';try{const r=await fetch(u,{method:'POST',headers:{Authorization:`Bearer ${k}`,'Content-Type':'application/json'},body:JSON.stringify(['PING']),signal:AbortSignal.timeout(8000)});status=r.status;const j=await r.json().catch(()=>({}));detail=String(j.error||j.result||'').slice(0,200);}catch(e){detail=String(e.message||e).slice(0,200);}
      return json(detail==='PONG'?{ok:true,storage:'connected',now:Date.now()}:{ok:false,error:'Attendance storage is unavailable.',storageStatus:status,storageMessage:detail,now:Date.now()},detail==='PONG'?200:503);
    }
    if (action === 'sections') { // public: which products belong to which section (no staff data)
      const b = branchId(url.searchParams.get('branch')); const { state } = await loadBranch(b); const secs = state.sections?.enabled ? (state.sections.list || []) : [];
      return json({ branch: b, sections: secs.map(x => ({ id: x.id, name: x.name, area: x.area, kind: x.kind, rules: x.rules, brands: x.brands || [] })) }, 200, { 'Cache-Control': 'no-store' });
    }
    if (action === 'status') {
      const m = await session(req, 'cc_manager'); const k = await session(req, 'cc_kiosk');
      return json({ manager: m?.role === 'manager', kiosk: k?.role === 'kiosk' ? { branch: k.branch } : null, branches: BRANCHES, skills: SKILLS, date: londonDay(), now: Date.now() });
    }
    if (action === 'manager-login') {
      await limit(req, 'manager', 10);
      if (typeof body.password !== 'string' || body.password.length > 200) fail('Enter your manager password.');
      const expected = process.env.ATTENDANCE_MANAGER_PASSWORD;
      const valid = expected ? equal(await sha(body.password), await sha(expected)) : equal(await sha('cc-wh-mgr|' + body.password), LEGACY_MANAGER_HASH);
      if (!valid) fail('Incorrect manager password.', 401);
      const token = await makeSession({ role: 'manager' }, 28800);
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('cc_manager', token, 28800) });
    }
    if (action === 'manager-logout' || action === 'logout' || action === 'unpair') {
      const name = action === 'manager-logout' ? 'cc_manager' : action === 'unpair' ? 'cc_kiosk' : 'cc_attendance';
      if (action === 'unpair') await requireManager(req);
      const token = cookie(req, name); if (token) await redis(['DEL', 'attendance:session:' + await sha(token)]);
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(name, '', 0) });
    }
    if (action === 'pair') {
      await requireManager(req); const branch = branchId(body.branch);
      const token = await makeSession({ role: 'kiosk', branch }, 7776000);
      return json({ ok: true, branch }, 200, { 'Set-Cookie': sessionCookie('cc_kiosk', token, 7776000) });
    }
    if (action === 'qr' || action === 'rotate') {
      const k = await session(req, 'cc_kiosk'); const m = await session(req, 'cc_manager');
      if (action === 'rotate' && m?.role !== 'manager') fail('Manager sign-in is required to rotate early.', 401);
      const branch = branchId(action === 'rotate' ? body.branch : url.searchParams.get('branch') ?? k?.branch);
      const q = await qrRecord(branch, action === 'rotate');
      const {state}=await loadBranch(branch); const day=todayState(state);
      const roster=publicStaff(state).filter(s=>s.active||day.arrivals[s.id]).map(s=>{const a=day.arrivals[s.id];return {name:s.name,at:a?.at||null,outAt:a?.outAt||null,status:!a?'Not signed in':a.outAt?'Clocked out':'Clocked in'};});
      return json({ ...q, roster, branch, name: BRANCHES[branch].name, url: requestOrigin(req) + `/asim.html?branch=${branch}#scan=${q.token}`, now: Date.now() });
    }
    if (action === 'scan') {
      await limit(req, 'scan', 240); const branch = branchId(body.branch); const qrKey=await validQr(branch, body.token);
      const { state } = await loadBranch(branch);
      const ticket = random();
      await redis(['SET', 'attendance:scan:' + await sha(ticket), JSON.stringify({branch, date:londonDay(), token:body.token, qrKey}), 'EX', 90]);
      return json({ branch, ticket, date: londonDay(), name: BRANCHES[branch].name, locationRequired:!!state.location?.required, locationConfigured:!!state.location, staff: publicStaff(state).filter(s => s.active).map(({ id, name }) => ({ id, name })) });
    }
    if (action === 'checkin') {
      const branch = branchId(body.branch); await limit(req, 'staff:' + branch, 60);
      await verifyScan(branch, body);
      if (body.mode && !['in','out'].includes(body.mode)) fail('Choose clock in or clock out.');
      if (typeof body.staff !== 'string' || !/^\d{4,8}$/.test(body.pin || '')) fail('Choose your name and enter your 4–8 digit PIN.');
      const { state } = await loadBranch(branch); const person = Object.hasOwn(state.staff, body.staff) ? state.staff[body.staff] : null;
      if (!person?.active) fail('Staff member unavailable.', 401);
      await limit(req, `pin:${branch}:${await sha(body.staff)}`, 10);
      const valid = person.salt ? equal((await hashPin(body.pin, person.salt)).hash, person.hash) : person.legacyHash && equal(await sha(`cc-staff|${branch}|${body.staff}|${body.pin}`), person.legacyHash);
      if (!valid) fail('Incorrect PIN.', 401);
      checkLocation(body.location,state.location,branch);
      const date = londonDay(); const at = Date.now();
      const device = await deviceTag(req, body, at);
      // One phone, one person per day: a phone that already clocked someone else in/out today is refused (manager signed in on that phone can override).
      const mgrOverride = (await session(req, 'cc_manager'))?.role === 'manager';
      const pre = mgrOverride ? null : otherOnPhone(state, date, body.staff, device);
      if (pre) {
        await mutateBranch(branch, st => { const d = todayState(st, date); (d.deviceBlocks ||= []).push({ at, staff: body.staff, name: person.name, usedBy: pre, mode: body.mode || 'in', model: device.model, device: device.id }); if (d.deviceBlocks.length > 200) d.deviceBlocks.splice(0, d.deviceBlocks.length - 200); });
        fail(`This phone was already used to clock in ${pre} today. Everyone must clock in on their own phone. If yours isn't working, ask the manager.`, 409);
      }
      if (body.ticket) {
        const consumed = await redis(['DEL','attendance:scan:' + await sha(body.ticket)]);
        if (!consumed) fail('This scan has already been used. Scan the current code again.',401);
      }
      const upgraded = person.salt ? null : await hashPin(body.pin);
      const { result } = await mutateBranch(branch, state => {
        const p = state.staff[body.staff];
        if (!p?.active || p.hash !== person.hash || p.legacyHash !== person.legacyHash) fail('Staff details changed. Please try signing in again.', 409);
        if (upgraded) { Object.assign(p, upgraded); delete p.legacyHash; }
        const tag=checkLocation(body.location,state.location,branch,at);
        const d = todayState(state, date);
        const clash = mgrOverride ? null : otherOnPhone(state, date, body.staff, device);
        if (clash) fail(`This phone was already used to clock in ${clash} today. Everyone must clock in on their own phone. If yours isn't working, ask the manager.`, 409);
        if (mgrOverride) device.override = 'manager';
        const prior = d.arrivals[body.staff];
        if (body.mode === 'out') {
          if (!prior || prior.outAt) fail('You are not clocked in at this branch today. Ask the manager if a record needs correcting.');
          prior.locationEvents ||= []; prior.locationEvents.push({...tag,mode:'out'}); prior.location=tag; (prior.devices ||= []).push({...device,mode:'out'});
          closeArrival(prior,at); pauseStaffTasks(d,body.staff,at); allocate(state,branch); return prior;
        }
        if (!prior) d.arrivals[body.staff] = { name: p.name, at, sessions:[{in:at}], shiftStart:p.shiftStart || state.shiftStart, lateMinutes: Math.max(0, londonMinutes(at) - clockMinutes(p.shiftStart || state.shiftStart)), verified: true, location:tag, locationEvents:[{...tag,mode:'in'}], devices:[{...device,mode:'in'}] };
        else if (prior.outAt) { prior.location=tag; (prior.locationEvents ||= []).push({...tag,mode:'in'}); (prior.devices ||= []).push({...device,mode:'in'}); prior.sessions ||= [{in:prior.at,out:prior.outAt}]; prior.sessions.push({in:at}); prior.returns ||= []; prior.returns.push(at); delete prior.outAt; }
        return d.arrivals[body.staff];
      });
      if (body.mode === 'out') return json({ok:true,mode:'out',arrival:result,branch},200,{'Set-Cookie':sessionCookie('cc_attendance','',0)});
      const token = await makeSession({ role: 'staff', branch, staff: body.staff, date }, 86400);
      return json({ ok: true, arrival: result, branch, file: BRANCHES[branch].file }, 200, { 'Set-Cookie': sessionCookie('cc_attendance', token, 86400) });
    }
    if (action === 'me') {
      const { s, state } = await activeStaffSession(req); const d = todayState(state);
      const secs = state.sections?.enabled ? (state.sections.list || []) : []; const owners = d.sectionOwners || {};
      const mySections = secs.filter(x => owners[x.id] === s.staff).map(x => ({ id: x.id, name: x.name, area: x.area, kind: x.kind, rules: x.rules, brands: x.brands || [], shelves: x.shelves }));
      const week = [6,5,4,3,2,1,0].map(n => { const day = londonDay(Date.now() - n * 86400000); const ts = (state.days[day]?.tasks || []).filter(t => t.assignee === s.staff && !t.archived); return { day, given: ts.length, done: ts.filter(t => t.status === 'done').length }; });
      return json({ week, mySections, allSectionRules: secs.map(x => ({ id: x.id, name: x.name, area: x.area, kind: x.kind, rules: x.rules, brands: x.brands || [] })), branch: s.branch, name: state.staff[s.staff].name, staff: s.staff, date: s.date, arrival: d.arrivals[s.staff], profile: publicStaff(state).find(p => p.id === s.staff), tasks: d.tasks.filter(t => t.assignee === s.staff && !t.archived), till: d.till === s.staff, needsTrainingReview: d.arrivals[s.staff].trainingDate !== s.date, skills: SKILLS, now: Date.now() });
    }
    if (action === 'phone-save') {
      const { s } = await activeStaffSession(req); const phone = ukMobile(body.phone); if (!phone) fail('Enter your mobile number.');
      await mutateBranch(s.branch, state => { const p = state.staff[s.staff]; if (!p) fail('Staff member unavailable.', 401); p.phone = phone; p.phoneUpdatedAt = Date.now(); });
      return json({ ok: true, phone });
    }
    if (action === 'training-save') {
      const { s } = await activeStaffSession(req);
      const skills = {};
      for (const skill of SKILLS) { const level = body.skills?.[skill.id]; if (!LEVELS.includes(level)) fail('Choose a training level for every job.'); skills[skill.id] = level; }
      await mutateBranch(s.branch, state => {
        const p = state.staff[s.staff]; if (!p?.active || todayState(state).arrivals[s.staff]?.outAt) fail('Your shift has ended.', 401);
        p.skills = skills; p.trainingUpdatedAt = Date.now(); todayState(state).arrivals[s.staff].trainingDate = londonDay(); allocate(state, s.branch);
      }); return json({ ok: true });
    }
    if (action === 'task-status' || action === 'checkout') {
      const { s } = await activeStaffSession(req);
      const { result } = await mutateBranch(s.branch, state => {
        if (!state.staff[s.staff]?.active) fail('Your staff access has changed.', 403);
        const d = todayState(state); if (!d.arrivals[s.staff] || d.arrivals[s.staff].outAt) fail('Your shift has ended.', 401);
        if (action === 'checkout') fail('Scan the current QR on the branch computer and choose Clock out.');
        const task = d.tasks.find(t => t.id === body.id && t.assignee === s.staff && !t.archived);
        if (!task) fail('Task no longer assigned to you.', 404);
        if (task.category === 'till') fail('Till cover stays active until your shift ends or the manager changes cover.');
        if (task.trainingBuddy) {
          const buddy = d.arrivals[task.trainingBuddy];
          if (!buddy || buddy.outAt || !state.staff[task.trainingBuddy]?.active || training(state.staff[task.trainingBuddy], task.category) !== 'trained') fail('Your training buddy is unavailable. Ask the manager to arrange supervision.', 409);
        }
        if (!['pending', 'progress', 'done'].includes(body.status)) fail('Invalid task status.');
        const at=Date.now();
        if (task.status === body.status) return task;
        if (body.status === 'progress') for(const other of d.tasks) if(other.id!==task.id && other.assignee===s.staff && other.status==='progress' && !other.archived){endWork(other,at);other.status='pending';other.updatedAt=at;(other.history ||= []).push({at,by:s.staff,status:'pending',event:'Paused when another task started'});}
        if (task.status === 'progress') endWork(task,at);
        if (body.status === 'progress') { task.startedAt ||= at; task.runningSince=at; delete task.completedAt; }
        if (body.status === 'done' && task.photoRequired && !(task.photos||[]).length) fail('Add a photo of the finished work first, then mark it completed.');
        if (body.status === 'done') task.completedAt=at;
        else delete task.completedAt;
        task.status = body.status; task.updatedAt = at; task.history ||= []; task.history.push({ at, by: s.staff, status: body.status }); return task;
      });
      return json({ ok: true, result });
    }
    await requireManager(req);
    if (action === 'report') {
      await requireManager(req);
      const to = url.searchParams.get('to') || londonDay(); const from = url.searchParams.get('from') || to;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) fail('Invalid date range.');
      const branches = await Promise.all(BRANCHES.map(async branch => { const { state } = await loadBranch(branch.id);
        const days = {}; for (const [date, d] of Object.entries(state.days)) if (date >= from && date <= to) days[date] = { arrivals: d.arrivals || {}, tasks: (d.tasks || []).filter(t => !t.archived), till: d.till || '', gaps: d.gaps || [] };
        return { id: branch.id, name: branch.name, file: branch.file, color: branch.color, staff: publicStaff(state), deletedStaff: state.deletedStaff || {}, days, shiftStart: state.shiftStart, config: branchConfig(state, branch.id), sections: state.sections || null }; }));
      return json({ from, to, today: londonDay(), now: Date.now(), branches, skills: SKILLS });
    }
    if (action === 'dashboard') {
      const date = url.searchParams.get('date') || londonDay(); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('Invalid date.');
      const branches = await Promise.all(BRANCHES.map(async branch => { const { state } = await loadBranch(branch.id); return { ...branch, sections: state.sections || null, staff: publicStaff(state), day: state.days[date] || { arrivals: {}, tasks: [] }, shiftStart: state.shiftStart, config: branchConfig(state, branch.id), location:state.location||null }; }));
      return json({ date, today: londonDay(), now: Date.now(), branches, skills: SKILLS });
    }
    const branch = branchId(body.branch);
    if (action === 'staff-save') {
      const name = String(body.name || '').trim(); if (!name || name.length > 80) fail('Enter a staff name (up to 80 characters).');
      if (!clock(body.shiftStart)) fail('Enter a valid shift start time.');
      const id = body.id || random().slice(0, 20); if (typeof id !== 'string' || id.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(id)) fail('Invalid staff ID.');
      if (body.pin && !/^\d{4,8}$/.test(body.pin)) fail('PIN must contain 4–8 digits.');
      const hashed = body.pin ? await hashPin(body.pin) : null;
      await mutateBranch(branch, state => {
        const existing = Object.hasOwn(state.staff, id) ? state.staff[id] : null;
        if (!existing && !hashed) fail('Enter a PIN for the new staff member.');
        if (Object.entries(state.staff).some(([k, s]) => k !== id && s.active && s.name.toLowerCase() === name.toLowerCase())) fail('That staff name already exists at this branch.');
        if (!['new', 'experienced', 'senior'].includes(body.seniority || 'new')) fail('Choose an experience level.');
        state.staff[id] = { ...existing, ...hashed, name, active: body.active !== false, shiftStart: body.shiftStart, seniority: body.seniority || 'new' };
        if (body.phone !== undefined) { const ph = ukMobile(body.phone); if (ph) state.staff[id].phone = ph; else delete state.staff[id].phone; }
        if (hashed) delete state.staff[id].legacyHash;
        allocate(state, branch);
      }); return json({ ok: true, id });
    }
    if (action === 'sections-save') {
      await mutateBranch(branch, state => { state.sections = validateSections(body.sections, state.staff); allocate(state, branch); }); return json({ ok: true });
    }
    if (action === 'sections-template') {
      await mutateBranch(branch, state => { if (state.sections?.list?.length && !body.replace) fail('This branch already has sections. Edit them instead.'); state.sections = branch === 1 ? cityCentreTemplate() : genericTemplate(); allocate(state, branch); }); return json({ ok: true });
    }
    if (action === 'section-owner') {
      await mutateBranch(branch, state => {
        const sec = state.sections?.list?.find(x => x.id === body.section); if (!sec) fail('Section not found.', 404);
        if (sec.kind === 'till') fail('The till section follows today’s till cover. Change it with the till selector.');
        const d = todayState(state); d.sectionOverrides ||= {};
        if (body.staff === null || body.staff === undefined) delete d.sectionOverrides[sec.id];
        else { if (body.staff !== '' && (!Object.hasOwn(state.staff, body.staff) || !state.staff[body.staff].active)) fail('Choose an active staff member.'); d.sectionOverrides[sec.id] = body.staff; }
        allocate(state, branch);
      }); return json({ ok: true });
    }
    if (action === 'staff-delete') {
      if (typeof body.staff !== 'string' || !body.staff) fail('Choose a staff member.');
      await mutateBranch(branch, state => {
        const p = Object.hasOwn(state.staff, body.staff) ? state.staff[body.staff] : null; if (!p) fail('Staff member not found.', 404);
        // History (arrivals, tasks) keeps the name; the login itself is removed.
        state.deletedStaff ||= {}; state.deletedStaff[body.staff] = { name: p.name, deletedAt: Date.now() };
        delete state.staff[body.staff];
        const d = todayState(state); if (d.till === body.staff) d.till = '';
        allocate(state, branch);
      }); return json({ ok: true });
    }
    if (action === 'training-confirm') {
      await mutateBranch(branch, state => {
        const p = Object.hasOwn(state.staff, body.staff) ? state.staff[body.staff] : null; if (!p) fail('Staff member not found.');
        const skills = {};
        for (const skill of SKILLS) { if (!LEVELS.includes(body.skills?.[skill.id])) fail('Choose a level for every skill.'); skills[skill.id] = body.skills[skill.id]; }
        p.confirmedSkills = skills; p.trainingUpdatedAt = Date.now(); p.trainingConfirmedAt = Date.now(); allocate(state, branch);
      }); return json({ ok: true });
    }
    if (action === 'geocode') {
      await requireManager(req); await limit(req, 'geocode', 40);
      return json({ ok: true, results: await geocode(body.query) });
    }
    if (action === 'location-configure') {
      const location=locationConfig(body.location);
      await mutateBranch(branch,state=>{state.location=location;}); return json({ok:true});
    }
    if (action === 'configure') {
      const allowed = SKILLS.filter(s => s.id !== 'till').map(s => s.id);
      if (!Array.isArray(body.enabled) || !Array.isArray(body.tillDuties) || body.enabled.some(k => !allowed.includes(k)) || body.tillDuties.some(k => !body.enabled.includes(k))) fail('Choose valid branch jobs and till duties.');
      await mutateBranch(branch, state => { state.config = { enabled: [...new Set(body.enabled)], tillDuties: [...new Set(body.tillDuties)], tillRequired: branch !== 3 }; allocate(state, branch); }); return json({ ok: true });
    }
    if (action === 'allocate' || action === 'set-till') {
      await mutateBranch(branch, state => {
        if (action === 'set-till') {
          if (branch === 3) fail('Warehouse does not require till cover.');
          const p = Object.hasOwn(state.staff, body.staff) ? state.staff[body.staff] : null;
          const arrival = todayState(state).arrivals[body.staff];
          if (!p?.active || !arrival || arrival.outAt || arrival.trainingDate !== londonDay() || training(p, 'till') !== 'trained') fail('Till cover must be trained, signed in and have reviewed today’s training.');
          todayState(state).till = body.staff;
        }
        allocate(state, branch);
      }); return json({ ok: true });
    }
    if (action === 'task-save') {
      const title = String(body.title || '').trim(); if (!title || title.length > 160) fail('Enter a task title (up to 160 characters).');
      const notes = String(body.notes || '').slice(0, 2000);
      if (body.due && !clock(body.due)) fail('Enter a valid due time.');
      const categories = ['pick', 'neg', 'over', 'shop', 'img', 'low', 'till', 'custom'];
      if (!categories.includes(body.category)) fail('Invalid task category.');
      if (!['normal', 'high', 'urgent'].includes(body.priority)) fail('Invalid priority.');
      const id = body.id || random().slice(0, 20);
      await mutateBranch(branch, state => {
        if (!Object.hasOwn(state.staff, body.assignee) || !state.staff[body.assignee]?.active) fail('Choose an active staff member.');
        const d = todayState(state); const existing = d.tasks.find(t => t.id === id);
        if (body.id && !existing) fail('Task not found.', 404);
        if (existing?.auto && body.category !== existing.category) fail('Keep the work type for this automatic task. Create a new task for a different type of work.');
        if (body.category === 'till') fail('Use the till cover selector to keep exactly one person on the till.');
        const buddy = body.trainingBuddy || '';
        if (buddy) {
          if (!Object.hasOwn(state.staff, buddy) || buddy === body.assignee || !state.staff[buddy]?.active || !d.arrivals[buddy] || d.arrivals[buddy].outAt || training(state.staff[buddy], body.category) !== 'trained') fail('Choose a different signed-in colleague who is trained in this job.');
          if (d.till === buddy && !branchConfig(state, branch).tillDuties.includes(body.category)) fail('The till person cannot leave the till to supervise this job. Choose another trained colleague.');
        }
        const needsSupport = body.category !== 'custom' && training(state.staff[body.assignee], body.category) !== 'trained' && !buddy;
        if (d.till === body.assignee && !branchConfig(state, branch).tillDuties.includes(body.category)) fail('This person is covering the till. Choose a permitted quiet-period duty or assign someone else.');
        const photoRequired = body.photoRequired === undefined ? (existing ? !!existing.photoRequired : body.category === 'custom') : !!body.photoRequired;
        const task = { id, title, notes, photoRequired, photos: existing?.photos || [], category: body.category, priority: body.priority, assignee: body.assignee, due: body.due || '', trainingBuddy: buddy, needsSupport, status: existing?.status || 'pending', createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now(), assignedAt:existing?.assignee===body.assignee?(existing.assignedAt||existing.createdAt):Date.now(), history: existing?.history || [], manualAssignment: true };
        if(existing && existing.assignee!==body.assignee && existing.status==='progress'){endWork(existing,task.updatedAt);task.status='pending';}
        task.history.push({ at: task.updatedAt, by: 'manager', assignee: task.assignee });
        if (existing) Object.assign(existing, task); else d.tasks.push(task);
      }); return json({ ok: true, id });
    }
    if (action === 'task-archive') {
      await mutateBranch(branch, state => { const task = todayState(state).tasks.find(t => t.id === body.id); if (!task) fail('Task not found.', 404); if (task.category === 'till') fail('Till cover cannot be removed. Choose a different trained till person.'); task.archived = true; task.updatedAt = Date.now(); endWork(task,task.updatedAt); }); return json({ ok: true });
    }
    fail('Unknown action.', 404);
  } catch (e) { if (!e.status) console.error('Attendance request failed:', e.name); return json({ error: e.status ? e.message : 'Attendance could not be saved. Please retry.' }, e.status || 503); }
}
