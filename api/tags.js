// /api/tags  —  pulls a { barcode: [tags] } map straight from Shopify Admin API.
// Mirrors /api/vendors. The browser app fetches this; the Shopify token never leaves the server.
//
// Uses the SAME env vars as /api/vendors:
//   SHOPIFY_STORE        e.g.  cchairandbeauty.myshopify.com
//   SHOPIFY_ADMIN_TOKEN  Admin API access token with read_products
//
// Result is cached on Vercel's CDN for 6h, so the slow full pull happens rarely.

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const SHOP  = (process.env.SHOPIFY_STORE_URL || process.env.SHOPIFY_STORE || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const TOKEN = process.env.SHOPIFY_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!SHOP || !TOKEN) {
    res.status(500).json({ error: 'Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN env vars' });
    return;
  }

  const endpoint = `https://${SHOP}/admin/api/2024-10/graphql.json`;
  const query = `query($cursor:String){
    products(first:250, after:$cursor){
      edges{ node{ tags variants(first:100){ edges{ node{ barcode } } } } }
      pageInfo{ hasNextPage endCursor }
    }
  }`;

  const map = {};
  let cursor = null, pages = 0;

  try {
    while (pages < 80) {                 // safety cap (~20k products)
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
        body: JSON.stringify({ query, variables: { cursor } })
      });
      const j = await r.json();
      if (j.errors) { res.status(502).json({ error: 'Shopify error', detail: j.errors }); return; }
      const conn = j && j.data && j.data.products;
      if (!conn) break;
      conn.edges.forEach(e => {
        const tags = (e.node.tags || []).map(t => ('' + t).trim()).filter(Boolean);
        if (!tags.length) return;
        e.node.variants.edges.forEach(ve => {
          const bc = (ve.node.barcode || '').trim();
          if (bc) { map[bc] = tags; }
        });
      });
      pages++;
      if (!conn.pageInfo.hasNextPage) break;
      cursor = conn.pageInfo.endCursor;
    }
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400'); // 6h fresh, serve-stale 24h
    res.status(200).json(map);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
