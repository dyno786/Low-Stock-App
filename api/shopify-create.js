// api/shopify-create.js
// Creates a fully PROOF-READY draft product on Shopify from EPOS data.
//
// Fills, automatically:
//   • Title       -> Title Case, cleaned
//   • SEO title   -> "<Product> | CC Hair & Beauty Leeds"  + meta description
//   • Category    -> auto-set from detected type (Shopify taxonomy), no more "Uncategorized"
//   • Tags        -> [brand, umbrella ("Hair Care"), type tag(s) e.g. "Hair Styling Gels"]
//                    so the smart collections pick it up
//   • Vendor      -> brand
//   • Weight      -> size converted to GRAMS + 10g packaging
//   • Variant     -> single simple variant (barcode / price / sku / cost), no "Size" option
//   • Metafields  -> custom.department, size, volume, formulation, type, hair_type,
//                    suitable_for, ingredients (Key Ingredients), scent, features
//   • Image       -> if an image URL is supplied, attached with SEO-friendly alt text
//   • Status      -> DRAFT
//
// Request body: { barcode, name, dept, price, cost, size, brand, image? }

export const config = { runtime: 'edge' };

const REST_VERSION = '2024-04';  // REST create (variant weight works here)
const GQL_VERSION  = '2024-10';  // GraphQL: taxonomy category, seo, metafields, media
const STORE_SUFFIX = ' | CC Hair & Beauty Leeds';
const CAT = (id) => `gid://shopify/TaxonomyCategory/${id}`;

// type detection -> { collection tags, taxonomy category, formulation, readable type }
// First match wins; order matters (specific before generic).
const TYPE_RULES = [
  { re: /\bedge\b|edge control|edge tamer|edge booster/, tags: ['Edge Control'], cat: 'hb-3-10-10-2', form: 'Gel', type: 'Edge Control' },
  { re: /relaxer|texturi[sz]er|no[- ]?lye|kiddie perm/, tags: ['Relaxers'], cat: 'hb-3-10-7-2', form: 'Cream', type: 'Relaxer' },
  { re: /leave[- ]?in/, tags: ['Leavein Conditioner Hair Care'], cat: 'hb-3-10', form: 'Conditioner', type: 'Leave-In Conditioner' },
  { re: /co[- ]?wash|cleansing conditioner/, tags: ['Conditioners', 'Shampoo'], cat: 'hb-3-10', form: 'Conditioner', type: 'Co-Wash' },
  { re: /conditioner/, tags: ['Conditioners'], cat: 'hb-3-10', form: 'Conditioner', type: 'Conditioner' },
  { re: /shampoo/, tags: ['Shampoo'], cat: 'hb-3-10', form: 'Shampoo', type: 'Shampoo' },
  { re: /masque|hair mask|deep mask/, tags: ['Hair Mask', 'Hair Treatments'], cat: 'hb-3-10-14-1', form: 'Mask', type: 'Hair Mask' },
  { re: /serum/, tags: ['Serums'], cat: 'hb-3-10-14-3', form: 'Serum', type: 'Hair Serum' },
  { re: /pomade|\bwax\b/, tags: ['Styling Wax'], cat: 'hb-3-10-10-4', form: 'Wax', type: 'Styling Wax' },
  { re: /mousse|foam/, tags: [], cat: 'hb-3-10-10-3', form: 'Mousse', type: 'Mousse' },
  { re: /\bgel\b|gelee|gelée|styling gel/, tags: ['Hair Styling Gels'], cat: 'hb-3-10-10-2', form: 'Gel', type: 'Hair Gel' },
  { re: /moisturi[sz]er|hair lotion|hair milk|hair food|hair grease|hairdress/, tags: ['Moisturisers'], cat: 'hb-3-10', form: 'Moisturiser', type: 'Moisturiser' },
  { re: /\boil\b|carrot oil|castor oil|\bjbco\b/, tags: ['Hair Treatments'], cat: 'hb-3-10-14-2', form: 'Oil', type: 'Hair Oil' },
  { re: /treatment|protein|reconstructor|deep condition/, tags: ['Hair Treatments'], cat: 'hb-3-10-14', form: 'Treatment', type: 'Treatment' },
  { re: /peroxide|developer|bleach/, tags: ['Hair Dyes', 'Peroxide'], cat: 'hb-3-10-2', form: 'Developer', type: 'Peroxide' },
  { re: /semi[- ]?permanent/, tags: ['Hair Dyes', 'Semi Permanent Hair Dye'], cat: 'hb-3-10-2', form: 'Hair Dye', type: 'Semi-Permanent Dye' },
  { re: /colou?r spray/, tags: ['Hair Dyes', 'Color Spray'], cat: 'hb-3-10-2', form: 'Spray', type: 'Colour Spray' },
  { re: /colou?r wax/, tags: ['Hair Dyes', 'Color Wax'], cat: 'hb-3-10-2', form: 'Wax', type: 'Colour Wax' },
  { re: /dye remover|colou?r remover/, tags: ['Hair Dyes', 'Hair Dye Remover'], cat: 'hb-3-10-3', form: 'Remover', type: 'Hair Dye Remover' },
  { re: /\btoner\b/, tags: ['Hair Dyes', 'Hair Dye Toners'], cat: 'hb-3-10-2', form: 'Toner', type: 'Hair Toner' },
  { re: /hair colou?r|hair dye|permanent colou?r|\btint\b/, tags: ['Hair Dyes', 'Permanent Hair Dyes'], cat: 'hb-3-10-2', form: 'Hair Dye', type: 'Hair Dye' },
  { re: /oil sheen|sheen spray|holding spray|wrap spray|finishing spray|setting spray|spritz|\bspray\b/, tags: ['Serums'], cat: 'hb-3-10-10-6', form: 'Spray', type: 'Hair Spray' },
];

