// api/shopify/braids.js
// Vercel serverless function (Node 18+, ESM). Zero npm dependencies — uses global fetch.
//
// Powers the Orders (re-order) tab. Returns braid products grouped by SUPPLIER, driven by
// the tags we set up:  tag:'<Supplier>' AND tag:braids AND status:active
//
//   GET /api/shopify/braids                  -> { suppliers:[{key,label,tag}] }   (build the tabs)
//   GET /api/shopify/braids?supplier=kuknus  -> { key,label, products:[ {id,title,
//                                                  colourOption,lengthOption,
//                                                  variants:[{barcode,colour,length}] } ] }
//
// Adding a brand later = add one line to SUPPLIERS below and tag its products
// `<Supplier>` + `braids`. (Plain supplier-name tags, per the agreed scheme.)
//
// Env vars (Vercel project settings):
//   SHOPIFY_STORE_URL        e.g. cchairandbeauty.myshopify.com
//   SHOPIFY_ADMIN_API_TOKEN  Admin API token (scopes: read_products)
//   SHOPIFY_API_VERSION      optional, defaults to 2025-01

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";
const STORE = (process.env.SHOPIFY_STORE_URL || process.env.SHOPIFY_STORE || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN || process.env.SHOPIFY_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;

export const config = { maxDuration: 30 };

// ---- the braid suppliers that appear as tabs (label = shown, tag = Shopify tag) ----
const SUPPLIERS = [
  { key: "xpression", label: "Xpression",   tag: "Xpression" },
  { key: "cherish",   label: "Cherish",     tag: "Cherish" },
  { key: "kuknus",    label: "Kuknus",      tag: "Kuknus" },
  { key: "smart",     label: "Smart Braid", tag: "Smart Braid" },
];

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

const PRODUCTS_QUERY = `
  query ($q: String!, $after: String) {
    products(first: 50, query: $q, after: $after) {
      edges { node {
        id title status
        options { name values }
        variants(first: 100) { edges { node { barcode selectedOptions { name value } } } }
      } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

// Decide which option is the colour and which (if any) is the length/size — by name,
// so it works regardless of "Color" / "Colors" / "Colours" / "color" / "Size" etc.
const isColourName = (n) => /colou?rs?|shade/i.test(n || "");
const isLengthName = (n) => /size|length|inch|"|''|cm\b/i.test(n || "");

function classifyOptions(options) {
  const opts = options || [];
  let colour = opts.find((o) => isColourName(o.name));
  let length = opts.find((o) => o !== colour && isLengthName(o.name));
  // fallbacks: if no name matched, assume the option with most values is the colour
  if (!colour) {
    colour = opts.slice().sort((a, b) => (b.values || []).length - (a.values || []).length)[0] || null;
  }
  if (!length) length = opts.find((o) => o !== colour) || null; // any 2nd option is the length/size
  return { colourName: colour ? colour.name : null, lengthName: length ? length.name : null };
}

function valueFor(selectedOptions, name) {
  if (!name) return null;
  const so = (selectedOptions || []).find((s) => s.name === name);
  return so ? so.value : null;
}

async function fetchSupplier(sup) {
  const q = `tag:'${sup.tag.replace(/'/g, "")}' AND tag:braids AND status:active`;
  const products = [];
  let after = null, guard = 0;
  do {
    const data = await shopifyGraphQL(PRODUCTS_QUERY, { q, after });
    const conn = (data && data.products) || { edges: [], pageInfo: {} };
    for (const e of conn.edges) {
      const p = e.node;
      const { colourName, lengthName } = classifyOptions(p.options);
      const variants = ((p.variants && p.variants.edges) || []).map((ve) => {
        const v = ve.node;
        return {
          barcode: (v.barcode || "").trim(),
          colour: valueFor(v.selectedOptions, colourName) || (v.selectedOptions && v.selectedOptions[0] && v.selectedOptions[0].value) || "",
          length: valueFor(v.selectedOptions, lengthName),
        };
      });
      products.push({
        id: String(p.id).split("/").pop(),
        title: p.title,
        colourOption: colourName,
        lengthOption: lengthName,
        variants,
      });
    }
    after = conn.pageInfo && conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after && ++guard < 10);
  return products;
}

export default async function handler(req, res) {
  try {
    const key = (req.query && (req.query.supplier || req.query.brand)) || "";
    // cache at the edge for 10 min; serve stale while revalidating
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");

    if (!key) {
      return res.status(200).json({ suppliers: SUPPLIERS.map((s) => ({ key: s.key, label: s.label, tag: s.tag })) });
    }
    const sup = SUPPLIERS.find((s) => s.key === key || s.tag.toLowerCase() === String(key).toLowerCase());
    if (!sup) return res.status(404).json({ error: "Unknown supplier: " + key, suppliers: SUPPLIERS.map((s) => s.key) });

    const products = await fetchSupplier(sup);
    return res.status(200).json({ key: sup.key, label: sup.label, tag: sup.tag, products });
  } catch (err) {
    return res.status(500).json({ error: String((err && err.message) || err) });
  }
}
