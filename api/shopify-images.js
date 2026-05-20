// api/shopify-images.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const STORE = (process.env.SHOPIFY_STORE || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const TOKEN = (process.env.SHOPIFY_TOKEN || '').trim();

  if (!STORE || !TOKEN) {
    return res.status(500).json({
      error: 'Missing env vars',
      has_store: !!STORE,
      has_token: !!TOKEN
    });
  }

  // Show exactly what URL we're calling (safe — no token shown)
  const testUrl = `https://${STORE}/admin/api/2024-01/shop.json`;

  try {
    // First test: just fetch the shop endpoint to verify credentials
    const testRes = await fetch(testUrl, {
      headers: {
        'X-Shopify-Access-Token': TOKEN,
        'Content-Type': 'application/json',
      }
    });

    if (!testRes.ok) {
      const errBody = await testRes.text();
      return res.status(500).json({
        error: `Shopify responded ${testRes.status}`,
        url_used: testUrl,
        shopify_response: errBody.substring(0, 300)
      });
    }

    const shopData = await testRes.json();

    // Credentials work — now fetch products
    const results = {};
    let pageUrl = `https://${STORE}/admin/api/2024-01/products.json?limit=250&fields=id,variants,images`;
    let pageCount = 0;

    while (pageUrl && pageCount < 200) {
      const response = await fetch(pageUrl, {
        headers: { 'X-Shopify-Access-Token': TOKEN }
      });

      if (!response.ok) {
        return res.status(500).json({
          error: `Products fetch failed ${response.status}`,
          page: pageCount
        });
      }

      const data = await response.json();
      const products = data.products || [];

      products.forEach(product => {
        const imageUrl = product.images && product.images.length > 0
          ? product.images[0].src : null;
        (product.variants || []).forEach(variant => {
          const bc = (variant.barcode || variant.sku || '').trim();
          if (!bc) return;
          results[bc] = { h: imageUrl ? 1 : 0, u: imageUrl };
        });
      });

      const link = response.headers.get('Link') || '';
      const next = link.match(/<([^>]+)>;\s*rel="next"/);
      pageUrl = next ? next[1] : null;
      pageCount++;
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json({
      ok: true,
      shop: shopData.shop ? shopData.shop.name : 'unknown',
      count: Object.keys(results).length,
      pages: pageCount,
      products: results
    });

  } catch(e) {
    return res.status(500).json({
      error: e.message,
      url_attempted: testUrl,
      store_value: STORE
    });
  }
}
