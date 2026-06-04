// api/shopify-create.js
// Creates a fully-formed, PROOF-READY draft product on Shopify from EPOS data.
//
// What "proof-ready" means here (vs the old version):
//   • Title cleaned to Title Case (no more ALL CAPS from EPOS)
//   • SEO title  -> "<Product> | CC Hair & Beauty Leeds"  (search listing)
//   • SEO meta description (AI, factual)
//   • Body description (AI, with template fallback)
//   • Vendor = brand (from the brand field on shopify.html)
//   • Tags = [department, brand]  (type/sub-type tags come later with the taxonomy work)
//   • Single SIMPLE variant — no stray "Size" option
//   • Custom metafields: brand, size, department
//   • Status = DRAFT  (you proof it in admin, then publish)
//
// Required env vars:
//   SHOPIFY_STORE   = "cchairandbeauty.myshopify.com"
//   SHOPIFY_TOKEN   = Admin API token (write_products scope)
//   OPENAI_API_KEY  = OpenAI key (optional — falls back to templates)
//
// Request body (POST JSON): { barcode, name, dept, price, cost, size, brand }
// Response: 200 { ok, productId, adminUrl, title, seoTitle, description }
//           409 { error, existingProductId, existingTitle, existingStatus, adminUrl }
//           4xx/5xx { error }

export const config = { runtime: 'edge' };

const API_VERSION = '2024-04';
const STORE_SUFFIX = ' | CC Hair & Beauty Leeds';

