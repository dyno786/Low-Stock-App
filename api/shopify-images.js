// api/shopify-images.js
// Returns barcode → image URL map from Shopify
// Uses Node.js runtime (not edge) to avoid size limits

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const STORE = process.env.SHOPIFY_STORE;
  const TOKEN = process.env.SHOPIFY_TOKEN;

  if (!STORE || !TOKEN) {
    return res.status(500).json({
      error: 'Missing env vars',
      has_store: !!STORE,
      has_token: !!TOKEN
    });
  }

  try {
    const results = {};
    let pageUrl = `https://${STORE}/admin/api/2024-01/products.json?limit=250&fields=id,variants,images`;
    let pageCount = 0;
    let totalProducts = 0;

    while (pageUrl && pageCount < 200) {
      const response = await fetch(pageUrl, {
        headers: {
          'X-Shopify-Access-Token': TOKEN,
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(500).json({
          error: `Shopify API error ${response.status}`,
          detail: errText.substring(0, 300),
          store: STORE,
          page: pageCount
        });
      }

      const data = await response.json();
      const products = data.products || [];
      totalProducts += products.length;

      products.forEach(product => {
        // Get first image URL
        const imageUrl = product.images && product.images.length > 0
          ? product.images[0].src : null;

        (product.variants || []).forEach(variant => {
          const bc = (variant.barcode || variant.sku || '').trim();
          if (!bc) return;
          results[bc] = {
            h: imageUrl ? 1 : 0,  // has image (compact)
            u: imageUrl            // url
          };
        });
      });

      // Get next page from Link header
      const link = response.headers.get('Link') || '';
      const next = link.match(/<([^>]+)>;\s*rel="next"/);
      pageUrl = next ? next[1] : null;
      pageCount++;
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json({
      ok: true,
      count: Object.keys(results).length,
      pages: pageCount,
      products: results
    });

  } catch(e) {
    return res.status(500).json({
      error: e.message
    });
  }
}
