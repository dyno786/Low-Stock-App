// /api/orders  —  recent UNFULFILLED Shopify orders, trimmed for the picking view.
// The browser app polls this; the Shopify token never leaves the server.
//
// REQUIRED Vercel environment variables (same as the other endpoints):
//   SHOPIFY_STORE        e.g.  cchairandbeauty.myshopify.com
//   SHOPIFY_ADMIN_TOKEN  Admin API access token (shpat_…)
//
// The token's custom app needs the **read_orders** scope. (Shopify → Settings → Apps and
// sales channels → Develop apps → your app → Admin API scopes → tick read_orders → Save →
// Install/Update.) No customer PII is requested here (no name/email/address) to keep the
// app clear of Shopify's protected-customer-data requirements — only what picking needs.
//
// Cached ~20s on the edge so frequent polling is cheap.

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const SHOP  = (process.env.SHOPIFY_STORE_URL || process.env.SHOPIFY_STORE || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const TOKEN = process.env.SHOPIFY_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!SHOP || !TOKEN) {
    res.status(500).json({ error: 'Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN env vars' });
    return;
  }

  const endpoint = `https://${SHOP}/admin/api/2024-10/graphql.json`;
  const query = `query($cursor:String){
    orders(first:40, after:$cursor, sortKey:CREATED_AT, reverse:true, query:"fulfillment_status:unfulfilled AND status:open"){
      edges{ node{
        id name createdAt displayFulfillmentStatus displayFinancialStatus tags
        currentTotalPriceSet{ shopMoney{ amount currencyCode } }
        lineItems(first:60){ edges{ node{ quantity title sku variantTitle variant{ title barcode sku } } } }
      } }
      pageInfo{ hasNextPage endCursor }
    }
  }`;

  try {
    const out = [];
    let cursor = null, pages = 0;
    while (pages < 2) {                     // up to ~80 most-recent open orders
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
        body: JSON.stringify({ query, variables: { cursor } })
      });
      const j = await r.json();
      if (j.errors) { res.status(502).json({ error: 'Shopify error', detail: j.errors }); return; }
      const conn = j.data && j.data.orders;
      if (!conn) break;
      conn.edges.forEach(e => {
        const n = e.node;
        const items = (n.lineItems && n.lineItems.edges || []).map(le => {
          const it = le.node;
          return {
            barcode: (it.variant && it.variant.barcode) || '',
            sku: (it.variant && it.variant.sku) || it.sku || '',
            title: it.title || '',
            variant: it.variantTitle || (it.variant && it.variant.title) || '',
            qty: it.quantity || 0
          };
        });
        out.push({
          id: n.id,
          name: n.name,                                   // e.g. "#1234"
          createdAt: n.createdAt,
          fulfillment: n.displayFulfillmentStatus || '',
          financial: n.displayFinancialStatus || '',
          tags: n.tags || [],
          total: (n.currentTotalPriceSet && n.currentTotalPriceSet.shopMoney && n.currentTotalPriceSet.shopMoney.amount) || '',
          currency: (n.currentTotalPriceSet && n.currentTotalPriceSet.shopMoney && n.currentTotalPriceSet.shopMoney.currencyCode) || '',
          items
        });
      });
      pages++;
      if (!conn.pageInfo || !conn.pageInfo.hasNextPage) break;
      cursor = conn.pageInfo.endCursor;
    }
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40');
    res.status(200).json({ orders: out, at: Date.now() });
  } catch (e) {
    res.status(500).json({ error: 'Fetch failed', detail: String(e && e.message || e) });
  }
}
