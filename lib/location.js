import { fail } from './team-store.js';
const number = v => typeof v === 'number' && Number.isFinite(v);
export function locationConfig(value) {
  if (!value || value.latitude === '' || value.longitude === '') return null;
  const {latitude,longitude,radius,required}=value;
  if (!number(latitude)||Math.abs(latitude)>90||!number(longitude)||Math.abs(longitude)>180||!number(radius)||radius<50||radius>1000||typeof required!=='boolean') fail('Enter valid branch coordinates and a radius between 50 and 1,000 metres.');
  const label=typeof value.label==='string'?value.label.replace(/\s+/g,' ').trim().slice(0,200):'';
  return {latitude,longitude,radius,required,...(label?{label}:{})};
}
export function checkLocation(input, config, branch, at=Date.now()) {
  const base={branch,at,status:'unavailable'};
  if (!input || !number(input.latitude)||Math.abs(input.latitude)>90||!number(input.longitude)||Math.abs(input.longitude)>180||!number(input.accuracy)||input.accuracy<0||!number(input.timestamp)||Math.abs(at-input.timestamp)>60000) {
    base.status=input?.status==='denied'?'denied':'unavailable';
  } else {
    Object.assign(base,{latitude:input.latitude,longitude:input.longitude,accuracy:Math.round(input.accuracy)});
    if (!config) base.status='unconfigured';
    else {
      const rad=x=>x*Math.PI/180;
      const a=Math.sin(rad(input.latitude-config.latitude)/2)**2+Math.cos(rad(config.latitude))*Math.cos(rad(input.latitude))*Math.sin(rad(input.longitude-config.longitude)/2)**2;
      base.distance=Math.round(6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a))));
      base.radius=config.radius;
      base.status=input.accuracy>Math.min(100,config.radius)?'inaccurate':base.distance+input.accuracy<=config.radius?'near':base.distance-input.accuracy>config.radius?'outside':'inaccurate';
    }
  }
  if (config?.required && base.status!=='near') fail(base.status==='outside'?'Your phone location is outside this branch. Check the branch name and try again at the branch.':'A fresh, accurate location near this branch is required. Allow location access, move near a window and try again.');
  return base;
}

// Look up a UK postcode or an address so the manager can set the branch location without standing in the shop.
const UK_POSTCODE=/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
async function getJson(url){const r=await fetch(url,{headers:{'User-Agent':'CC-Hair-Beauty-ASIM/1.0 (branch location setup)','Accept':'application/json'},signal:AbortSignal.timeout(8000)});if(!r.ok)fail('The address lookup service is busy. Please try again in a moment.',503);return r.json();}
export async function geocode(query){
  const q=String(query||'').replace(/\s+/g,' ').trim();
  if(q.length<3||q.length>200)fail('Enter a postcode or an address to search for.');
  const results=[];
  if(UK_POSTCODE.test(q)){
    const j=await getJson('https://api.postcodes.io/postcodes/'+encodeURIComponent(q.replace(/\s+/g,'')));
    const p=j&&j.result;
    if(p&&Number.isFinite(p.latitude))results.push({label:p.postcode+' · '+[p.admin_ward,p.admin_district].filter(Boolean).join(', '),latitude:p.latitude,longitude:p.longitude,source:'postcode'});
  }
  if(!results.length){
    const j=await getJson('https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=gb&addressdetails=0&limit=6&q='+encodeURIComponent(q));
    for(const r of Array.isArray(j)?j:[]){const lat=Number(r.lat),lon=Number(r.lon);if(Number.isFinite(lat)&&Number.isFinite(lon))results.push({label:String(r.display_name||'').slice(0,200),latitude:lat,longitude:lon,source:'address'});}
  }
  if(!results.length)fail('Nothing found for "'+q+'". Try the full postcode, or the shop name with the street and city.',404);
  return results.map(r=>({...r,latitude:Math.round(r.latitude*1e6)/1e6,longitude:Math.round(r.longitude*1e6)/1e6}));
}