function classify(name) {
  const n = (name || '').toLowerCase();
  for (const r of TYPE_RULES) {
    if (r.re.test(n)) return { tags: r.tags.slice(), cat: CAT(r.cat), form: r.form, type: r.type, umbrella: 'Hair Care' };
  }
  return { tags: [], cat: CAT('hb-3-10'), form: '', type: '', umbrella: 'Hair Care' }; // fallback: Hair Care
}

// Convert a size string ("10oz", "390g", "250ml", "1L", "16 fl oz") to grams, +10g packaging.
function parseWeightGrams(size, name) {
  const src = `${size || ''} ${name || ''}`.toLowerCase();
  const m = src.match(/([\d.]+)\s*(fl\s*\.?\s*oz|oz|lbs?|kg|grams?|g|ml|litre|liter|l)\b/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!n) return null;
  const u = m[2].replace(/[\s.]/g, '');
  let g;
  if (u.indexOf('floz') >= 0) g = n * 29.5735;
  else if (u === 'oz') g = n * 28.3495;
  else if (u.indexOf('lb') >= 0) g = n * 453.592;
  else if (u === 'kg') g = n * 1000;
  else if (u === 'g' || u.indexOf('gram') >= 0) g = n;
  else if (u === 'ml') g = n;
  else if (u === 'l' || u.indexOf('litre') >= 0 || u.indexOf('liter') >= 0) g = n * 1000;
  else return null;
  return Math.round(g) + 10;
}

