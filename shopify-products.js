// api/shopify-products.js
// Fetches all Shopify products (variants only), returns a barcode→productId map
// for the "Not on Shopify" tab to cross-reference EPOS stock against.
//
// Required env vars:
//   SHOPIFY_STORE  = "cchairandbeauty.myshopify.com"
//   SHOPIFY_TOKEN  = Admin API access token (read_products scope minimum)
//
// Cache: 10 minutes server-side. First call after deploy ~30s for 18k SKUs;
// subsequent calls served instantly from edge cache.

export const config = { runtime: 'edge' };

const API_VERSION = '2024-04';
const PAGE_SIZE = 250; // Shopify max

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });

  const store = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_TOKEN;
  if (!store || !token) {
    return new Response(JSON.stringify({
      error: 'Missing SHOPIFY_STORE or SHOPIFY_TOKEN env vars'
    }), { status: 500, headers: cors });
  }

  try {
    const barcodes = {}; // barcode -> {productId, variantId, title}
    let pageInfo = null;
    let pageCount = 0;
    const MAX_PAGES = 100; // hard safety stop (~25k products)

    while (pageCount < MAX_PAGES) {
      const url = pageInfo
        ? `https://${store}/admin/api/${API_VERSION}/products.json?limit=${PAGE_SIZE}&page_info=${pageInfo}`
        : `https://${store}/admin/api/${API_VERSION}/products.json?limit=${PAGE_SIZE}&fields=id,title,variants`;

      const res = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const txt = await res.text();
        return new Response(JSON.stringify({
          error: `Shopify API ${res.status}: ${txt.slice(0, 200)}`
        }), { status: 502, headers: cors });
      }

      const data = await res.json();
      for (const p of data.products || []) {
        for (const v of p.variants || []) {
          const bc = (v.barcode || '').trim();
          if (bc) {
            barcodes[bc] = {
              productId: p.id,
              variantId: v.id,
              title: p.title,
            };
          }
        }
      }
      pageCount++;

      // Follow Link header for next page (cursor-based pagination)
      const linkHeader = res.headers.get('link') || '';
      const nextMatch = linkHeader.match(/<[^>]+[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
      if (!nextMatch) break;
      pageInfo = nextMatch[1];
    }

    return new Response(JSON.stringify({
      barcodes,
      count: Object.keys(barcodes).length,
      pagesScanned: pageCount,
      fetchedAt: new Date().toISOString(),
    }), {
      status: 200,
      headers: {
        ...cors,
        'Cache-Control': 's-maxage=600, stale-while-revalidate=1800', // 10 min fresh, 30 min stale
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
