// api/shopify/upload-image.js
// Process a (client-downscaled) product photo and push it to Shopify via a staged upload.
// Flow:  remove.bg background removal  ->  sharp 1000x1000 on white  ->  stagedUploadsCreate  ->  upload bytes.
// Returns { source: <resourceUrl> } to pass into create-product as imageUrl.
//
// FAIL-SOFT: any image/remove.bg/upload failure returns { source: null, warning } with HTTP 200,
// so the caller can still create the product and staff add the photo later.
//
// ENV (Vercel, server-side only — never in the frontend):
//   SHOPIFY_STORE_URL        e.g. cchairandbeauty.myshopify.com
//   SHOPIFY_ADMIN_API_TOKEN  custom app token; scopes: write_products, read_products, read_files
//   BG_API_KEY               background-removal API key (poof.bg / removebgapi.com). REMOVEBG_API_KEY also accepted.
//   BG_API_URL               (optional) override endpoint, default https://api.poof.bg/v1/remove
//
// package.json must list "sharp" in dependencies. Node runtime (sharp can't run on the edge).

import sharp from 'sharp';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

const STAGED_MUTATION = `mutation stagedUploadsCreate($input:[StagedUploadInput!]!){
  stagedUploadsCreate(input:$input){
    stagedTargets{ url resourceUrl parameters{ name value } }
    userErrors{ field message }
  }
}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ source: null, warning: 'POST only' }); return; }

  const STORE = (process.env.SHOPIFY_STORE_URL || process.env.SHOPIFY_STORE || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN || process.env.SHOPIFY_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;
  if (!STORE || !TOKEN) { res.status(500).json({ source: null, warning: 'Missing Shopify env vars' }); return; }

  // --- read input image (base64 or data URL) ---
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const raw = body && body.image ? String(body.image) : '';
  if (!raw) { res.status(400).json({ source: null, warning: 'No image provided' }); return; }
  const b64 = raw.indexOf(',') >= 0 ? raw.slice(raw.indexOf(',') + 1) : raw;

  let inputBuf;
  try { inputBuf = Buffer.from(b64, 'base64'); }
  catch (e) { res.status(400).json({ source: null, warning: 'Bad image data' }); return; }

  try {
    // --- 1. background removal (poof.bg / removebgapi.com by default; fail-soft to original) ---
    let cutout = inputBuf;
    try {
      const BG_KEY = process.env.BG_API_KEY || process.env.REMOVEBG_API_KEY;
      const BG_URL = process.env.BG_API_URL || 'https://api.poof.bg/v1/remove';
      if (BG_KEY) {
        const fd = new FormData();
        fd.append('image_file', new Blob([inputBuf]), 'photo.jpg');
        fd.append('size', 'auto');
        const rb = await fetch(BG_URL, {
          method: 'POST',
          headers: { 'x-api-key': BG_KEY },
          body: fd
        });
        if (rb.ok) cutout = Buffer.from(await rb.arrayBuffer());
      }
    } catch (e) { /* keep original photo */ }

    // --- 2. sharp: 1000x1000 product image on a white background ---
    const processed = await sharp(cutout)
      .resize(1000, 1000, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 90 })
      .toBuffer();

    // --- 3. create a staged upload target ---
    const filename = 'product-' + Date.now() + '.jpg';
    const staged = await shopifyGraphQL(STORE, TOKEN, STAGED_MUTATION, {
      input: [{ filename, mimeType: 'image/jpeg', resource: 'IMAGE', httpMethod: 'POST' }]
    });
    const payload = staged && staged.data && staged.data.stagedUploadsCreate;
    const tgt = payload && payload.stagedTargets && payload.stagedTargets[0];
    const uErr = payload && payload.userErrors;
    if (!tgt || (uErr && uErr.length)) {
      res.status(200).json({ source: null, warning: 'Staged upload create failed', detail: uErr || (staged && staged.errors) });
      return;
    }

    // --- 4. upload the bytes to the staged target (GCS: params first, file last) ---
    const up = new FormData();
    (tgt.parameters || []).forEach(p => up.append(p.name, p.value));
    up.append('file', new Blob([processed], { type: 'image/jpeg' }), filename);
    const upRes = await fetch(tgt.url, { method: 'POST', body: up });
    if (!upRes.ok) {
      res.status(200).json({ source: null, warning: 'Image upload failed (' + upRes.status + ')' });
      return;
    }

    // resourceUrl is the value create-product passes as the media originalSource (imageUrl)
    res.status(200).json({ source: tgt.resourceUrl });
  } catch (e) {
    res.status(200).json({ source: null, warning: 'Image processing failed: ' + String((e && e.message) || e) });
  }
}

async function shopifyGraphQL(store, token, query, variables) {
  const r = await fetch('https://' + store + '/admin/api/' + API_VERSION + '/graphql.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables })
  });
  return r.json();
}
