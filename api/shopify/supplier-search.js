// api/shopify/supplier-search.js
// Given a barcode, search the CONFIRMED supplier Shopify sites and return full product
// data (title, price, image, description, vendor) for any site whose product's REAL
// barcode matches. Feeds the "Find from suppliers" button in the + Shopify draft form.
//
//   /api/shopify/supplier-search?barcode=817513010132&name=cantu%20leave%20in&sites=kiyobeauty.com,beautizone.co.uk
//
// Returns: { barcode, matches:[{site,title,vendor,price,currency,image,descriptionHtml,handle,url,barcode,sku}],
//            nameMatches:[...], tried:[...] }
// A site is only reported in `matches` when a variant barcode actually equals the one searched
// (leading zeros ignored) — no false positives.

export const config = { runtime: 'edge' };

function cleanSite(s){ s=(s||'').trim().replace(/^https?:\/\//i,'').replace(/\/.*$/,'').replace(/^www\./i,''); return s; }
function httpsify(u){ if(!u)return ''; u=(''+u).trim(); if(u.indexOf('//')===0)return 'https:'+u; if(/^https?:\/\//i.test(u))return u; return 'https://'+u; }
function normBc(x){ return (''+(x||'')).trim().replace(/^0+/,''); }
function barcodeForms(bc){
  bc=(''+bc).trim();
  if(!/^\d{6,14}$/.test(bc)) return [];
  var v=[bc];
  var stripped=bc.replace(/^0+/,''); if(stripped&&stripped!==bc)v.push(stripped);
  if(bc.length<13)v.push(bc.padStart(13,'0'));
  if(bc.length===12)v.push('0'+bc);
  return Array.from(new Set(v.filter(Boolean)));
}

async function suggest(site,q){
  try{
    var u='https://'+site+'/search/suggest.json?q='+encodeURIComponent(q)+'&resources[type]=product&resources[limit]=8';
    var r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 (CC-Warehouse-App)','Accept':'application/json'}});
    var ct=(r.headers.get('content-type')||'').toLowerCase();
    if(!r.ok||ct.indexOf('json')<0)return {shopify:false,items:[]};
    var d=await r.json();
    var prods=(d&&d.resources&&d.resources.results&&d.resources.results.products)||[];
    return {shopify:true,items:prods.map(function(p){return {title:p.title||'',handle:p.handle||'',url:'https://'+site+(p.url||''),image:httpsify(p.image||p.featured_image||''),price:p.price||'',vendor:p.vendor||''};})};
  }catch(e){ return {shopify:false,items:[]}; }
}

// full product data via the public .js endpoint (includes variants[].barcode + body_html + images)
async function productJs(site,handle){
  try{
    var r=await fetch('https://'+site+'/products/'+handle+'.js',{headers:{'User-Agent':'Mozilla/5.0 (CC-Warehouse-App)','Accept':'application/json'}});
    if(!r.ok)return null;
    return await r.json();
  }catch(e){ return null; }
}

function packProduct(site,handle,d,matchedVariant){
  var img='';
  if(d.images&&d.images.length)img=httpsify(d.images[0]);
  else if(d.featured_image)img=httpsify(d.featured_image);
  var v=matchedVariant||(d.variants&&d.variants[0])||{};
  return {
    site:site,
    title:d.title||'',
    vendor:d.vendor||'',
    price:(v.price!=null?(v.price/100).toFixed(2):''),
    compareAt:(v.compare_at_price!=null&&v.compare_at_price?(v.compare_at_price/100).toFixed(2):''),
    currency:'GBP',
    image:img,
    images:(d.images||[]).slice(0,6).map(httpsify),
    descriptionHtml:d.description||d.body_html||'',
    handle:handle,
    url:'https://'+site+'/products/'+handle,
    barcode:v.barcode||'',
    sku:v.sku||'',
    available:!!v.available
  };
}

export default async function handler(req){
  var cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json'};
  if(req.method==='OPTIONS')return new Response(null,{status:200,headers:cors});
  var url=new URL(req.url);
  var barcode=(url.searchParams.get('barcode')||'').trim();
  var name=(url.searchParams.get('name')||'').trim();
  var sitesRaw=(url.searchParams.get('sites')||'').trim();
  var sites=sitesRaw.split(',').map(cleanSite).filter(Boolean);
  if(!sites.length)return new Response(JSON.stringify({error:'sites required (comma-separated confirmed supplier domains)'}),{status:400,headers:cors});

  var forms=barcodeForms(barcode);
  var matches=[], nameMatches=[], tried=[];

  // ---- barcode path: search each site, verify real barcode ----
  for(var s=0;s<sites.length;s++){
    var site=sites[s]; tried.push(site);
    var found=null;
    for(var f=0;f<forms.length && !found;f++){
      var res=await suggest(site,forms[f]);
      if(!res.items.length) continue;
      for(var j=0;j<res.items.length && !found;j++){
        var it=res.items[j]; if(!it.handle) continue;
        var d=await productJs(site,it.handle); if(!d||!d.variants) continue;
        for(var k=0;k<d.variants.length;k++){
          if(d.variants[k].barcode && normBc(d.variants[k].barcode)===normBc(forms[f])){
            found=packProduct(site,it.handle,d,d.variants[k]); break;
          }
        }
      }
    }
    if(found)matches.push(found);
  }

  // ---- name fallback: only if NO barcode match anywhere ----
  if(false){ /* name matching disabled — barcode-only */
    for(var s2=0;s2<sites.length;s2++){
      var rn=await suggest(sites[s2],name);
      if(rn.items.length){
        // pull full data for the top candidate so the user gets image+desc to eyeball
        var top=rn.items[0];
        var dd=top.handle?await productJs(sites[s2],top.handle):null;
        nameMatches.push(dd?packProduct(sites[s2],top.handle,dd,null):{site:sites[s2],title:top.title,image:top.image,url:top.url,handle:top.handle,price:'',barcode:'',unverified:true});
      }
    }
  }

  return new Response(JSON.stringify({
    barcode:barcode, name:name, sitesSearched:sites,
    matchCount:matches.length, matches:matches,
    nameMatches:nameMatches, tried:tried
  },null,2),{status:200,headers:cors});
}
