// api/shopify-images.js
// Fetches all products from Shopify and returns barcode → image status

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });

  const STORE = process.env.SHOPIFY_STORE;
  const TOKEN = process.env.SHOPIFY_TOKEN;

  // Debug: check env vars exist (don't log values)
  if (!STORE || !TOKEN) {
    return new Response(JSON.stringify({
      error: 'Missing env vars',
      has_store: !!STORE,
      has_token: !!TOKEN
    }), { status: 500, headers: cors });
  }

  try {
    const results = {};
    let pageUrl = `https://${STORE}/admin/api/2024-01/products.json?limit=250&fields=id,variants,images`;
    let pageCount = 0;
    let totalProducts = 0;

    while (pageUrl && pageCount < 100) {
      const res = await fetch(pageUrl, {
        headers: {
          'X-Shopify-Access-Token': TOKEN,
          'Content-Type': 'application/json',
        }
      });

      // Return detailed error if Shopify rejects
      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({
          error: `Shopify returned ${res.status}`,
          status: res.status,
          detail: errText.substring(0, 200),
          store: STORE,
          page: pageCount
        }), { status: 500, headers: cors });
      }

      const data = await res.json();
      const products = data.products || [];
      totalProducts += products.length;

      products.forEach(function(product) {
        const imageUrl = product.images && product.images.length > 0
          ? product.images[0].src : null;

        (product.variants || []).forEach(function(variant) {
          const barcode = (variant.barcode || '').trim();
          const sku = (variant.sku || '').trim();
          const bc = barcode || sku;
          if (!bc) return;
          results[bc] = {
            has_image: !!imageUrl,
            image_url: imageUrl,
            on_shopify: true
          };
        });
      });

      // Next page from Link header
      const linkHeader = res.headers.get('Link') || '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      pageUrl = nextMatch ? nextMatch[1] : null;
      pageCount++;
    }

    return new Response(JSON.stringify({
      ok: true,
      count: Object.keys(results).length,
      total_products: totalProducts,
      pages_fetched: pageCount,
      products: results
    }), {
      status: 200,
      headers: {
        ...cors,
        'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600',
      }
    });

  } catch(e) {
    return new Response(JSON.stringify({
      error: e.message,
      stack: e.stack ? e.stack.substring(0, 300) : null
    }), { status: 500, headers: cors });
  }
}
