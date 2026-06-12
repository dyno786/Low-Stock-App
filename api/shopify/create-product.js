// api/shopify/create-product.js
// Vercel serverless function (Node 18+, ESM). Zero npm dependencies — uses global fetch.
//
// Creates a DRAFT Shopify product from a PICCO item, matching CC Hair & Beauty's store
// conventions:
//   - vendor = brand, productType = category
//   - Title Case, brand-led title (guards against double-branding)
//   - SEO meta title + description (so it isn't relying on Shopify's bare defaults)
//   - tags = descriptors + EXACT collection-name tags. Your collections are smart
//     collections keyed on "TAG EQUALS <collection title>", so a tag must match the
//     collection name exactly (spelling + capitalisation) to place the product in that
//     menu section. The caller passes those exact names in `collections`.
//   - barcode + sku + price on the default variant
//   - optional image attached by URL, with alt text (fail-soft)
// Dedupes by barcode first, so it never duplicates an existing variant.
//
// Env vars (set in Vercel project settings — never in the frontend):
//   SHOPIFY_STORE_URL        e.g. cchairandbeauty.myshopify.com   (the *.myshopify.com admin domain)
//   SHOPIFY_ADMIN_API_TOKEN  Admin API access token (scopes: read_products, write_products)
//   SHOPIFY_API_VERSION      optional, defaults to 2025-01

import { attrMetafields } from "./_taxonomy.js";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";
const STORE = (process.env.SHOPIFY_STORE_URL || process.env.SHOPIFY_STORE || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN || process.env.SHOPIFY_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;

async function shopifyGraphQL(query, variables) {
  const store = STORE;
  const token = TOKEN;
  if (!store || !token) throw new Error("Missing SHOPIFY_STORE_URL or SHOPIFY_ADMIN_API_TOKEN");
  const res = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error("GraphQL: " + JSON.stringify(json.errors));
  return json.data;
}

// "now & always eau de parfum 30ml" -> "Now & Always Eau De Parfum 30ml"
function titleCase(s) {
  if (!s) return "";
  const small = new Set(["and", "or", "the", "a", "an", "of", "for", "with", "in", "on", "to"]);
  return String(s).trim().toLowerCase().split(/\s+/).map((w, i) => {
    if (/^\d+(ml|g|kg|l|oz|cm|mm)$/.test(w)) return w;          // keep 30ml, 100g as-is
    if (i > 0 && small.has(w)) return w;                          // lowercase small joining words
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
}

function buildTitle(brand, name) {
  const b = titleCase(brand || "");
  const n = titleCase(name || "");
  if (b && n.toLowerCase().startsWith(b.toLowerCase())) return n;  // name already brand-led
  return [b, n].filter(Boolean).join(" ").trim();
}

const uniq = (arr) => [...new Set((arr || []).map((t) => String(t).trim()).filter(Boolean))];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { barcode, name, brand = "", price, category = "", imageUrl } = body;
    const tagsIn = Array.isArray(body.tags) ? body.tags : [];
    const collections = Array.isArray(body.collections) ? body.collections : []; // exact collection-name tags
    const status = (body.status || "DRAFT").toUpperCase();

    if (!barcode || !name || price == null || price === "") {
      return res.status(400).json({ error: "barcode, name and price are required" });
    }

    // 1) Dedupe by barcode — never create a duplicate of an existing variant.
    const existing = await shopifyGraphQL(
      `query ($q: String!) { products(first: 1, query: $q) { edges { node { id title handle } } } }`,
      { q: `barcode:${String(barcode).replace(/["\\]/g, "")}` }
    );
    const hit = existing?.products?.edges?.[0]?.node;
    if (hit) {
      const idNum = hit.id.split("/").pop();
      return res.status(200).json({
        exists: true, productId: hit.id, title: hit.title,
        productUrl: `https://${STORE}/admin/products/${idNum}`,
      });
    }

    // 2) Build the listing the way the store expects.
    const title = buildTitle(brand, name);
    const tags = uniq([...tagsIn, ...collections, category, brand]); // collection names must match exactly
    const metafields = attrMetafields(body.attributes); // Shopify standard attribute metafields (GIDs)
    const SHOP_SUFFIX = " | CC Hair and Beauty Leeds";
    const baseSeoTitle = (body.seoTitle || title).replace(/\s*\|\s*CC Hair.*$/i, "").trim();
    const seoTitle = (baseSeoTitle.slice(0, Math.max(0, 70 - SHOP_SUFFIX.length)).trim() + SHOP_SUFFIX).slice(0, 70);
    let seoDescription = (
      body.seoDescription ||
      `${title}${category ? " — " + category : ""}.`
    ).trim();
    if (!/cc hair and beauty/i.test(seoDescription)) {
      seoDescription = (seoDescription.replace(/\s+$/, "") + " | CC Hair and Beauty, Leeds.");
    }
    seoDescription = seoDescription.slice(0, 320);
    const descriptionHtml = body.descriptionHtml || `<p>${title}${category ? " — " + category : ""}.</p>`;

    const createInput = {
      title, descriptionHtml, status, tags,
      seo: { title: seoTitle, description: seoDescription },
    };
    if (brand) createInput.vendor = brand;
    if (category) createInput.productType = category;
    // NOTE: shopify.* attribute metafields are category-gated; setting them here would fail the whole
    // create ("Owner subtype does not match..."). They are applied after create + category is set.

    const created = await shopifyGraphQL(
      `mutation ($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product { id title handle variants(first: 1) { edges { node { id } } } }
          userErrors { field message }
        }
      }`,
      { product: createInput }
    );
    const pc = created.productCreate;
    if (pc.userErrors?.length) return res.status(422).json({ error: "create", details: pc.userErrors });
    const product = pc.product;
    const variantId = product.variants?.edges?.[0]?.node?.id;

    // 3) Put barcode + sku + price on the default variant.
    if (variantId) {
      const vu = await shopifyGraphQL(
        `mutation ($pid: ID!, $vars: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $pid, variants: $vars) {
            userErrors { field message }
          }
        }`,
        { pid: product.id, vars: [{
            id: variantId, price: String(price), barcode: String(barcode),
            inventoryItem: { sku: String(barcode) },
        }] }
      );
      const ve = vu.productVariantsBulkUpdate.userErrors;
      if (ve?.length) return res.status(422).json({ error: "variant", details: ve, productId: product.id });
    }

    // 4) Optional image by URL, with alt text. Fail-soft — never block the listing.
    let imageWarning = null;
    if (imageUrl) {
      try {
        const media = await shopifyGraphQL(
          `mutation ($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
            productUpdate(product: $product, media: $media) {
              product { id }
              userErrors { field message }
            }
          }`,
          { product: { id: product.id },
            media: [{ originalSource: imageUrl, mediaContentType: "IMAGE", alt: title }] }
        );
        const me = media.productUpdate.userErrors;
        if (me?.length) imageWarning = me;
      } catch (e) { imageWarning = String(e.message || e); }
    }

    const idNum = product.id.split("/").pop();
    return res.status(200).json({
      created: true, productId: product.id, variantId, title: product.title,
      attrCount: metafields.length, tagCount: tags.length,
      productUrl: `https://${STORE}/admin/products/${idNum}`,
      imageWarning,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}
