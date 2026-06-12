// api/shopify/_collections.js
// Reads the store's smart collections and extracts, for each, the EXACT tag that places a product
// into it (the "TAG EQUALS <condition>" rule — which is often NOT the same as the collection title).
// Also exposes vendor-driven collection vendors. Cached in module memory for warm invocations.
// Underscore prefix => Vercel does not treat this as a route.

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';
const STORE = (process.env.SHOPIFY_STORE_URL || process.env.SHOPIFY_STORE || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN || process.env.SHOPIFY_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;

let _cache = null, _ts = 0;
const TTL = 10 * 60 * 1000; // 10 minutes

// Returns { tags:[{title,tag}], vendors:[exact vendor strings] }
export async function fetchCollectionMenu() {
  if (_cache && (Date.now() - _ts) < TTL) return _cache;
  if (!STORE || !TOKEN) return { tags: [], vendors: [] };
  const q = 'query($cursor:String){ collections(first:250, after:$cursor){ edges{ node{ title ruleSet{ rules{ column relation condition } } } } pageInfo{ hasNextPage endCursor } } }';
  let tags = [], vendors = [], cursor = null, pages = 0, seenTag = {}, seenVen = {};
  try {
    while (pages < 10) {
      const r = await fetch('https://' + STORE + '/admin/api/' + API_VERSION + '/graphql.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
        body: JSON.stringify({ query: q, variables: { cursor } })
      });
      const j = await r.json();
      const conn = j && j.data && j.data.collections;
      if (!conn) break;
      for (const e of conn.edges) {
        const node = e.node || {};
        const title = (node.title || '').trim();
        const rules = (node.ruleSet && node.ruleSet.rules) || [];
        for (const ru of rules) {
          if (!ru || !ru.condition) continue;
          const cond = String(ru.condition).trim();
          if (ru.column === 'TAG' && ru.relation === 'EQUALS') {
            const k = cond.toLowerCase();
            if (!seenTag[k]) { seenTag[k] = 1; tags.push({ title, tag: cond }); }
          } else if (ru.column === 'VENDOR' && ru.relation === 'EQUALS') {
            const k = cond.toLowerCase();
            if (!seenVen[k]) { seenVen[k] = 1; vendors.push(cond); }
          }
        }
      }
      pages++;
      if (!conn.pageInfo.hasNextPage) break;
      cursor = conn.pageInfo.endCursor;
    }
    tags.sort((a, b) => a.tag.localeCompare(b.tag));
    vendors.sort((a, b) => a.localeCompare(b));
    _cache = { tags, vendors }; _ts = Date.now();
    return _cache;
  } catch (e) {
    return _cache || { tags: [], vendors: [] };
  }
}

// Compact list of collection tags for the AI prompt.
export function collectionOptionsText(menu) {
  const t = (menu && menu.tags) || [];
  return t.map(c => (c.title && c.title !== c.tag) ? ('- ' + c.tag + '   (puts it in the "' + c.title + '" collection)') : ('- ' + c.tag)).join('\n');
}

// Keep only AI-returned tags that exactly match a real collection tag (case-insensitive), returned in canonical case.
export function validCollectionTags(arr, menu) {
  const t = (menu && menu.tags) || [];
  const byLower = {}; for (const c of t) byLower[c.tag.toLowerCase()] = c.tag;
  const out = [], seen = {};
  for (let x of (Array.isArray(arr) ? arr : [])) {
    const canon = byLower[String(x || '').trim().toLowerCase()];
    if (canon && !seen[canon.toLowerCase()]) { seen[canon.toLowerCase()] = 1; out.push(canon); }
  }
  return out;
}

// If the AI's brand matches a vendor-driven collection vendor exactly (case-insensitive), return canonical vendor.
export function canonicalVendor(brand, menu) {
  const v = (menu && menu.vendors) || [];
  const b = String(brand || '').trim().toLowerCase();
  for (const ven of v) if (ven.toLowerCase() === b) return ven;
  return null;
}
