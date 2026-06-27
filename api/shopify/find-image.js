// api/shopify/find-image.js — Auto-find a product packshot from the web for the "+ Shopify" flow.
// Reuses the SAME capability as enrich.js: OpenAI Responses API + web_search_preview.
// The model identifies the correct product (by barcode/GTIN) and proposes candidate image
// URLs; we then VALIDATE each one server-side (must be a real, publicly fetchable image/*)
// and strip resize params, so create-product can always ingest what we return.
//
//   POST { barcode, name, brand }
//   -> { imageUrl: <best validated https image or null>, source, candidates:[{imageUrl,source,score,ok}] }
//
// Fail-soft like the other endpoints: never 500 on "not found" — returns imageUrl:null so the
// modal falls back to manual upload.

export const config = { maxDuration: 45 };

const KEY   = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

function parseJSON(t) {
  if (!t) return null;
  let s = ('' + t).trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch (e) { return null; }
}

// Remove image-resizing params (e.g. width=, height=) to get full resolution,
// but keep version params (e.g. v=). Only touches known resize keys, so non-Shopify
// URLs that need their params are left intact.
function stripResize(u) {
  try {
    const url = new URL(u);
    ['width', 'height', 'w', 'h', 'size', 'sz', 'maxwidth', 'maxheight'].forEach(p => {
      url.searchParams.delete(p); url.searchParams.delete(p.toUpperCase());
    });
    return url.toString();
  } catch (e) { return u; }
}

// Confirm a URL is a real, publicly fetchable image before we hand it to Shopify.
async function isImage(u) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(u, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/avif,image/webp,image/*,*/*' }
    });
    clearTimeout(t);
    if (!r.ok) return false;
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    return ct.indexOf('image/') === 0;
  } catch (e) { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) {}
  const barcode = ('' + (body.barcode || '')).trim();
  const name    = ('' + (body.name    || '')).trim();
  const brand   = ('' + (body.brand   || '')).trim();

  // Nothing to search on, or no key configured -> fail soft (manual upload).
  if ((!name && !barcode) || !KEY) { res.status(200).json({ imageUrl: null, candidates: [] }); return; }

  const instructions =
    'You are an image-sourcing assistant for CC Hair And Beauty, a UK retailer of Afro and ethnic ' +
    'hair & beauty products. Given a product identified primarily by its BARCODE (GTIN), use web ' +
    'search to find the OFFICIAL product packshot: a clean, front-facing image on a white or plain ' +
    'background. Strongly prefer the brand\'s OWN website, then a reputable distributor/retailer ' +
    'product page. Open the product page and return the DIRECT image URL (the og:image meta tag is ' +
    'ideal). Avoid barcode-lookup directories, marketplace listings with watermarked or hotlink-' +
    'blocked images, lifestyle or ingredient-only shots, and login-walled pages. If the barcode ' +
    'appears in the image filename, the page URL, or the page text, that is a strong signal you have ' +
    'the right product — rank those candidates higher. Respond with ONLY a JSON object, no markdown.';

  const ask =
    'Barcode (GTIN, primary identifier): ' + (barcode || '(none)') + '\n' +
    'Product name (may be a truncated/abbreviated till name): ' + name + '\n' +
    'Brand (may be blank): ' + (brand || '(unknown)') + '\n\n' +
    'Return ONLY this JSON:\n' +
    '{"candidates":[{"imageUrl":"<direct https image URL>","source":"<short site name>","score":<number 0..1>}]}\n' +
    'Up to 5 candidates, best first. Each imageUrl must be a DIRECT link to an image file ' +
    '(.jpg/.jpeg/.png/.webp), not a web page. Strip image-resizing query params (e.g. width=, height=) ' +
    'but keep version params (e.g. v=). score reflects how confident you are it is THIS exact product ' +
    '(barcode match = high). If you cannot confidently find the correct product image, return ' +
    '{"candidates":[]}.';

  // 1) Ask the web-search model for candidate image URLs.
  let raw = [];
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify({
        model: MODEL,
        tools: [{ type: 'web_search_preview' }],
        instructions: instructions,
        input: ask,
        max_output_tokens: 900
      })
    });
    if (r.ok) {
      const j = await r.json();
      let text = j.output_text;
      if (!text && Array.isArray(j.output)) {
        text = j.output.map(o => (o.content || []).map(c => c.text || '').join('')).join('');
      }
      const parsed = parseJSON(text);
      if (parsed) raw = Array.isArray(parsed) ? parsed : (parsed.candidates || []);
    }
  } catch (e) { /* fail soft */ }

  // 2) Normalise + de-dupe candidate URLs.
  const norm = [], seen = {};
  for (const c of (raw || [])) {
    let iu = ('' + ((c && (c.imageUrl || c.url || c.image)) || '')).trim();
    if (!/^https:\/\//i.test(iu)) continue;
    if (seen[iu]) continue; seen[iu] = 1;
    let score = Number(c && c.score); if (!(score >= 0)) score = 0.5;
    norm.push({ imageUrl: iu, source: ('' + ((c && (c.source || c.site)) || '')).trim(), score });
    if (norm.length >= 6) break;
  }

  // 3) Validate in parallel (try the resize-stripped URL first, then the original).
  const checks = await Promise.all(norm.map(async c => {
    const stripped = stripResize(c.imageUrl);
    let okUrl = null;
    if (await isImage(stripped)) okUrl = stripped;
    else if (stripped !== c.imageUrl && await isImage(c.imageUrl)) okUrl = c.imageUrl;
    return { imageUrl: okUrl || stripped, source: c.source, score: c.score, ok: !!okUrl };
  }));

  checks.sort((a, b) => b.score - a.score);
  const best = checks.find(c => c.ok) || null;

  res.status(200).json({
    imageUrl: best ? best.imageUrl : null,
    source:   best ? best.source   : '',
    candidates: checks.slice(0, 4)
  });
}
