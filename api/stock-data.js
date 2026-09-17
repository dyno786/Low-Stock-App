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

  // ── PICCO feeds — after you publish each branch's PICCO tab to web (CSV),
  //    paste its published URL here (same as you did for the stock tabs).
  { id: 'picco-roundhay', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRhmUF_atrBcjpWsTA21jv1snoqL9fwF-WERbK5G18l19aMY2HOWpngtIXocyJ8Up-IqTQ6fUG7Uh4S/pub?gid=844614803&single=true&output=csv' },
  { id: 'picco-city',     url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS4sk86Jlv4xZaqxp4ogpC4TYOLSNYd3dIMd-ub5l6rzCoO-F9OOePHPNx6kgbvDLY50gKAXMyLrTv1/pub?gid=955654066&single=true&output=csv' },
  { id: 'picco-chapy',    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWMTgDVDqdk4A-DZ-Ly2sMu-mXFTagwBiha9C1gOprWq3BdPGS3zk5eBXSSc5IpMr_u6DSzUEl6rs_/pub?gid=1658404203&single=true&output=csv' },
  { id: 'picco-warehouse',url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS_0b8x2d44NNBJIpe4GSNvD9C8bFmUvm3Nt0YPDEofOnEoGCPHft4U3bacH8Uwt0OkA9xghoC385rr/pub?gid=905022384&single=true&output=csv' },

  { id: 'images',    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTpu9NMXwqZKBOM-0HcE0dqczoOdZqCXCJK5vqwXCz5YT9ZOg2Pm1vE_PvvljD7MzxxUSUknrKfao5Q/pub?gid=955535085&single=true&output=csv' },
  { id: 'shopify-images', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTpu9NMXwqZKBOM-0HcE0dqczoOdZqCXCJK5vqwXCz5YT9ZOg2Pm1vE_PvvljD7MzxxUSUknrKfao5Q/pub?gid=604196280&single=true&output=csv' },

  // ── ImportLog tabs — one row per Apps Script run, contains CSVModified + RowsWritten + Status + Duration
  { id: 'chapy-log',     url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ2DoIGJsmVoJOmShcLoUJ6wFrwbVSejnPy7uft8UEf1Brj5gRNBmSTO4eRqZQkDsldlsD6GiBs2Bo/pub?gid=324459618&single=true&output=csv' },
  { id: 'city-log',      url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRfK3RbCr-2FPtGFXio6aL6UMnYrlNupoJ259jlHuLIXKkOBLraZxgcb8WvCj2ndeARlp-uVRyNMyKt/pub?gid=229494628&single=true&output=csv' },
  { id: 'roundhay-log',  url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT2w5wBKrzvkoUPjEB_f7K9_vyehT9MCAxJ32AwtSmNqZzVwJZaH2G0kg7YuRTjstWGZSLpGCVj9NzM/pub?gid=407478843&single=true&output=csv' },
  { id: 'warehouse-log', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR7w_JR_xjlsZTD4-WMWoxotOPHDGg7Kgj7yvGGtJLZUL8apgHzBTOQxM7eBNu2VVirn6ehnlNR4vC6/pub?gid=59104254&single=true&output=csv' },
];

function splitCSVLine(line){var out=[],cur='',q=false;for(var i=0;i<line.length;i++){var c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else{q=!q;}}else if(c===','&&!q){out.push(cur);cur='';}else{cur+=c;}}out.push(cur);return out;}
function trimInStock(csv){
  var lines=csv.split(/\r?\n/);
  if(lines.length<2)return csv;
  var qi=splitCSVLine(lines[0]).indexOf('StockQty');
  if(qi<0)return csv;
  var kept=[lines[0]];
  for(var i=1;i<lines.length;i++){var ln=lines[i];if(!ln||!ln.trim())continue;var q=parseInt(splitCSVLine(ln)[qi]);if(!isNaN(q)&&q>0)kept.push(ln);}
  return kept.join('\n');
}
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

  // ImportLog endpoints cache for only 60s so syscheck shows near-realtime status
  const isLog = branch.endsWith('-log');
  const cacheHeader = isLog
    ? 's-maxage=60, stale-while-revalidate=120'
    : 's-maxage=300, stale-while-revalidate=1800';

  try {
    const res = await fetch(target.url, {
      headers: { 'User-Agent': 'CC-Stock-App/1.0' }
    });
    let csv = await res.text();
    if (branch === 'warehouse') { try { csv = trimInStock(csv); } catch(e) {} }

    return new Response(csv, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'text/csv',
        'Cache-Control': cacheHeader,
      }
    });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
