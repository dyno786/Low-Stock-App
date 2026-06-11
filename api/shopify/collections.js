// api/shopify/collections.js — returns the list of collection titles for the + Shopify menu picker.
// Your collections are smart collections keyed on "TAG EQUALS <title>", so the modal lets staff
// tick titles and passes them as exact-name tags to create-product. Cached 1h on the CDN.
//
// ENV: SHOPIFY_STORE_URL, SHOPIFY_ADMIN_API_TOKEN (scope read_products), SHOPIFY_API_VERSION (optional).

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

export default async function handler(req, res) {
  const store = (process.env.SHOPIFY_STORE_URL || process.env.SHOPIFY_STORE || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN || process.env.SHOPIFY_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;
  if (!store || !token) { res.status(500).json({ error: 'Missing Shopify env vars' }); return; }

  const query = `query($cursor:String){ collections(first:250, after:$cursor){ edges{ node{ title } } pageInfo{ hasNextPage endCursor } } }`;
  let titles = [], cursor = null, pages = 0;
  try {
    while (pages < 10) {
      const r = await fetch('https://' + store + '/admin/api/' + API_VERSION + '/graphql.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query, variables: { cursor } })
      });
      const j = await r.json();
      if (j.errors) { res.status(502).json({ error: 'Shopify', detail: j.errors }); return; }
      const conn = j.data && j.data.collections;
      if (!conn) break;
      conn.edges.forEach(e => { const t = (e.node.title || '').trim(); if (t) titles.push(t); });
      pages++;
      if (!conn.pageInfo.hasNextPage) break;
      cursor = conn.pageInfo.endCursor;
    }
    titles.sort((a, b) => a.localeCompare(b));
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ collections: titles });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
