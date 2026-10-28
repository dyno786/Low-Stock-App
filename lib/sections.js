// Store sections: each branch can be split into areas owned by one person for the day.
// A section has product rules (which products belong to it), a daily checklist that becomes
// tracked jobs, an optional default owner, and shelves the manager can describe later.
import { fail } from './team-store.js';

const BEAUTY = ['AFRO BEAUTY PRODUCTS', 'EURO BEAUTY PRODUCTS', 'AFRO PRODUCTS 2'];
const item = (id, text, photo = false) => ({ id, text, photo });

export const COMMON_CHECKLIST = [
  item('c1', 'Check shelf stock and storage stock before adding to an order.'),
  item('c2', 'Check outstanding orders and incoming transfers.'),
  item('c3', 'Investigate negative stock and count discrepancies.'),
  item('c4', 'Record out-of-stock and low-stock products in the app.'),
  item('c5', 'Identify overstock and flag it for transfer or manager review.'),
  item('c6', 'Build order lists under the correct supplier and brand.'),
  item('c7', 'Enter exact product details and quantities required.'),
  item('c8', 'Submit the order list for manager approval.'),
  item('c9', 'Check received products against the order and report shortages.'),
  item('c10', 'Keep prices, shelf labels and stock records correct.'),
];

// City Centre, from the owner's 6-person staffing map and section task lists (24 Oct 2026).
export function cityCentreTemplate() {
  return {
    enabled: true,
    common: COMMON_CHECKLIST.map(x => ({ ...x })),
    list: [
      { id: 'till', name: 'Till and entrance', area: 'P1 · Till', kind: 'till', defaultOwner: '', rules: [], shelves: [], checklist: [
        item('t1', 'Serve customers and watch the entrance. Call for help when the queue builds.'),
        item('t2', 'Record customer requests and pass them to the relevant section owner.'),
        item('t3', 'Welcome customers and promote the app download.'),
        item('t4', 'Keep the till counter clean and tidy.', true),
      ] },
      { id: 'dyes', name: 'Hair dyes', area: 'P2 · Section 1', kind: 'owner', defaultOwner: '', shelves: [],
        rules: [{ depts: BEAUTY, include: ['DYE', 'COLOUR', 'COLOR', 'DEVELOPER', 'PEROXIDE', 'TINT', 'BLEACH', 'TONER', 'KOLESTON', 'MAXIMA', 'TRUZONE', 'BIGEN', 'SEMI PERM'], exclude: ['COLOUR PROTECT', 'COLOR PROTECT', 'COLOUR SAFE', 'COLOR SAFE', 'NAIL', 'LIP', 'EYE'] }],
        checklist: [
          item('d1', 'Maintain separate order lists for Maxima, Koleston, Truzone and other brands, under their suppliers.'),
          item('d2', 'Order by exact range, shade number, size and quantity.'),
          item('d3', 'Record developers by strength/volume and size.'),
          item('d4', 'Arrange dyes in shade-number order within each range.', true),
          item('d5', 'Keep developers clearly organised alongside the appropriate ranges.', true),
          item('d6', 'Top up, clean and bring products forward.', true),
          item('d7', 'Check prices and identify missing shades.'),
          item('d8', 'Review excess shades and slow-moving stock before ordering more.'),
          item('dt', 'Stock transfers: bag, label and send overstock from your section; book in transfers received. Photo of the labelled bag.', true),
        ] },
      { id: 'oils', name: 'Oils', area: 'P3 · Section 2', kind: 'owner', defaultOwner: '', shelves: [],
        rules: [{ depts: BEAUTY, include: ['OIL'], exclude: ['BEARD', 'MENS', "MEN'S", 'FOR MEN', 'DYE', 'COLOUR', 'COLOR'] }],
        checklist: [
          item('o1', 'Maintain supplier and brand order lists for all oils.'),
          item('o2', 'Record the exact oil type, range, size and quantity.'),
          item('o3', 'Keep bottles grouped and correctly priced.', true),
          item('o4', 'Top up, clean shelves and check for leaks or broken seals.', true),
          item('o5', 'Rotate older stock to the front.'),
          item('o6', 'Review low stock, negatives and overstock.'),
          item('ot', 'Stock transfers: bag, label and send overstock from your section; book in transfers received. Photo of the labelled bag.', true),
        ] },
      { id: 'human', name: 'Human hair, men’s products and wax', area: 'P4 · Section 3', kind: 'owner', defaultOwner: '', shelves: [],
        rules: [
          { depts: ['HUMAN HAIR', 'BRAZILIAN', 'BLENDED', 'CLIP ON EXTENSIONS'], include: [], exclude: [] },
          { depts: [...BEAUTY, 'GENERAL 1'], include: ['MENS', "MEN'S", 'FOR MEN', 'BEARD', 'SHAVE', 'AFTERSHAVE', 'WAX', 'POMADE'], exclude: [] },
        ],
        checklist: [
          item('h1', 'Maintain separate supplier/brand order lists for human hair, men’s products and wax.'),
          item('h2', 'Record human hair by range, style, colour and length.'),
          item('h3', 'Record men’s products and wax by exact product and size.'),
          item('h4', 'Keep products organised, priced and topped up.', true),
          item('h5', 'Check packaging, seals and dates where applicable.'),
          item('h6', 'Review missing lines, stock discrepancies and overstock.'),
          item('ht', 'Stock transfers: bag, label and send overstock from your section; book in transfers received. Photo of the labelled bag.', true),
        ] },
      { id: 'synthetic', name: 'Synthetic hair, wigs and ponytails', area: 'P5 · Hair area', kind: 'owner', defaultOwner: '', shelves: [],
        rules: [{ depts: ['SYNTHETIC HAIR', 'WIGS SYNTHETIC', 'WIGS HUMAN HAIR', 'PONYTAILS SYNTHETIC', 'INSTANT WEAVE SYNTHETIC'], include: [], exclude: [] }],
        checklist: [
          item('s1', 'Maintain three separate order lists: synthetic hair, wigs and ponytails, grouped by supplier and brand.'),
          item('s2', 'Record exact range/style, colour, length and quantity.'),
          item('s3', 'Keep synthetic hair in order: brand → range/style → length → colour.', true),
          item('s4', 'Keep ponytails organised by style, length and colour.', true),
          item('s5', 'Make sure display wigs are displayed, tidy and clearly priced.', true),
          item('s6', 'Match every display wig to its correct stock, box and product details.'),
          item('s7', 'Price every pack and check prices against the till.'),
          item('s8', 'Top up displays and keep spare stock organised.', true),
          item('s9', 'Count stock discrepancies and flag corrections for approval.'),
          item('s10', 'Review missing colours/styles, low stock and overstock before ordering.'),
        ] },
      { id: 'picco', name: 'Picco checks', area: 'Manager · Adnan', kind: 'duty', defaultOwner: '', rules: [], shelves: [], checklist: [
        item('k1', 'Morning: photo of the Picco when you open, showing it undamaged.', true),
        item('k2', 'Night: photo of the Picco before you close, showing it undamaged.', true),
      ] },
      { id: 'support', name: 'Stock support · floating lead', area: 'P6 · Whole shop', kind: 'support', defaultOwner: '', rules: [], shelves: [], checklist: [
        item('p1', 'Fetch stock for section owners when they ask.'),
        item('p2', 'Prepare transfers for products flagged as overstock.'),
        item('p3', 'Check deliveries against orders and report shortages.'),
        item('p4', 'Cover breaks and busy areas.'),
        item('p5', 'Check section work and review order lists.'),
        item('p6', 'Sort products that are not in any section (the General list).'),
      ] },
    ],
  };
}

