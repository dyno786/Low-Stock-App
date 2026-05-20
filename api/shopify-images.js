// api/shopify-images.js
// Fetches all products from Shopify and returns barcode → image status
// Returns 3 states per product:
//   has_image: true/false
//   on_shopify: true (all returned products are on Shopify)
//   image_url: the URL or null
//
// Called by branch files as: /api/shopify-images
// Cached at edge for 30 minutes

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

  if (!STORE || !TOKEN) {
    return new Response(JSON.stringify({ error: 'Shopify credentials not configured' }), {
      status: 500, headers: cors
    });
  }

  try {
    const results = {}; // barcode → { has_image, image_url }
    let url = `https://${STORE}/admin/api/2024-01/products.json?limit=250&fields=id,variants,images`;
    let pageCount = 0;

    // Paginate through ALL Shopify products
    while (url && pageCount < 100) {
      const res = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': TOKEN,
          'Content-Type': 'application/json',
        }
      });

      if (!res.ok) {
        return new Response(JSON.stringify({ 
          error: `Shopify API error: ${res.status}`,
          store: STORE 
        }), { status: res.status, headers: cors });
      }

      const data = await res.json();
      const products = data.products || [];

      products.forEach(function(product) {
        // Get first image URL for this product
        const imageUrl = product.images && product.images.length > 0
          ? product.images[0].src
          : null;

        // Map each variant barcode to image status
        (product.variants || []).forEach(function(variant) {
          const barcode = (variant.barcode || '').trim();
          const sku = (variant.sku || '').trim();

          // Use barcode first, fall back to SKU
          const bc = barcode || sku;
          if (!bc) return;

          results[bc] = {
            has_image: !!imageUrl,
            image_url: imageUrl,
            on_shopify: true
          };
        });
      });

      // Check for next page via Link header
      const linkHeader = res.headers.get('Link') || '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      url = nextMatch ? nextMatch[1] : null;
      pageCount++;
    }

    return new Response(JSON.stringify({
      ok: true,
      count: Object.keys(results).length,
      products: results
    }), {
      status: 200,
      headers: {
        ...cors,
        // Cache for 30 minutes at edge
        'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600',
      }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: cors
    });
  }
}