// OPTIONAL: map an EPOS department to a Shopify product taxonomy category GID.
// Left empty by default so a wrong/unknown ID can never fail the create.
// Fill in once you've picked the taxonomy nodes, e.g.:
//   'AFRO BEAUTY PRODUCTS': 'gid://shopify/TaxonomyCategory/hb-2-1'
const CATEGORY_BY_DEPT = {};

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });
  }

  const store = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_TOKEN;
  if (!store || !token) {
    return new Response(JSON.stringify({ error: 'Missing SHOPIFY_STORE or SHOPIFY_TOKEN env vars' }), { status: 500, headers: cors });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: cors }); }

  const barcode = (body.barcode || '').trim();
  const rawName = (body.name || '').trim();
  if (!barcode || !rawName) {
    return new Response(JSON.stringify({ error: 'barcode and name required' }), { status: 400, headers: cors });
  }
  const dept = (body.dept || '').trim();
  const size = (body.size || '').trim();
  const brand = (body.brand || '').trim();
  const price = parseFloat(body.price) || 0;
  const cost = parseFloat(body.cost) || 0;

  const gqlUrl = `https://${store}/admin/api/${API_VERSION}/graphql.json`;
  const restUrl = (path) => `https://${store}/admin/api/${API_VERSION}/${path}`;
  const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };
  const storeShort = store.replace('.myshopify.com', '');

  try {
    // ── 1. Duplicate check via GraphQL (consistent with the bulk-op list) ───
    const lookupQuery = `
{
  productVariants(first: 5, query: "barcode:${barcode.replace(/"/g, '\\"')}") {
    edges { node { id barcode product { id title status } } }
  }
}`.trim();
    const lookup = await fetch(gqlUrl, { method: 'POST', headers, body: JSON.stringify({ query: lookupQuery }) });
    if (lookup.ok) {
      const vd = await lookup.json();
      const edges = vd?.data?.productVariants?.edges || [];
      const matches = edges.filter(e => (e.node.barcode || '').trim() === barcode);
      if (matches.length > 0) {
        const ex = matches[0].node;
        const pid = (ex.product?.id || '').split('/').pop();
        const status = ex.product?.status || 'unknown';
        return new Response(JSON.stringify({
          error: `Barcode already exists on Shopify (status: ${status})`,
          existingProductId: pid,
          existingTitle: ex.product?.title || '',
          existingStatus: status,
          adminUrl: `https://admin.shopify.com/store/${storeShort}/products/${pid}`,
        }), { status: 409, headers: cors });
      }
    }

    // ── 2. AI copy (title case + SEO + description), with template fallback ─
    const ai = await generateCopy({ name: rawName, size, dept, brand });
    const title = ai.titleCase;
    const description = ai.description;

    let seoBase = (ai.seoTitle || title).trim();
    const maxBase = 70 - STORE_SUFFIX.length;
    if (seoBase.length > maxBase) seoBase = seoBase.slice(0, maxBase).trim();
    const seoTitle = seoBase + STORE_SUFFIX;
    const seoDescription = (ai.seoDescription || `${title} — available at CC Hair & Beauty, Leeds.`).slice(0, 320);

    // ── 3. Create the product (REST) — single simple variant, draft ─────────
    const tags = [dept, brand].filter(Boolean);
    const productPayload = {
      product: {
        title,
        body_html: `<p>${description.replace(/</g, '&lt;')}</p>`,
        vendor: brand || 'CC Hair & Beauty',
        product_type: dept || '',
        status: 'draft',
        tags: tags.join(', '),
        variants: [{
          barcode,
          price: price > 0 ? price.toFixed(2) : '0.00',
          sku: barcode,
          inventory_management: 'shopify',
          requires_shipping: true,
          taxable: true,
        }],
      },
    };

    const createRes = await fetch(restUrl('products.json'), {
      method: 'POST', headers, body: JSON.stringify(productPayload),
    });
    if (!createRes.ok) {
      const errTxt = await createRes.text();
      return new Response(JSON.stringify({ error: `Shopify create failed (${createRes.status}): ${errTxt.slice(0, 300)}` }), { status: 502, headers: cors });
    }
    const created = await createRes.json();
    const productId = created.product?.id;
    if (!productId) {
      return new Response(JSON.stringify({ error: 'Shopify returned no product ID', raw: created }), { status: 502, headers: cors });
    }

    // ── 4. Inventory cost (REST) ────────────────────────────────────────────
    const invItemId = created.product?.variants?.[0]?.inventory_item_id;
    if (cost > 0 && invItemId) {
      try {
        await fetch(restUrl(`inventory_items/${invItemId}.json`), {
          method: 'PUT', headers,
          body: JSON.stringify({ inventory_item: { id: invItemId, cost: cost.toFixed(2) } }),
        });
      } catch (_) { /* non-fatal */ }
    }

    // ── 5. SEO + metafields (GraphQL productUpdate) ─────────────────────────
    // Done as a second call because the new SEO field and metafields are
    // cleanest via GraphQL; the REST create above is the proven foundation.
    const gid = `gid://shopify/Product/${productId}`;
    const metafields = [
      brand && { namespace: 'custom', key: 'brand', type: 'single_line_text_field', value: brand },
      size && { namespace: 'custom', key: 'size', type: 'single_line_text_field', value: size },
      dept && { namespace: 'custom', key: 'department', type: 'single_line_text_field', value: dept },
    ].filter(Boolean);

    const input = { id: gid, seo: { title: seoTitle, description: seoDescription }, metafields };
    const catGid = CATEGORY_BY_DEPT[(dept || '').toUpperCase()] || CATEGORY_BY_DEPT[dept];
    if (catGid) input.category = catGid;

    const updateMutation = `
mutation ($input: ProductInput!) {
  productUpdate(input: $input) {
    product { id }
    userErrors { field message }
  }
}`.trim();
    try {
      const upd = await fetch(gqlUrl, { method: 'POST', headers, body: JSON.stringify({ query: updateMutation, variables: { input } }) });
      // Non-fatal: the product already exists as a draft even if SEO/metafields fail.
      if (upd.ok) {
        const ud = await upd.json();
        const errs = ud?.data?.productUpdate?.userErrors || [];
        if (errs.length) console.error('productUpdate userErrors', errs);
      }
    } catch (e) {
      console.error('SEO/metafield update failed', e);
    }

    return new Response(JSON.stringify({
      ok: true,
      productId,
      adminUrl: `https://admin.shopify.com/store/${storeShort}/products/${productId}`,
      title,
      seoTitle,
      description,
    }), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}

// ── AI copy generation ─────────────────────────────────────────────────────
async function generateCopy({ name, size, dept, brand }) {
  const fallback = () => ({
    titleCase: titleCaseName(name) + (size ? ` ${size}` : ''),
    seoTitle: titleCaseName(name),
    seoDescription: `${titleCaseName(name)}${size ? ' (' + size + ')' : ''} — available at CC Hair & Beauty, Leeds.`,
    description: `${titleCaseName(name)}${size ? ' (' + size + ')' : ''}.${brand ? ' By ' + brand + '.' : ''}${dept ? ' Part of our ' + dept.toLowerCase() + ' range.' : ''} Available in our Leeds stores.`,
  });

  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallback();

  const prompt = `You are a product data assistant for CC Hair & Beauty, a UK Afro/Caribbean hair & beauty retailer in Leeds.
Return ONLY a JSON object (no markdown, no backticks) with keys: titleCase, seoTitle, seoDescription, description.
- titleCase: the product name in proper Title Case, cleaned of ALL CAPS, including the size if provided.
- seoTitle: <= 55 characters, includes the brand and key descriptor. Do NOT include the shop name (added separately).
- seoDescription: 140-160 characters, factual, no exaggerated or medical claims.
- description: 2-3 short sentences (~50 words), factual, for the product page.
Product name: "${name}"${size ? `\nSize: ${size}` : ''}${brand ? `\nBrand: ${brand}` : ''}${dept ? `\nDepartment: ${dept}` : ''}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 320,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return fallback();
    const data = await res.json();
    let raw = (data.choices?.[0]?.message?.content || '').trim().replace(/^```json\s*|\s*```$/g, '');
    const parsed = JSON.parse(raw);
    const fb = fallback();
    return {
      titleCase: (parsed.titleCase || '').trim() || fb.titleCase,
      seoTitle: (parsed.seoTitle || '').trim() || fb.seoTitle,
      seoDescription: (parsed.seoDescription || '').trim() || fb.seoDescription,
      description: (parsed.description || '').trim() || fb.description,
    };
  } catch (_) {
    return fallback();
  }
}

function titleCaseName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b([a-z])/g, (m, c) => c.toUpperCase())
    .replace(/\b(\d+)(ml|g|kg|oz|l)\b/gi, (m, n, u) => n + u.toLowerCase())
    .trim();
}
