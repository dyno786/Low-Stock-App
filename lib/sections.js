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

// City Centre: five sections from the owner's map (31 Oct 2026) plus the manager's Picco photo duty.
const T=(id,text,photo=false)=>item(id,text,photo);
export function cityCentreTemplate() {
  return {
    enabled: true,
    common: COMMON_CHECKLIST.map(x => ({ ...x })),
    list: [
      { id: 's1', name: 'Till · makeup, lenses, electrical, lashes', area: 'Section 1 · Till', kind: 'till', defaultOwner: '', shelves: [],
        rules: [{ depts: ['MAKEUP', 'NAILCARE', 'ELECTRICAL', ...BEAUTY, 'GENERAL 1'], include: ['MAKEUP', 'LIPSTICK', 'LIP GLOSS', 'LIPGLOSS', 'GLOSS', 'MASCARA', 'FOUNDATION', 'EYELINER', 'EYESHADOW', 'LASH', 'EYELASH', 'CONTACT LENS', 'LENSES', 'LENS', 'ELECTRIC', 'STRAIGHTENER', 'DRYER', 'CLIPPER', 'TRIMMER', 'CURLER', 'HOT COMB', 'NAIL'], exclude: [] }],
        checklist: [
          T('t1', 'Serve customers and watch the entrance. Call for help when the queue builds.'),
          T('t2', 'Record customer requests and pass them to the right section.'),
          T('t3', 'Welcome customers and promote the app download.'),
          T('t4', 'Keep the till counter clean and tidy.', true),
          T('t5', 'Clean under the counter and the till area.', true),
          T('t6', 'Makeup and lip glosses topped up, faced and priced. Count the lines and note what is low.', true),
          T('t7', 'Eyelashes and contact lenses: stock counted, missing styles noted for the order list.'),
          T('t8', 'Electricals displayed, priced, boxes complete. Flag damaged boxes.', true),
          T('t9', 'Order lists for makeup, lashes, lenses and electrical under the correct supplier and brand.'),
        ] },
      { id: 's2', name: 'Hair dyes, Moroccan oil, L’Oréal care, peroxide', area: 'Section 2', kind: 'owner', defaultOwner: '', shelves: [],
        rules: [{ depts: BEAUTY, include: ['DYE', 'COLOUR', 'COLOR', 'DEVELOPER', 'PEROXIDE', 'TINT', 'BLEACH', 'TONER', 'KOLESTON', 'MAXIMA', 'TRUZONE', 'BIGEN', 'SEMI PERM', 'MOROCCAN', 'MOROCCANOIL', 'LOREAL', "L'OREAL", 'ELVIVE', 'ARGAN'], exclude: ['COLOUR PROTECT', 'COLOR PROTECT', 'COLOUR SAFE', 'COLOR SAFE', 'NAIL', 'LIPSTICK', 'LASH'] }],
        checklist: [
          T('d1', 'Separate order lists for Maxima, Koleston, Truzone and other dye brands, under their suppliers.'),
          T('d2', 'Order by exact range, shade number, size and quantity.'),
          T('d3', 'Arrange dyes in shade-number order within each range.', true),
          T('d4', 'Developers and peroxide organised by strength/volume and size next to their ranges.', true),
          T('d5', 'Moroccan oil and L’Oréal care faced, topped up and priced.', true),
          T('d6', 'Accessories on this section tidy and hooks full.'),
          T('d7', 'Check prices and note missing shades.'),
          T('d8', 'Review excess shades and slow-moving stock before ordering more.'),
          T('d9', 'Stock transfers: bag, label and send overstock; book in transfers received. Photo of the labelled bag.', true),
        ] },
      { id: 's3', name: 'Oils, kids, Palmer’s', area: 'Section 3', kind: 'owner', defaultOwner: '', shelves: [],
        rules: [{ depts: [...BEAUTY, 'GENERAL 1', 'KIDS'], include: ['OIL', 'KIDS', 'KID', 'BABY', 'CHILD', 'JUNIOR', 'PALMER', 'COCOA BUTTER', 'SHEA'], exclude: ['BEARD', 'MENS', "MEN'S", 'FOR MEN', 'MOROCCAN', 'DYE', 'COLOUR', 'COLOR', 'LASH'] }],
        checklist: [
          T('o1', 'Supplier and brand order lists for all oils, the kids range and Palmer’s.'),
          T('o2', 'Record the exact oil type, range, size and quantity.'),
          T('o3', 'Oils grouped by brand, bottles faced and priced.', true),
          T('o4', 'Check for leaks, broken seals and sticky shelves; clean as needed.', true),
          T('o5', 'Kids section topped up, tidy and priced.', true),
          T('o6', 'Palmer’s range complete and faced; note missing lines.'),
          T('o7', 'Rotate older stock to the front.'),
          T('o8', 'Review low stock, negatives and overstock.'),
          T('o9', 'Stock transfers: bag, label and send overstock; book in transfers received. Photo of the labelled bag.', true),
        ] },
      { id: 's4', name: 'Human hair, Xpression, men’s care, wax, lotions, accessories', area: 'Section 4', kind: 'owner', defaultOwner: '', shelves: [],
        rules: [
          { depts: ['HUMAN HAIR', 'BRAZILIAN', 'BLENDED', 'CLIP ON EXTENSIONS'], include: [], exclude: [] },
          { depts: ['SYNTHETIC HAIR', ...BEAUTY, 'GENERAL 1', 'ACCESSORIES'], include: ['XPRESSION', 'X-PRESSION', 'MENS', "MEN'S", 'FOR MEN', 'BEARD', 'SHAVE', 'AFTERSHAVE', 'WAX', 'POMADE', 'LOTION', 'ACCESSOR', 'COMB', 'BRUSH', 'BONNET', 'DURAG', 'SCARF', 'CAP', 'CLIP', 'BAND'], exclude: ['DYE', 'COLOUR', 'COLOR'] },
        ],
        checklist: [
          T('h1', 'Separate order lists for human hair, Xpression, men’s care, wax, lotions and accessories.'),
          T('h2', 'Record human hair by range, style, colour and length.'),
          T('h3', 'Xpression colours in number order, packs faced.', true),
          T('h4', 'Men’s care, wax and lotions topped up, faced and priced.', true),
          T('h5', 'Accessory hooks full and tidy.', true),
          T('h6', 'Check packaging, seals and dates where applicable.'),
          T('h7', 'Review missing lines, stock discrepancies and overstock.'),
          T('h8', 'Stock transfers: bag, label and send overstock; book in transfers received. Photo of the labelled bag.', true),
        ] },
      { id: 's5', name: 'Synthetic hair, wigs, ponytails', area: 'Section 5', kind: 'owner', defaultOwner: '', shelves: [],
        rules: [{ depts: ['SYNTHETIC HAIR', 'WIGS SYNTHETIC', 'WIGS HUMAN HAIR', 'PONYTAILS SYNTHETIC', 'INSTANT WEAVE SYNTHETIC', 'WIGS'], include: [], exclude: ['XPRESSION', 'X-PRESSION'] }],
        checklist: [
          T('w1', 'Three order lists: synthetic hair, wigs and ponytails, grouped by supplier and brand.'),
          T('w2', 'Record exact range/style, colour, length and quantity.'),
          T('w3', 'Synthetic hair in order: brand → range/style → length → colour.', true),
          T('w4', 'Ponytails organised by style, length and colour.', true),
          T('w5', 'Display wigs displayed, tidy and clearly priced.', true),
          T('w6', 'Match every display wig to its stock, box and product details.'),
          T('w7', 'Price every pack and check prices against the till.'),
          T('w8', 'Top up displays and keep spare stock organised.', true),
          T('w9', 'Count stock discrepancies and flag corrections for approval.'),
          T('w10', 'Review missing colours/styles, low stock and overstock before ordering.'),
        ] },
      { id: 'picco', name: 'Picco checks', area: 'Manager · Adnan', kind: 'duty', defaultOwner: '', rules: [], shelves: [], checklist: [
        T('k1', 'Morning: photo of the Picco when you open, showing it undamaged.', true),
        T('k2', 'Night: photo of the Picco before you close, showing it undamaged.', true),
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
