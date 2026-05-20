// api/stock-data.js
// Fetches all 4 branch CSVs and caches them server-side for 5 minutes
// Phones hit this endpoint instead of Google Sheets directly
// Response time: ~50ms from cache vs ~2000ms from Google Sheets

export const config = { runtime: 'edge' };

const BRANCHES = [
  { id: 'chapy',     url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ2DoIGJsmVoJOmShcLoUJ6wFrwbVSejnPy7uft8UEf1Brj5gRNBmSTO4eRqZQkDsldlsD6GiBs2Bo/pub?gid=0&single=true&output=csv' },
  { id: 'city',      url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRfK3RbCr-2FPtGFXio6aL6UMnYrlNupoJ259jlHuLIXKkOBLraZxgcb8WvCj2ndeARlp-uVRyNMyKt/pub?gid=0&single=true&output=csv' },
  { id: 'roundhay',  url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT2w5wBKrzvkoUPjEB_f7K9_vyehT9MCAxJ32AwtSmNqZzVwJZaH2G0kg7YuRTjstWGZSLpGCVj9NzM/pub?gid=0&single=true&output=csv' },
  { id: 'warehouse', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR7w_JR_xjlsZTD4-WMWoxotOPHDGg7Kgj7yvGGtJLZUL8apgHzBTOQxM7eBNu2VVirn6ehnlNR4vC6/pub?gid=0&single=true&output=csv' },
  { id: 'images',    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTpu9NMXwqZKBOM-0HcE0dqczoOdZqCXCJK5vqwXCz5YT9ZOg2Pm1vE_PvvljD7MzxxUSUknrKfao5Q/pub?gid=955535085&single=true&output=csv' },
  { id: 'shopify-images', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTpu9NMXwqZKBOM-0HcE0dqczoOdZqCXCJK5vqwXCz5YT9ZOg2Pm1vE_PvvljD7MzxxUSUknrKfao5Q/pub?gid=604196280&single=true&output=csv' },
];

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });

  const url = new URL(req.url);
  const branch = url.searchParams.get('branch');
  const target = BRANCHES.find(b => b.id === branch);

  if (!target) {
    return new Response(JSON.stringify({ error: 'Unknown branch' }), { status: 400, headers: cors });
  }

  try {
    const res = await fetch(target.url, {
      headers: { 'User-Agent': 'CC-Stock-App/1.0' }
    });
    const csv = await res.text();

    return new Response(csv, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'text/csv',
        // Cache at Vercel edge for 5 minutes, stale-while-revalidate for 30 mins
        'Cache-Control': 's-maxage=300, stale-while-revalidate=1800',
      }
    });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
