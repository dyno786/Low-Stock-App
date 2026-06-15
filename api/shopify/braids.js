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
        id title status tags
        featuredImage { url(transform: {maxWidth: 300, maxHeight: 300}) }
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

// ---- product CATEGORY: one of these keys (drives the chip tabs on orders.html) ----
//   prestretched | braid | afro | curly
// Detection order, first hit wins:
//   1) explicit override tag  ->  cat:prestretched | cat:braid | cat:afro | cat:curly
//        (also accepts cat:pre-stretch / cat:bulk / cat:twist / cat:crochet)
//   2) the store's existing descriptive tags (e.g. "Pre Stretched", "Afro Kinky", "crochet hair")
//   3) keywords in the product title
//   4) fallback -> braid
const CATEGORIES = [
  { key: "prestretched", label: "Pre-stretched" },
  { key: "braid", label: "Braid / bulk" },
  { key: "afro", label: "Afro & twist" },
  { key: "curly", label: "Crochet / curly" },
];

// note: deliberately does NOT match a bare "twist" (too ambiguous — water-wave/passion
// products are also "twists"); afro is matched by afro/kinky/spring/bomb/marley/locs.
function catFromText(s) {
  const t = String(s || "").toLowerCase();
  if (/\bafro\b|kinky|marley|havana|\bspring(y|ie)?\b|\bbomb\b|faux\s*locs?|\blocs?\b/.test(t)) return "afro";
  if (/crochet|water[\s-]*wave|water[\s-]*curl|deep[\s-]*curl|ocean[\s-]*wave|\bbounce\b|coily|aquatex|\bwavy\b|bohemian|\bpassion\b|goddess|\bcurl/.test(t)) return "curly";
  if (/pre[\s-]*stretch/.test(t)) return "prestretched";
  return null;
}

function overrideFromTags(tags) {
  for (const raw of tags || []) {
    const m = String(raw).toLowerCase().trim().match(/^cat:(.+)$/);
    if (!m) continue;
    const v = m[1].trim();
    if (/^(pre[\s-]*stretch(ed)?)$/.test(v)) return "prestretched";
    if (/^(braid|bulk)$/.test(v)) return "braid";
    if (/^(afro|twist)$/.test(v)) return "afro";
    if (/^(curly|crochet|curl)$/.test(v)) return "curly";
  }
  return null;
}

function detectCategory(p) {
  const tags = p.tags || [];
  const override = overrideFromTags(tags);
  if (override) return override;
  // style (afro/curly) wins over the pre-stretched *attribute*, so look at title+tags
  // together in one pass — catFromText checks afro, then curly, then pre-stretched.
  return catFromText(tags.join(" ") + " " + (p.title || "")) || "braid";
}

async function fetchByQuery(q) {
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
        category: detectCategory(p),
        image: (p.featuredImage && p.featuredImage.url) || null,
        colourOption: colourName,
        lengthOption: lengthName,
        variants,
      });
    }
    after = conn.pageInfo && conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after && ++guard < 10);
  return products;
}

const cleanTag = (t) => String(t).replace(/'/g, "").trim();
async function fetchSupplier(sup) {
  return fetchByQuery(`tag:'${cleanTag(sup.tag)}' AND tag:braids AND status:active`);
}

export default async function handler(req, res) {
  try {
    const key = (req.query && (req.query.supplier || req.query.brand)) || "";
    // cache at the edge for 10 min; serve stale while revalidating
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");

    // page-added supplier: ?tag=BrandName  (or comma-separated, e.g. ?tag=BrandName,braids)
    // checked first, since a tag request has no supplier/brand key
    const tagParam = req.query && req.query.tag;
    if (tagParam) {
      const tags = String(tagParam).split(",").map(cleanTag).filter(Boolean).slice(0, 5);
      if (!tags.length) return res.status(400).json({ error: "No tag provided" });
      const q = tags.map((t) => `tag:'${t}'`).join(" AND ") + " AND status:active";
      const products = await fetchByQuery(q);
      const label = (req.query.label && String(req.query.label)) || tags[0];
      return res.status(200).json({ key: "tag:" + tags.join("+"), label, tag: tags.join(","), products });
    }

    if (!key) {
      return res.status(200).json({
        suppliers: SUPPLIERS.map((s) => ({ key: s.key, label: s.label, tag: s.tag })),
        categories: CATEGORIES,
      });
    }

    const sup = SUPPLIERS.find((s) => s.key === key || s.tag.toLowerCase() === String(key).toLowerCase());
    if (!sup) return res.status(404).json({ error: "Unknown supplier: " + key, suppliers: SUPPLIERS.map((s) => s.key) });


    const products = await fetchSupplier(sup);
    return res.status(200).json({ key: sup.key, label: sup.label, tag: sup.tag, products });
  } catch (err) {
    return res.status(500).json({ error: String((err && err.message) || err) });
  }
}
