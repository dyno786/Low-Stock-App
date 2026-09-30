// api/shopify/enrich.js
// Generates Shopify listing copy (description, SEO, tags, collections, taxonomy)
// from a product's name/brand/category. Works with either AI provider:
//   POST { barcode, name, brand, category, provider:"openai"|"claude" }
// Keys (set in Vercel env):
//   OPENAI_API_KEY        + optional AI_OPENAI_MODEL (default gpt-4o-mini)
//   ANTHROPIC_API_KEY     + optional AI_CLAUDE_MODEL (default claude-haiku-4-5-20251001)
// Returns: { title, brand, category, descriptionHtml, seoTitle, seoDescription,
//            tags[], collections[], taxonomyCategory, attributes{}, provider }

export const config = { runtime: 'edge' };

var OPENAI_MODEL = (typeof process!=='undefined' && process.env && process.env.AI_OPENAI_MODEL) || 'gpt-4o-mini';
var CLAUDE_MODEL = (typeof process!=='undefined' && process.env && process.env.AI_CLAUDE_MODEL) || 'claude-haiku-4-5-20251001';

function buildPrompt(p){
  return 'You are writing a product listing for a UK hair & beauty shop\'s Shopify store.\n'+
    'Product name: '+(p.name||'')+'\n'+
    'Brand: '+(p.brand||'(unknown)')+'\n'+
    'Department/category: '+(p.category||'(unknown)')+'\n'+
    'Barcode: '+(p.barcode||'')+'\n\n'+
    'Return ONLY a JSON object (no markdown, no prose) with exactly these keys:\n'+
    '{\n'+
    '  "title": clean product title, proper case, no ALL CAPS,\n'+
    '  "brand": best brand name,\n'+
    '  "category": short department name,\n'+
    '  "descriptionHtml": 2-3 short paragraphs in <p>...</p> tags, benefits-led, UK English, no invented claims,\n'+
    '  "seoTitle": <=60 chars, includes brand + product,\n'+
    '  "seoDescription": <=155 chars, natural, includes key benefit,\n'+
    '  "tags": array of 5-10 lowercase tags (brand, type, hair concern, format),\n'+
    '  "collections": array of likely store collection names this belongs in (e.g. "Curl Activators", "Shampoo"),\n'+
    '  "taxonomyCategory": best Shopify standard product category path, or "",\n'+
    '  "attributes": object of simple facts you are confident about (e.g. {"size":"340g","form":"cream"})\n'+
    '}\n'+
    'If unsure about a value, use a sensible default or empty string/array. Never fabricate specific medical claims.';
}

function extractJson(txt){
  if(!txt) return null;
  var s=(''+txt).trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  try{ return JSON.parse(s); }catch(e){}
  var a=s.indexOf('{'), b=s.lastIndexOf('}');
  if(a>=0&&b>a){ try{ return JSON.parse(s.slice(a,b+1)); }catch(e){} }
  return null;
}

async function callOpenAI(prompt){
  var key=(typeof process!=='undefined'&&process.env)?process.env.OPENAI_API_KEY:null;
  if(!key) return {error:'OpenAI key not set on the server (OPENAI_API_KEY).'};
  var r=await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
    body:JSON.stringify({model:OPENAI_MODEL,temperature:0.4,response_format:{type:'json_object'},
      messages:[{role:'system',content:'You output only valid JSON.'},{role:'user',content:prompt}]})
  });
  var d=await r.json().catch(function(){return null;});
  if(!r.ok){ var m=(d&&d.error&&d.error.message)||('OpenAI HTTP '+r.status); return {error:m}; }
  var txt=d&&d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content;
  var j=extractJson(txt);
  return j||{error:'OpenAI returned no parseable JSON.'};
}

async function callClaude(prompt){
  var key=(typeof process!=='undefined'&&process.env)?process.env.ANTHROPIC_API_KEY:null;
  if(!key) return {error:'Claude key not set on the server (ANTHROPIC_API_KEY).'};
  var r=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model:CLAUDE_MODEL,max_tokens:1200,temperature:0.4,
      system:'You output only valid JSON, no markdown fences, no prose.',
      messages:[{role:'user',content:prompt}]})
  });
  var d=await r.json().catch(function(){return null;});
  if(!r.ok){ var m=(d&&d.error&&d.error.message)||('Claude HTTP '+r.status); return {error:m}; }
  var txt=d&&d.content&&d.content[0]&&d.content[0].text;
  var j=extractJson(txt);
  return j||{error:'Claude returned no parseable JSON.'};
}

export default async function handler(req){
  var cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json'};
  if(req.method==='OPTIONS')return new Response(null,{status:200,headers:cors});
  if(req.method!=='POST')return new Response(JSON.stringify({error:'POST only'}),{status:405,headers:cors});
  var p={}; try{ p=await req.json(); }catch(e){}
  if(!p.name&&!p.barcode)return new Response(JSON.stringify({error:'name or barcode required'}),{status:400,headers:cors});
  var provider=(p.provider==='claude')?'claude':'openai';
  var prompt=buildPrompt(p);
  var out = provider==='claude' ? await callClaude(prompt) : await callOpenAI(prompt);
  if(out&&out.error)return new Response(JSON.stringify({error:out.error,provider:provider}),{status:200,headers:cors});
  // normalise shape
  var res={
    title:out.title||p.name||'',
    brand:out.brand||p.brand||'',
    category:out.category||p.category||'',
    descriptionHtml:out.descriptionHtml||out.description||'',
    seoTitle:out.seoTitle||'',
    seoDescription:out.seoDescription||'',
    tags:Array.isArray(out.tags)?out.tags:[],
    collections:Array.isArray(out.collections)?out.collections:[],
    taxonomyCategory:out.taxonomyCategory||'',
    attributes:(out.attributes&&typeof out.attributes==='object')?out.attributes:{},
    provider:provider
  };
  return new Response(JSON.stringify(res),{status:200,headers:cors});
}
