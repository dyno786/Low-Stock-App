// api/shopify-create.js
// Creates a DRAFT product on Shopify from EPOS data, with AI-generated description.
//
// Required env vars:
//   SHOPIFY_STORE   = "cchairandbeauty.myshopify.com"
//   SHOPIFY_TOKEN   = Admin API token (write_products scope)
//   OPENAI_API_KEY  = OpenAI key for description writing (optional — falls back to template)
//
// Request body (POST JSON):
//   { barcode, name, dept, price, cost, size, vendor }
//
// Response:
//   200 { ok, productId, adminUrl, description }
//   409 { error: "Already exists on Shopify" }
//   500 { error: "..." }

export const config = { runtime: 'edge' };

const API_VERSION = '2024-04';

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
    return new Response(JSON.stringify({
      error: 'Missing SHOPIFY_STORE or SHOPIFY_TOKEN env vars'
    }), { status: 500, headers: cors });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: cors }); }

  const barcode = (body.barcode || '').trim();
  const name = (body.name || '').trim();
  if (!barcode || !name) {
    return new Response(JSON.stringify({ error: 'barcode and name required' }), { status: 400, headers: cors });
  }
  const dept = (body.dept || '').trim();
  const size = (body.size || '').trim();
  const price = parseFloat(body.price) || 0;
  const cost = parseFloat(body.cost) || 0;
  const vendor = (body.vendor || '').trim();

  try {
    // ── 1. Re-check barcode doesn't already exist on Shopify ────────────────
    const variantLookup = await fetch(
      `https://${store}/admin/api/${API_VERSION}/variants.json?barcode=${encodeURIComponent(barcode)}`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    if (variantLookup.ok) {
      const vd = await variantLookup.json();
      if (vd.variants && vd.variants.length > 0) {
        const existing = vd.variants[0];
        return new Response(JSON.stringify({
          error: 'Barcode already exists on Shopify',
          existingProductId: existing.product_id,
          adminUrl: `https://${store.replace('.myshopify.com', '')}.myshopify.com/admin/products/${existing.product_id}`,
        }), { status: 409, headers: cors });
      }
    }

    // ── 2. Generate AI description (best-effort) ────────────────────────────
    let description = '';
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const prompt = `Write a concise, professional product description (2-3 short sentences, ~50 words) for an online beauty/hair shop. Be factual, no exaggerated marketing claims. Product: "${name}"${size ? ' (' + size + ')' : ''}. Category: ${dept || 'Beauty product'}.${vendor ? ' Brand: ' + vendor + '.' : ''}`;
        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + openaiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
            max_tokens: 150,
          }),
        });
        if (aiRes.ok) {
          const ad = await aiRes.json();
          description = (ad.choices?.[0]?.message?.content || '').trim();
        }
      } catch (e) {
        // Fall through to template
      }
    }
    if (!description) {
      description = `${name}${size ? ' (' + size + ')' : ''}.${dept ? ' Part of our ' + dept.toLowerCase() + ' range.' : ''} Available in our Leeds stores.`;
    }

    // ── 3. Create the draft product ─────────────────────────────────────────
    const productPayload = {
      product: {
        title: name,
        body_html: `<p>${description.replace(/</g, '&lt;')}</p>`,
        vendor: vendor || 'CC Hair & Beauty',
        product_type: dept || '',
        status: 'draft',
        tags: dept ? [dept] : [],
        variants: [{
          barcode: barcode,
          price: price > 0 ? price.toFixed(2) : '0.00',
          ...(cost > 0 ? { cost: cost.toFixed(2) } : {}),
          sku: barcode,
          inventory_management: 'shopify',
          requires_shipping: true,
          taxable: true,
          ...(size ? { option1: size } : {}),
        }],
        ...(size ? { options: [{ name: 'Size', values: [size] }] } : {}),
      },
    };

    const createRes = await fetch(`https://${store}/admin/api/${API_VERSION}/products.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(productPayload),
    });

    if (!createRes.ok) {
      const errTxt = await createRes.text();
      return new Response(JSON.stringify({
        error: `Shopify create failed (${createRes.status}): ${errTxt.slice(0, 300)}`
      }), { status: 502, headers: cors });
    }

    const created = await createRes.json();
    const productId = created.product?.id;
    if (!productId) {
      return new Response(JSON.stringify({ error: 'Shopify returned no product ID', raw: created }), { status: 502, headers: cors });
    }

    // ── 4. If cost was provided, set it on the inventory item (separate API call) ─
    if (cost > 0 && created.product.variants?.[0]?.inventory_item_id) {
      try {
        const invItemId = created.product.variants[0].inventory_item_id;
        await fetch(`https://${store}/admin/api/${API_VERSION}/inventory_items/${invItemId}.json`, {
          method: 'PUT',
          headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventory_item: { id: invItemId, cost: cost.toFixed(2) } }),
        });
      } catch (e) {
        // Non-fatal — product still created
      }
    }

    const storeShort = store.replace('.myshopify.com', '');
    return new Response(JSON.stringify({
      ok: true,
      productId,
      adminUrl: `https://admin.shopify.com/store/${storeShort}/products/${productId}`,
      description,
    }), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
