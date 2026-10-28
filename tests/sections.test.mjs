import test from 'node:test';
import assert from 'node:assert/strict';
const data=new Map();
process.env.KV_REST_API_URL='https://sections-test.invalid';process.env.KV_REST_API_TOKEN='t';process.env.ATTENDANCE_MANAGER_PASSWORD='pw';process.env.BLOB_READ_WRITE_TOKEN='b';
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{const u=String(url);
 if(u.startsWith('https://blob.vercel-storage.com/'))return Response.json({url:'https://x.public.blob.vercel-storage.com/'+u.slice(32)});
 if(u!==process.env.KV_REST_API_URL)return realFetch(url,opts);
 const [cmd,...a]=JSON.parse(opts.body);let r=null;
 if(cmd==='PING')r='PONG';else if(cmd==='GET')r=data.get(a[0])??null;else if(cmd==='MGET')r=a.map(k=>data.get(k)??null);else if(cmd==='SET'){if(a.includes('NX')&&data.has(a[0]))r=null;else{data.set(a[0],a[1]);r='OK';}}else if(cmd==='DEL'){r=data.delete(a[0])?1:0;}else if(cmd==='INCR'){r=(+data.get(a[0])||0)+1;data.set(a[0],String(r));}else if(cmd==='EXPIRE')r=1;else if(cmd==='EVAL'){const [,,key,old,nw]=a;if((data.get(key)??null)===old){data.set(key,nw);r=1;}else r=0;}
 return Response.json({result:r});};
const team=(await import('../api/team.js')).default;const photo=(await import('../api/photo.js')).default;
const H={host:'app.test',origin:'https://app.test','x-real-ip':'s1'};
async function call(action,body,cookie='',query={}){const u=new URL('https://app.test/api/team');for(const [k,v] of Object.entries({action,...query}))u.searchParams.set(k,v);const r=await team(new Request(u,{method:body===undefined?'GET':'POST',headers:{...H,'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify({action,...body})}));return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}

test('City Centre sections: owners, checklist jobs, photo rule, overrides',async()=>{
 const mc=(await call('manager-login',{password:'pw'})).cookie;
 const ids={};for(const [n,sen] of [['Ana','senior'],['Ben','experienced'],['Cat','experienced']])ids[n]=(await call('staff-save',{branch:1,name:n,pin:'1234',shiftStart:'09:00',seniority:sen},mc)).body.id;
 assert.equal((await call('sections-template',{branch:1})).status,401,'manager only');
 assert.equal((await call('sections-template',{branch:1},mc)).status,200);
 assert.equal((await call('sections-template',{branch:1},mc)).status,400,'no accidental overwrite');
 const dash0=(await call('dashboard',undefined,mc)).body.branches[1];assert.equal(dash0.sections.list.length,7);
 // default owner for oils = Cat
 const S=dash0.sections;S.list.find(s=>s.id==='oils').defaultOwner=ids.Cat;S.list.find(s=>s.id==='picco').defaultOwner=ids.Ana;assert.equal((await call('sections-save',{branch:1,sections:S},mc)).status,200);
 const kc=(await call('pair',{branch:1},mc)).cookie;const skills={};for(const s of (await call('status')).body.skills)skills[s.id]='trained';
 const cookies={};for(const n of ['Ana','Ben','Cat']){const q=(await call('qr',undefined,kc,{branch:1})).body.token;const r=await call('checkin',{branch:1,token:q,staff:ids[n],pin:'1234'});assert.equal(r.status,200,JSON.stringify(r.body));cookies[n]=r.cookie;await call('training-save',{skills},cookies[n]);}
 const day=(await call('dashboard',undefined,mc)).body.branches[1].day;
 assert.equal(day.sectionOwners.till,day.till,'till section follows till cover');
 assert.equal(day.sectionOwners.oils,ids.Cat,'default owner used');
 const other=[ids.Ana,ids.Ben].find(id=>id!==day.till);assert.equal(day.sectionOwners.dyes,other,'next person fills the first open section');
 assert.ok(day.gaps.some(g=>g.job==='section'&&g.section==='synthetic'),'unfilled section reported as a gap');
 assert.equal(day.sectionOwners.picco,ids.Ana,'fixed duty always goes to its owner');
 assert.ok(Object.entries(day.sectionOwners).some(([k,v])=>k!=='picco'&&v===ids.Ana),'duty owner still runs a section too');
 const picco=day.tasks.filter(t=>t.section==='picco');assert.equal(picco.length,2);assert.ok(picco.every(t=>t.photoRequired&&t.assignee===ids.Ana),'morning + night Picco photos');
 const cat=(await call('me',undefined,cookies.Cat)).body;
 assert.deepEqual(cat.mySections.map(s=>s.id),['oils']);
 const catChecks=cat.tasks.filter(t=>t.kind==='check');assert.equal(catChecks.length,10+7,'every-owner + oils checklist (incl. stock transfers)');assert.ok(catChecks.some(t=>t.id==='sec-oils-ot'&&t.photoRequired),'stock transfer item needs a photo');
 const photoItem=catChecks.find(t=>t.photoRequired);const plainItem=catChecks.find(t=>!t.photoRequired);
 assert.equal((await call('task-status',{id:plainItem.id,status:'done'},cookies.Cat)).status,200);
 assert.equal((await call('task-status',{id:photoItem.id,status:'done'},cookies.Cat)).status,400,'photo item needs a photo');
 const up=await photo(new Request('https://app.test/api/photo?task='+photoItem.id,{method:'POST',headers:{...H,'content-type':'image/jpeg',cookie:cookies.Cat},body:new Uint8Array(5000)}));assert.equal(up.status,200);
 assert.equal((await call('task-status',{id:photoItem.id,status:'done'},cookies.Cat)).status,200,'done once photo attached');
 // manager moves Cat to synthetic for today: oils becomes empty, done items stay with Cat
 assert.equal((await call('section-owner',{branch:1,section:'synthetic',staff:ids.Cat},mc)).status,200);
 const d2=(await call('dashboard',undefined,mc)).body.branches[1].day;assert.equal(d2.sectionOwners.synthetic,ids.Cat);
 const doneOil=d2.tasks.find(t=>t.id===plainItem.id);assert.equal(doneOil.assignee,ids.Cat,'finished work keeps its owner');
 assert.equal((await call('section-owner',{branch:1,section:'till',staff:ids.Cat},mc)).status,400,'till follows till cover');
 // validation
 assert.equal((await call('sections-save',{branch:1,sections:{list:[{id:'a',name:'A',kind:'till'},{id:'b',name:'B',kind:'till'}]}},mc)).status,400,'one till section');
 // shelf photo upload is manager-only
 assert.equal((await photo(new Request('https://app.test/api/photo?action=ref&branch=1',{method:'POST',headers:{...H,'content-type':'image/jpeg'},body:new Uint8Array(5000)}))).status,401);
 assert.equal((await photo(new Request('https://app.test/api/photo?action=ref&branch=1',{method:'POST',headers:{...H,'content-type':'image/jpeg',cookie:mc},body:new Uint8Array(5000)}))).status,200);
});
