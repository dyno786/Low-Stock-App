// api/shopify/supplier.js
// Tests + searches supplier Shopify storefronts by barcode (name fallback).
// Test a site:  /api/shopify/supplier?site=beautyqueenscosmetics.com&barcode=5035620044313&name=Cocoa%20Butter
// Returns a verdict (is it Shopify? does barcode search work?) + product matches.

export const config = { runtime: 'edge' };

function cleanSite(s){ s=(s||'').trim().replace(/^https?:\/\//i,'').replace(/\/.*$/,''); return s?('https://'+s):''; }
function variants(bc){
  bc=(''+bc).trim(); var v=[bc];
  var stripped=bc.replace(/^0+/,''); if(stripped&&stripped!==bc)v.push(stripped);
  if(bc.length===12)v.push('0'+bc);
  if(bc.length===13&&bc[0]==='0')v.push(bc.slice(1));
  return v.filter(Boolean);
}
async function suggest(site,q){
  try{
    var u=site+'/search/suggest.json?q='+encodeURIComponent(q)+'&resources[type]=product&resources[limit]=6';
    var r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 (CC-Warehouse-App)','Accept':'application/json'}});
    var ct=(r.headers.get('content-type')||'').toLowerCase();
    if(!r.ok||ct.indexOf('json')<0)return {shopify:false,items:[]};
    var d=await r.json();
    var prods=(d&&d.resources&&d.resources.results&&d.resources.results.products)||[];
    return {shopify:true,items:prods.map(function(p){
      return {title:p.title||'', url:site+(p.url||''), image:(p.image||p.featured_image||''), price:p.price||'', vendor:p.vendor||'', handle:p.handle||''};
    })};
  }catch(e){ return {shopify:false,items:[]}; }
}
export default async function handler(req){
  var cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json'};
  if(req.method==='OPTIONS')return new Response(null,{status:200,headers:cors});
  var url=new URL(req.url);
  var site=cleanSite(url.searchParams.get('site'));
  var barcode=url.searchParams.get('barcode')||'';
  var name=url.searchParams.get('name')||'';
  if(!site)return new Response(JSON.stringify({error:'site required, e.g. ?site=beautyqueenscosmetics.com&barcode=5035620044313'}),{status:400,headers:cors});

  var isShopify=false, barcodeWorks=false, nameWorks=false, matches=[], triedBarcodes=[];
  if(barcode){
    for(var i=0;i<variants(barcode).length;i++){
      var bv=variants(barcode)[i]; triedBarcodes.push(bv);
      var res=await suggest(site,bv);
      if(res.shopify)isShopify=true;
      if(res.items.length){barcodeWorks=true;matches=res.items;break;}
    }
  }
  if(!matches.length && name){
    var rn=await suggest(site,name);
    if(rn.shopify)isShopify=true;
    if(rn.items.length){nameWorks=true;matches=rn.items;}
  }
  if(!isShopify){ var probe=await suggest(site,'oil'); isShopify=probe.shopify; }

  var verdict = !isShopify ? '\u274C not Shopify (or no public search) \u2014 cannot use this method'
    : barcodeWorks ? '\u2705 Shopify + barcode search WORKS \u2014 use this site'
    : nameWorks ? '\u26A0\uFE0F Shopify, but only NAME search works \u2014 usable with confirm-before-add'
    : '\u26A0\uFE0F Shopify, but no match for this barcode/name \u2014 try another test barcode';

  return new Response(JSON.stringify({site:site,isShopify:isShopify,barcodeWorks:barcodeWorks,nameWorks:nameWorks,verdict:verdict,triedBarcodes:triedBarcodes,matchCount:matches.length,matches:matches.slice(0,6)},null,2),{status:200,headers:cors});
}
