// api/shopify/tagged.js
// Returns every product carrying a given Shopify tag, as barcode -> { title, image, size, status }.
// Lets the app build "order lists" driven live by Shopify tags (e.g. top100, warehouse).
//
// Usage:  GET /api/shopify/tagged?tag=top100
// Returns: { tag, count, products: [ { barcode, title, image, size, status } ] }
//
// Env (Vercel):
//   SHOPIFY_STORE_URL        e.g. cchairandbeauty.myshopify.com
//   SHOPIFY_ADMIN_API_TOKEN  Admin API token (scopes: read_products)
//   SHOPIFY_API_VERSION      optional, defaults to 2025-01

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";
const STORE = (process.env.SHOPIFY_STORE_URL || process.env.SHOPIFY_STORE || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN || process.env.SHOPIFY_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;

export const config = { maxDuration: 30 };

async function shopifyGraphQL(query, variables) {
  if (!STORE || !TOKEN) throw new Error("Missing SHOPIFY_STORE_URL or SHOPIFY_ADMIN_API_TOKEN");
  const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error("GraphQL: " + JSON.stringify(json.errors));
  return json.data;
}

const clean = (b) => String(b == null ? "" : b).trim();

const TAGGED_QUERY = `
  query ($q: String!, $cursor: String) {
    products(first: 100, query: $q, after: $cursor) {
      edges {
        node {
          id title status handle
          featuredImage { url }
          variants(first: 50) { edges { node { barcode sku selectedOptions { name value } } } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  const tag = clean((req.query && req.query.tag) || (req.body && req.body.tag) || "");
  if (!tag) { res.status(400).json({ error: "Missing ?tag=" }); return; }
  if (!STORE || !TOKEN) { res.status(500).json({ error: "Missing SHOPIFY_STORE_URL or SHOPIFY_ADMIN_API_TOKEN" }); return; }

  try {
    const q = `tag:'${tag.replace(/'/g, "")}'`;
    let cursor = null, hasNext = true, pages = 0;
    const seen = {};
    const products = [];
    while (hasNext && pages < 12) {
      pages++;
      const data = await shopifyGraphQL(TAGGED_QUERY, { q, cursor });
      const conn = (data && data.products) || { edges: [], pageInfo: {} };
      (conn.edges || []).forEach((e) => {
        const p = e.node;
        const img = (p.featuredImage && p.featuredImage.url) || null;
        (((p.variants && p.variants.edges) || [])).forEach((ve) => {
          const bc = clean(ve.node && ve.node.barcode);
          if (!bc || seen[bc]) return;
          seen[bc] = 1;
          const size = ((ve.node.selectedOptions || [])
            .map((o) => o.value)
            .filter((v) => v && v !== "Default Title")
            .join(" ")) || "";
          products.push({ barcode: bc, title: p.title, image: img, size, status: p.status, productId: String(p.id||''), variantTitle: (ve.node.selectedOptions||[]).map(function(o){return o.value;}).filter(function(v){return v&&v!=='Default Title';}).join(' ') });
        });
      });
      hasNext = conn.pageInfo && conn.pageInfo.hasNextPage;
      cursor = conn.pageInfo && conn.pageInfo.endCursor;
    }
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    res.status(200).json({ tag, count: products.length, products });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