export function genericTemplate() {
  return { enabled: true, common: COMMON_CHECKLIST.map(x => ({ ...x })), list: [
    { id: 'till', name: 'Till', area: 'Till', kind: 'till', defaultOwner: '', rules: [], shelves: [], checklist: [item('t1', 'Serve customers and watch the entrance.'), item('t2', 'Record customer requests and pass them to the right person.')] },
    { id: 'floor', name: 'Shop floor', area: 'Shop floor', kind: 'owner', defaultOwner: '', rules: [], shelves: [], checklist: [item('f1', 'Top up, clean and face the shelves.', true)] },
  ] };
}

// ---------- validation ----------
const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const words = (arr, max = 60) => (Array.isArray(arr) ? arr : String(arr || '').split(','))
  .map(x => str(x, 60).toUpperCase()).filter(Boolean).slice(0, max);
const safeId = v => /^[a-z0-9-]{1,24}$/.test(String(v || ''));
export function validateSections(input, staff) {
  if (!input || typeof input !== 'object') fail('Invalid sections.');
  const list = Array.isArray(input.list) ? input.list : [];
  if (list.length > 20) fail('Up to 20 sections per branch.');
  const ids = new Set();
  const cleanItems = (arr, prefix) => (Array.isArray(arr) ? arr : []).slice(0, 40).map((x, i) => {
    const text = str(x?.text, 200); if (!text) return null;
    const id = safeId(x?.id) ? x.id : `${prefix}${i + 1}`;
    return { id, text, photo: !!x?.photo };
  }).filter(Boolean);
  const out = { enabled: input.enabled !== false, common: cleanItems(input.common, 'c'), list: [] };
  for (const s of list) {
    const id = safeId(s?.id) ? s.id : null; if (!id || ids.has(id)) fail('Each section needs a unique short id.'); ids.add(id);
    const name = str(s.name, 80); if (!name) fail('Each section needs a name.');
    const kind = ['till', 'owner', 'support', 'duty'].includes(s.kind) ? s.kind : 'owner';
    const owner = typeof s.defaultOwner === 'string' && (s.defaultOwner === '' || Object.hasOwn(staff, s.defaultOwner)) ? s.defaultOwner : '';
    const rules = (Array.isArray(s.rules) ? s.rules : []).slice(0, 10).map(r => ({ depts: words(r?.depts, 40), include: words(r?.include), exclude: words(r?.exclude) })).filter(r => r.depts.length || r.include.length);
    const shelves = (Array.isArray(s.shelves) ? s.shelves : []).slice(0, 40).map((x, i) => ({
      id: safeId(x?.id) ? x.id : `sh${i + 1}`, name: str(x?.name, 80), notes: str(x?.notes, 400),
      photos: (Array.isArray(x?.photos) ? x.photos : []).filter(u => typeof u === 'string' && /^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//.test(u)).slice(0, 6),
    })).filter(x => x.name);
    out.list.push({ id, name, area: str(s.area, 60), kind, defaultOwner: owner, rules, shelves, checklist: cleanItems(s.checklist, id.slice(0, 3)) });
  }
  if (out.list.filter(s => s.kind === 'till').length > 1) fail('Only one till section per branch.');
  return out;
}

// ---------- daily owners + checklist jobs ----------
// Called from allocate(). people = signed-in staff who reviewed training today; till = today's till person.
export function applySections(state, branch, day, people, till, now, gaps) {
  const cfg = state.sections;
  const wanted = new Set();
  if (cfg?.enabled && Array.isArray(cfg.list) && cfg.list.length) {
    const overrides = day.sectionOverrides || {};
    const owners = {}; const taken = new Set();
    // 1. till section follows the till person; 2. manager overrides for today; 3. default owners who are in
    for (const s of cfg.list) if (s.kind === 'till' && till) { owners[s.id] = till; taken.add(till); }
    for (const s of cfg.list) { const o = overrides[s.id]; if (o && people.includes(o) && !owners[s.id]) { owners[s.id] = o; taken.add(o); } }
    // fixed duties (e.g. the manager's morning/night photos) always go to their default owner when in, on top of any section they run
    for (const s of cfg.list) if (s.kind === 'duty' && !owners[s.id] && s.defaultOwner && people.includes(s.defaultOwner)) owners[s.id] = s.defaultOwner;
    for (const s of cfg.list) if (!owners[s.id] && s.kind !== 'till' && s.kind !== 'duty' && s.defaultOwner && people.includes(s.defaultOwner) && !taken.has(s.defaultOwner)) { owners[s.id] = s.defaultOwner; taken.add(s.defaultOwner); }
    // 4. everyone else signed in fills the remaining sections in map order (support last)
    const pool = people.filter(id => !taken.has(id)).sort((a, b) => (day.arrivals[a]?.at || 0) - (day.arrivals[b]?.at || 0));
    for (const s of [...cfg.list.filter(x => x.kind === 'owner'), ...cfg.list.filter(x => x.kind === 'support')]) if (!owners[s.id] && pool.length && !Object.hasOwn(overrides, s.id)) owners[s.id] = pool.shift();
    day.sectionOwners = owners;
    for (const s of cfg.list) {
      const owner = owners[s.id] || '';
      if (!owner) gaps.push({ job: 'section', section: s.id, reason: `${s.name}: nobody is on this section today.` });
      const items = [...(s.kind === 'owner' ? (cfg.common || []) : []), ...(s.checklist || [])];
      for (const it of items) {
        const id = `sec-${s.id}-${it.id}`; wanted.add(id);
        let t = day.tasks.find(x => x.id === id);
        if (!t) { t = { id, kind: 'check', section: s.id, sectionName: s.name, category: 'section', title: it.text, photoRequired: !!it.photo, photos: [], priority: 'normal', notes: '', due: '', status: 'pending', createdAt: now, history: [], minutes: 5 }; day.tasks.push(t); }
        t.archived = false; t.sectionName = s.name; t.title = it.text; t.photoRequired = !!it.photo;
        if (t.status !== 'done' && t.assignee !== owner) { (t.history ||= []).push({ at: now, by: 'automatic', assignee: owner }); t.assignee = owner; t.assignedAt = now; t.updatedAt = now; }
      }
    }
  } else day.sectionOwners = {};
  // retire checklist jobs whose section or item no longer exists (finished work is kept)
  for (const t of day.tasks) if (t.kind === 'check' && !wanted.has(t.id) && t.status !== 'done') t.archived = true;
}
