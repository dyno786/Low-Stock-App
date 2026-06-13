// api/shopify/exists.js
// Vercel serverless function (Node 18+, ESM). Zero npm dependencies — uses global fetch.
//
// Answers "is this barcode already a product on Shopify?" — LIVE, straight from the
// Admin API, instead of relying on the once-a-day ShopifyImages sheet (which can be
// incomplete and causes the app to show "+ Shopify" on products that are in fact
// already listed).
//
// Usage:
//   POST { "barcodes": ["34285634124", "5056538302760", ...] }
//   GET  /api/shopify/exists?barcodes=34285634124,5056538302760
//
// Returns:
//   {
//     results: {
//       "34285634124": { exists:true, status:"ACTIVE", hasImage:true,
//                        title:"...", productUrl:"https://.../products/123",
//                        adminUrl:"https://<store>/admin/products/123" }
//     },
//     missing: ["...barcodes not found on Shopify..."]
//   }
//
// Env vars (Vercel project settings):
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
const uniq = (arr) => [...new Set((arr || []).map(clean).filter(Boolean))];
function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

// Build a Shopify product search across many barcodes in one query.
// e.g.  barcode:'34285634124' OR barcode:'5056538302760'
function barcodeQuery(barcodes) {
  return barcodes.map((b) => `barcode:'${b.replace(/'/g, "")}'`).join(" OR ");
}

const PRODUCTS_QUERY = `
  query ($q: String!) {
    products(first: 250, query: $q) {
      edges { node {
        id title status handle onlineStoreUrl
        featuredImage { url }
        variants(first: 100) { edges { node { barcode } } }
      } }
    }
  }`;

export default async function handler(req, res) {
  try {
    let barcodes = [];
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      barcodes = body.barcodes || body.barcode || [];
      if (typeof barcodes === "string") barcodes = barcodes.split(",");
    } else {
      const q = (req.query && (req.query.barcodes || req.query.barcode)) || "";
      barcodes = String(q).split(",");
    }
    barcodes = uniq(barcodes);
    if (!barcodes.length) return res.status(400).json({ error: "No barcodes provided" });
    if (barcodes.length > 200) barcodes = barcodes.slice(0, 200); // safety cap

    const results = {};
    // Batch to keep each search query a sane length (~30 barcodes per request).
    for (const group of chunk(barcodes, 30)) {
      const data = await shopifyGraphQL(PRODUCTS_QUERY, { q: barcodeQuery(group) });
      const edges = (data && data.products && data.products.edges) || [];
      for (const e of edges) {
        const p = e.node;
        const idNum = String(p.id).split("/").pop();
        const info = {
          exists: true,
          status: p.status,                       // ACTIVE | DRAFT | ARCHIVED
          hasImage: !!(p.featuredImage && p.featuredImage.url),
          title: p.title,
          productUrl: p.onlineStoreUrl || null,
          adminUrl: STORE ? `https://${STORE}/admin/products/${idNum}` : null,
        };
        const vs = (p.variants && p.variants.edges) || [];
        for (const v of vs) {
          const bc = clean(v.node && v.node.barcode);
          if (bc && group.includes(bc) && !results[bc]) results[bc] = info;
        }
      }
    }
    const missing = barcodes.filter((b) => !results[b]);
    return res.status(200).json({ results, missing });
  } catch (err) {
    return res.status(500).json({ error: String((err && err.message) || err) });
  }
}
