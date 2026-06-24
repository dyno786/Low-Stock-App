// api/shopify/drafts.js
// Vercel serverless function (Node 18+, ESM). Zero npm deps — uses global fetch.
//
// Lists DRAFT products straight from the Shopify Admin API so the app can show
// "on Shopify but DRAFT — activate" for items that are in stock but not published.
// (The per-barcode /exists check skips items that already have an image, so
//  image-having drafts were invisible — this endpoint closes that gap.)
//
// GET /api/shopify/drafts
// Returns: { drafts: { "<barcode>": { t:title, img:url, admin:adminUrl, inv:totalInventory } }, count }
//
// Env vars (same as exists.js):
//   SHOPIFY_STORE_URL, SHOPIFY_ADMIN_API_TOKEN, SHOPIFY_API_VERSION (optional)

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";
const STORE = (process.env.SHOPIFY_STORE_URL || process.env.SHOPIFY_STORE || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN || process.env.SHOPIFY_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;

export const config = { maxDuration: 30 };

async function gql(query, variables) {
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

const Q = `
  query ($cursor: String) {
    products(first: 250, query: "status:draft", after: $cursor) {
      edges { node {
        id title totalInventory
        featuredImage { url }
        variants(first: 50) { edges { node { barcode } } }
      } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

export default async function handler(req, res) {
  try {
    const drafts = {};
    let cursor = null, pages = 0;
    do {
      const data = await gql(Q, { cursor });
      const conn = data && data.products;
      const edges = (conn && conn.edges) || [];
      for (const e of edges) {
        const p = e.node;
        const idNum = String(p.id).split("/").pop();
        const admin = STORE ? `https://${STORE}/admin/products/${idNum}` : null;
        const img = (p.featuredImage && p.featuredImage.url) || null;
        const vs = (p.variants && p.variants.edges) || [];
        for (const v of vs) {
          const bc = String((v.node && v.node.barcode) || "").trim();
          if (bc && !drafts[bc]) drafts[bc] = { t: p.title, img, admin, inv: p.totalInventory };
        }
      }
      cursor = (conn && conn.pageInfo && conn.pageInfo.hasNextPage) ? conn.pageInfo.endCursor : null;
      pages++;
    } while (cursor && pages < 12);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ drafts, count: Object.keys(drafts).length });
  } catch (err) {
    return res.status(500).json({ error: String((err && err.message) || err) });
  }
}
