// api/shopify/enrich.js — AI product research + listing copy (barcode-aware, attribute-aware, collection-aware).
// Returns { title, brand, category, tags[], attributes{}, collections[], descriptionHtml, seoTitle, seoDescription }.
// - Uses the BARCODE to identify the real product and FIX truncated till names.
// - Picks Shopify standard product attributes from allowed values (_taxonomy.js).
// - Places the product into the correct smart collections using the store's REAL tag rules and
//   matches the exact vendor name for vendor-driven collections (_collections.js).
// OpenAI (OPENAI_API_KEY). 1) Responses API w/ web search, 2) Chat Completions fallback. ENV: OPENAI_MODEL.

import { attrOptionsText, categoryFor, categoryOptionsText } from './_taxonomy.js';
import { fetchCollectionMenu, collectionOptionsText, validCollectionTags, canonicalVendor } from './_collections.js';

export const config = { maxDuration: 60 };

const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  if (!KEY) { res.status(500).json({ error: 'Missing OPENAI_API_KEY' }); return; }

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) {}
  const name = (body.name || '').trim();
  const brand = (body.brand || '').trim();
  const category = (body.category || '').trim();
  const barcode = (body.barcode || '').trim();
  if (!name) { res.status(400).json({ error: 'name required' }); return; }

  let menu = { tags: [], vendors: [] };
  try { menu = await fetchCollectionMenu(); } catch (e) {}

  const instructions =
    'You are a product researcher and e-commerce copywriter for CC Hair And Beauty, a UK retailer specialising in ' +
    'Afro and ethnic hair & beauty products. The product name you receive comes from an EPOS till and is often ' +
    'TRUNCATED, abbreviated, or missing spaces (e.g. "TARGETSERUM" means "Target Serum"; "GEL TUBE" may just be "Gel"; ' +
    '"CREME WAX HONEY" means a honey-scented creme wax). Use the BARCODE and brand to identify the EXACT real-world ' +
    'product, then correct and expand the name properly. Research carefully and do NOT invent ingredients, sizes, ' +
    'claims or awards you are not confident about — keep uncertain specifics general. Write in UK English. ' +
    'You will also classify the product using FIXED lists: only ever use the exact attribute value labels and the ' +
    'exact collection tags provided, never invent new ones, and omit anything that does not clearly apply. If the ' +
    "product's brand matches one of the listed vendor names, return the brand with that exact spelling. " +
    'You will also be given a short list of standard product categories; choose the single best fit so the ' +
    'official attribute fields can be saved. ' +
    'Respond with ONLY a JSON object (no markdown fences) with keys: ' +
    'title, brand, category, taxonomyCategory, tags, attributes, collections, descriptionHtml, seoTitle, seoDescription.';

  const ask =
    'Raw till name (may be truncated): ' + name + '\n' +
    'Brand (may be blank or partial): ' + (brand || '(unknown)') + '\n' +
    'Category hint: ' + (category || '(unknown)') + '\n' +
    'Barcode (use this to identify the exact product): ' + (barcode || '(none)') + '\n\n' +
    'Standard product categories (choose the ONE that best fits):\n' +
    categoryOptionsText() + '\n\n' +
    'Allowed attribute values (use the key on the left; pick ONLY from the exact labels listed):\n' +
    attrOptionsText() + '\n\n' +
    'Shop collection tags (place the product in the ones it belongs to, using the EXACT tag on the left):\n' +
    (collectionOptionsText(menu) || '(none available)') + '\n\n' +
    'Known vendor names (if the product brand is one of these, return brand EXACTLY as written): ' +
    ((menu.vendors || []).slice(0, 80).join(', ') || '(none)') + '\n\n' +
    'Tasks:\n' +
    '- Identify the exact product from the barcode and brand. If the till name is truncated or has words run together, fix it.\n' +
    '- title: the correct, full product name in Title Case (Brand + Product + Variant/Scent + Size if known), max ~70 chars. No barcode in the title.\n' +
    '- brand: the correct brand / manufacturer name in Title Case (use an exact vendor name from the list if it matches).\n' +
    '- category: a concise product type, e.g. "Hair Serum", "Body Spray", "Styling Gel", "Shampoo", "Hair Wax".\n' +
    '- taxonomyCategory: the single best-matching label from the Standard product categories list above (exact text). Use empty string only if none fit.\n' +
    '- tags: an array of 6 to 12 short lowercase descriptive tags for search — product type, format, scent/variant, hair or skin type or concern, brand, size. No "#".\n' +
    '- attributes: an object whose keys are the attribute keys above and whose values are arrays of the EXACT labels that apply (1 to 4 each). Only include attributes you are confident about.\n' +
    '- collections: an array of the EXACT collection tags from the list above that this product belongs in (usually 2 to 6). Only use tags from that list; pick the genuinely relevant ones.\n' +
    '- descriptionHtml: 2 to 3 short paragraphs wrapped in <p> tags — what it is, who it suits, key benefits, and how to use it.\n' +
    '- seoTitle: max 60 characters, include the brand and product.\n' +
    '- seoDescription: max 155 characters, compelling, includes the product and a key benefit.\n' +
    'Return ONLY the JSON object.';

  function parseJSON(t) {
    if (!t) return null;
    let s = ('' + t).trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    const i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i >= 0 && j > i) s = s.slice(i, j + 1);
    try { return JSON.parse(s); } catch (e) { return null; }
  }
  function cleanTags(t) {
    let arr = Array.isArray(t) ? t : (typeof t === 'string' ? t.split(',') : []);
    const seen = {}, out = [];
    for (let x of arr) {
      x = ('' + (x == null ? '' : x)).replace(/^#/, '').trim().slice(0, 40);
      if (!x) continue;
      const k = x.toLowerCase();
      if (seen[k]) continue;
      seen[k] = 1; out.push(x);
      if (out.length >= 15) break;
    }
    return out;
  }
  function cleanAttrs(a) {
    const out = {};
    if (a && typeof a === 'object' && !Array.isArray(a)) {
      for (const k of Object.keys(a)) {
        let v = a[k];
        if (!Array.isArray(v)) v = (typeof v === 'string' ? v.split(',') : []);
        const arr = [];
        for (let x of v) { x = ('' + (x == null ? '' : x)).trim(); if (x && arr.indexOf(x) < 0) arr.push(x); if (arr.length >= 6) break; }
        if (arr.length) out[('' + k).trim()] = arr;
      }
    }
    return out;
  }
  function finalize(o) {
    const s = x => ('' + (x == null ? '' : x)).trim();
    const catInfo = categoryFor(o.taxonomyCategory);
    let attrs = cleanAttrs(o.attributes);
    if (catInfo) {
      // keep only attributes that are valid for the chosen taxonomy category
      const allow = {}; catInfo.keys.forEach(k => allow[k] = 1);
      const filtered = {}; Object.keys(attrs).forEach(k => { if (allow[k]) filtered[k] = attrs[k]; });
      attrs = filtered;
    } else {
      attrs = {}; // no category -> attributes can't be saved, so don't return any
    }
    const out = {
      title: s(o.title).slice(0, 120),
      brand: s(o.brand).slice(0, 80),
      category: s(o.category).slice(0, 60),
      taxonomyCategory: catInfo ? catInfo.label : '',
      tags: cleanTags(o.tags),
      attributes: attrs,
      collections: validCollectionTags(o.collections, menu),
      descriptionHtml: s(o.descriptionHtml),
      seoTitle: s(o.seoTitle).slice(0, 70),
      seoDescription: s(o.seoDescription).slice(0, 320)
    };
    const cv = canonicalVendor(out.brand, menu);
    if (cv) out.brand = cv;
    return out;
  }

  // 1) Responses API with web search (real research by barcode)
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify({
        model: MODEL,
        tools: [{ type: 'web_search_preview' }],
        instructions: instructions,
        input: ask,
        max_output_tokens: 1400
      })
    });
    if (r.ok) {
      const j = await r.json();
      let text = j.output_text;
      if (!text && Array.isArray(j.output)) {
        text = j.output.map(o => (o.content || []).map(c => c.text || '').join('')).join('');
      }
      const parsed = parseJSON(text);
      if (parsed && parsed.title) { res.status(200).json(finalize(parsed)); return; }
    }
  } catch (e) { /* fall through to chat */ }

  // 2) Fallback: Chat Completions, guaranteed JSON, no web tool
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: 'json_object' },
        max_tokens: 1400,
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: ask }
        ]
      })
    });
    const j = await r.json();
    if (j.error) { res.status(502).json({ error: j.error.message || 'OpenAI error' }); return; }
    const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    const parsed = parseJSON(text);
    if (parsed && parsed.title) { res.status(200).json(finalize(parsed)); return; }
    res.status(502).json({ error: 'Could not parse AI response' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
