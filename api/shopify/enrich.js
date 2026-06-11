// api/shopify/enrich.js — AI product research + listing copy.
// Returns { title, descriptionHtml, seoTitle, seoDescription } for a product.
// Uses OpenAI (OPENAI_API_KEY, already set in your Vercel project).
//   1) tries the Responses API WITH web search for real research,
//   2) falls back to Chat Completions (guaranteed JSON) if that isn't available.
// Optional ENV: OPENAI_MODEL (default "gpt-4o").

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

  const instructions = 'You write e-commerce product listings for CC Hair And Beauty, a UK retailer specialising in Afro and ethnic hair & beauty products. Research the given product and write accurate, appealing copy in UK English. Do not invent ingredients, claims, sizes or awards you are not confident about — keep uncertain specifics general. Respond with ONLY a JSON object, no markdown fences, with keys: title, descriptionHtml, seoTitle, seoDescription.';

  const ask =
    'Product name: ' + name + '\nBrand: ' + brand + '\nCategory: ' + category + '\nBarcode: ' + barcode + '\n\n' +
    'Write:\n' +
    '- title: clean Title Case product name (brand + product + variant/size if known), max ~70 chars.\n' +
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
  function clean(o) {
    const s = x => ('' + (x == null ? '' : x)).trim();
    return {
      title: s(o.title).slice(0, 120),
      descriptionHtml: s(o.descriptionHtml),
      seoTitle: s(o.seoTitle).slice(0, 70),
      seoDescription: s(o.seoDescription).slice(0, 320)
    };
  }

  // 1) Responses API with web search (real research)
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
      if (parsed && parsed.title) { res.status(200).json(clean(parsed)); return; }
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
        max_tokens: 900,
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
    if (parsed && parsed.title) { res.status(200).json(clean(parsed)); return; }
    res.status(502).json({ error: 'Could not parse AI response' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