function titleCaseName(s) {
  return String(s || '').toLowerCase()
    .replace(/\b([a-z])/g, (m, c) => c.toUpperCase())
    .replace(/\b(\d+)\s?(ml|g|kg|oz|l)\b/gi, (m, n2, u) => n2 + u.toLowerCase())
    .trim();
}

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });

  const store = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_TOKEN;
  if (!store || !token) return new Response(JSON.stringify({ error: 'Missing SHOPIFY_STORE or SHOPIFY_TOKEN' }), { status: 500, headers: cors });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: cors }); }

  const barcode = (body.barcode || '').trim();
  const rawName = (body.name || '').trim();
  if (!barcode || !rawName) return new Response(JSON.stringify({ error: 'barcode and name required' }), { status: 400, headers: cors });
  const dept = (body.dept || '').trim();
  const size = (body.size || '').trim();
  const brand = (body.brand || '').trim();
  const image = (body.image || '').trim();
  const price = parseFloat(body.price) || 0;
  const cost = parseFloat(body.cost) || 0;

  const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };
  const restUrl = (p) => `https://${store}/admin/api/${REST_VERSION}/${p}`;
  const gqlUrl = `https://${store}/admin/api/${GQL_VERSION}/graphql.json`;
  const storeShort = store.replace('.myshopify.com', '');
  const gql = (query, variables) => fetch(gqlUrl, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });

  try {
    // ── 1. Duplicate check ──────────────────────────────────────────────────
    const lookup = await gql(
      `query ($q: String!) { productVariants(first: 5, query: $q) { edges { node { barcode product { id title status } } } } }`,
      { q: `barcode:${barcode}` }
    );
    if (lookup.ok) {
      const vd = await lookup.json();
      const matches = (vd?.data?.productVariants?.edges || []).filter(e => (e.node.barcode || '').trim() === barcode);
      if (matches.length) {
        const ex = matches[0].node;
        const pid = (ex.product?.id || '').split('/').pop();
        const status = ex.product?.status || 'unknown';
        return new Response(JSON.stringify({
          error: `Barcode already exists on Shopify (status: ${status})`,
          existingProductId: pid, existingTitle: ex.product?.title || '', existingStatus: status,
          adminUrl: `https://admin.shopify.com/store/${storeShort}/products/${pid}`,
        }), { status: 409, headers: cors });
      }
    }

    // ── 2. Classify + weight + AI copy ──────────────────────────────────────
    const c = classify(rawName);
    const grams = parseWeightGrams(size, rawName);
    const ai = await generateCopy({ name: rawName, size, dept, brand, form: c.form });
    const title = ai.titleCase;

    let seoBase = (ai.seoTitle || title).trim();
    const maxBase = 70 - STORE_SUFFIX.length;
    if (seoBase.length > maxBase) seoBase = seoBase.slice(0, maxBase).trim();
    const seoTitle = seoBase + STORE_SUFFIX;
    const seoDescription = (ai.seoDescription || `${title} — available at CC Hair & Beauty, Leeds.`).slice(0, 320);

    // ── 3. Create product (REST) — single simple variant, weight in grams ───
    const tags = [brand, c.umbrella].concat(c.tags).filter(Boolean);
    const uniqTags = tags.filter((t, i) => tags.indexOf(t) === i);
    const variant = {
      barcode,
      price: price > 0 ? price.toFixed(2) : '0.00',
      sku: barcode,
      inventory_management: 'shopify',
      requires_shipping: true,
      taxable: true,
    };
    if (grams != null) { variant.weight = grams; variant.weight_unit = 'g'; }

    const createRes = await fetch(restUrl('products.json'), {
      method: 'POST', headers,
      body: JSON.stringify({
        product: {
          title,
          body_html: `<p>${ai.description.replace(/</g, '&lt;')}</p>`,
          vendor: brand || 'CC Hair & Beauty',
          product_type: c.type || dept || '',
          status: 'draft',
          tags: uniqTags.join(', '),
          variants: [variant],
        },
      }),
    });
    if (!createRes.ok) {
      const t = await createRes.text();
      return new Response(JSON.stringify({ error: `Shopify create failed (${createRes.status}): ${t.slice(0, 300)}` }), { status: 502, headers: cors });
    }
    const created = await createRes.json();
    const productId = created.product?.id;
    if (!productId) return new Response(JSON.stringify({ error: 'No product ID returned', raw: created }), { status: 502, headers: cors });
    const gid = `gid://shopify/Product/${productId}`;
    const invItemId = created.product?.variants?.[0]?.inventory_item_id;

    // ── 4. Inventory cost (REST) ────────────────────────────────────────────
    if (cost > 0 && invItemId) {
      try {
        await fetch(restUrl(`inventory_items/${invItemId}.json`), {
          method: 'PUT', headers,
          body: JSON.stringify({ inventory_item: { id: invItemId, cost: cost.toFixed(2) } }),
        });
      } catch (_) {}
    }

    // ── 5. Category + SEO + metafields (GraphQL productUpdate) ──────────────
    const mf = (key, value, type) => (value ? { namespace: 'custom', key, type: type || 'single_line_text_field', value: String(value) } : null);
    const metafields = [
      mf('department', dept),
      mf('size', size),
      mf('volume', size),
      mf('formulation', c.form),
      mf('type', c.type),
      mf('hair_type', ai.hairType),
      mf('suitable_for', ai.suitableFor),
      mf('ingredients', ai.keyIngredients),   // "Key Ingredients"
      mf('scent', ai.scent),
      mf('features', ai.features),
    ].filter(Boolean);

    const input = { id: gid, seo: { title: seoTitle, description: seoDescription }, category: c.cat, metafields };
    try {
      const upd = await gql(
        `mutation ($input: ProductInput!) { productUpdate(input: $input) { product { id } userErrors { field message } } }`,
        { input }
      );
      if (upd.ok) {
        const ud = await upd.json();
        const errs = ud?.data?.productUpdate?.userErrors || [];
        if (errs.length) console.error('productUpdate userErrors', errs);
      }
    } catch (e) { console.error('productUpdate failed', e); }

    // ── 6. Image with SEO-friendly alt text (GraphQL), if supplied ──────────
    if (image && /^https?:\/\//.test(image)) {
      try {
        await gql(
          `mutation ($productId: ID!, $media: [CreateMediaInput!]!) { productCreateMedia(productId: $productId, media: $media) { mediaUserErrors { field message } } }`,
          { productId: gid, media: [{ originalSource: image, mediaContentType: 'IMAGE', alt: title }] }
        );
      } catch (e) { console.error('image attach failed', e); }
    }

    return new Response(JSON.stringify({
      ok: true, productId,
      adminUrl: `https://admin.shopify.com/store/${storeShort}/products/${productId}`,
      title, seoTitle, tags: uniqTags, category: c.cat, weightGrams: grams,
    }), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}

// ── AI: copy + descriptive metafields ───────────────────────────────────────
async function generateCopy({ name, size, dept, brand, form }) {
  const tc = titleCaseName(name) + (size && !new RegExp(size, 'i').test(name) ? ` ${size}` : '');
  const fallback = () => ({
    titleCase: tc,
    seoTitle: titleCaseName(name),
    seoDescription: `${tc} — available at CC Hair & Beauty, Leeds.`,
    description: `${tc}.${brand ? ' By ' + brand + '.' : ''}${form ? ' ' + form + '.' : ''} Available in our Leeds stores.`,
    keyIngredients: '', suitableFor: '', hairType: '', scent: '', features: '',
  });

  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallback();

  const prompt = `You are a product data assistant for CC Hair & Beauty, a UK Afro/Caribbean hair & beauty retailer in Leeds.
Return ONLY a JSON object (no markdown) with keys: titleCase, seoTitle, seoDescription, description, keyIngredients, suitableFor, hairType, scent, features.
- titleCase: product name in proper Title Case, cleaned of ALL CAPS, include the size if given.
- seoTitle: <= 55 chars, brand + key descriptor. Do NOT add the shop name.
- seoDescription: 140-160 chars, factual, no medical/exaggerated claims.
- description: 2-3 short sentences (~50 words), factual.
- keyIngredients: a short comma list IF you are confident from the product, else "".
- suitableFor: e.g. "All hair types" / "Dry, damaged hair" if reasonable, else "".
- hairType: e.g. "All hair types", "Coily/Afro", "Curly" if reasonable, else "".
- scent: only if obvious from the name, else "".
- features: short comma list of benefits (e.g. "Maximum hold, no flaking"), else "".
Do not invent specifics you are unsure of — use "" instead.
Product: "${name}"${size ? `\nSize: ${size}` : ''}${brand ? `\nBrand: ${brand}` : ''}${form ? `\nForm: ${form}` : ''}${dept ? `\nDepartment: ${dept}` : ''}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 400, response_format: { type: 'json_object' } }),
    });
    if (!res.ok) return fallback();
    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim().replace(/^```json\s*|\s*```$/g, '');
    const p = JSON.parse(raw);
    const fb = fallback();
    return {
      titleCase: (p.titleCase || '').trim() || fb.titleCase,
      seoTitle: (p.seoTitle || '').trim() || fb.seoTitle,
      seoDescription: (p.seoDescription || '').trim() || fb.seoDescription,
      description: (p.description || '').trim() || fb.description,
      keyIngredients: (p.keyIngredients || '').trim(),
      suitableFor: (p.suitableFor || '').trim(),
      hairType: (p.hairType || '').trim(),
      scent: (p.scent || '').trim(),
      features: (p.features || '').trim(),
    };
  } catch (_) { return fallback(); }
}
