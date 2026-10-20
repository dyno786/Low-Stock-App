import test from 'node:test';
import assert from 'node:assert/strict';
import team from '../api/team.js';
import ticks from '../api/ticks.js';
import { londonDay, londonMinutes } from '../lib/team-store.js';
import { allocate } from '../lib/allocation.js';

const realFetch=globalThis.fetch;
const data=new Map(),expiry=new Map();
process.env.KV_REST_API_URL='https://attendance-test.invalid';
process.env.KV_REST_API_TOKEN='test-only';
process.env.ATTENDANCE_MANAGER_PASSWORD='fixture-password-for-tests-only';
let breakStorage=false;
globalThis.fetch=async(url,opts)=>{
 if(String(url)!==process.env.KV_REST_API_URL)return realFetch(url,opts);
 if(breakStorage)return Response.json({error:'test outage'},{status:503});
 const [cmd,...args]=JSON.parse(opts.body);const key=args[0];
 for(const [k,t] of expiry)if(t<=Date.now()){data.delete(k);expiry.delete(k);}
 let result;
 if(cmd==='PING')result='PONG';
 else if(cmd==='GET')result=data.get(key)??null;
 else if(cmd==='SET'){if(args.includes('NX')&&data.has(key))result=null;else{data.set(key,args[1]);const ix=args.indexOf('EX');if(ix>=0)expiry.set(key,Date.now()+Number(args[ix+1])*1000);else expiry.delete(key);result='OK';}}
 else if(cmd==='INCR'){result=Number(data.get(key)||0)+1;data.set(key,result);}
 else if(cmd==='EXPIRE'){expiry.set(key,Date.now()+args[1]*1000);result=1;}
 else if(cmd==='DEL'){result=data.delete(key)?1:0;}
 else if(cmd==='MGET')result=args.map(k=>data.get(k)??null);
 else if(cmd==='EVAL'){const [,k,prior,next]=args.slice(1);if(data.get(k)===prior){data.set(k,next);result=1;}else result=0;}
 else throw new Error('Unexpected Redis command '+cmd);
 return Response.json({result});
};
async function call(action,body,cookies='',query={},handler=team){const url=new URL('https://app.test/api/'+(handler===ticks?'ticks':'team'));for(const[k,v]of Object.entries({action,...query}))url.searchParams.set(k,v);const req=new Request(url,{method:body===undefined?'GET':'POST',headers:{host:'app.test',origin:'https://app.test','x-real-ip':'fixture','content-type':'application/json',cookie:cookies},...(body===undefined?{}:{body:JSON.stringify({action,...body})})});const r=await handler(req);return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}

// These are integration checks over the real request handlers and storage commands;
// the in-memory Redis transport is isolated from the live store.
test('UK dates and shift minutes handle midnight and both DST boundaries',()=>{
 assert.equal(londonDay(Date.parse('2026-10-17T23:30:00Z')),'2026-10-18');
 assert.equal(londonDay(Date.parse('2026-10-25T23:30:00Z')),'2026-10-25');
 assert.equal(londonMinutes(Date.parse('2026-03-29T08:00:00Z')),540);
 assert.equal(londonMinutes(Date.parse('2026-10-25T09:00:00Z')),540);
});

test('complete manager → kiosk → QR → arrival → training → allocation → progress story',async()=>{
 assert.equal((await call('dashboard')).status,401);
 assert.equal((await call('qr',undefined,'',{branch:0})).status,200);
 assert.equal((await call('manager-login',{password:'wrong'})).status,401);
 const manager=await call('manager-login',{password:process.env.ATTENDANCE_MANAGER_PASSWORD});assert.equal(manager.status,200);const mc=manager.cookie;
 const senior=await call('staff-save',{branch:0,name:'Senior colleague',pin:'1234',shiftStart:'23:59',seniority:'senior'},mc);assert.equal(senior.status,200,JSON.stringify(senior.body));
 const beginner=await call('staff-save',{branch:0,name:'New colleague',pin:'5678',shiftStart:'23:59',seniority:'new'},mc);assert.equal(beginner.status,200);
 const sid=senior.body.id,nid=beginner.body.id;
 const paired=await call('pair',{branch:0},mc);assert.equal(paired.status,200);const kc=paired.cookie;
 assert.equal((await call('qr',undefined,kc,{branch:1})).status,200);
 const qr=await call('qr',undefined,kc,{branch:0});assert.equal(qr.status,200);const token=qr.body.token;
 assert.equal((await call('scan',{branch:0,token:'f'.repeat(64)})).status,401);
 const scan=await call('scan',{branch:0,token});assert.equal(scan.body.staff.length,2);assert.ok(!JSON.stringify(scan.body).includes('hash'));
 assert.equal((await call('checkin',{branch:0,token,staff:sid,pin:'9999'})).status,401);
 const signed=await call('checkin',{branch:0,token,staff:sid,pin:'1234'});assert.equal(signed.status,200,JSON.stringify(signed.body));const sc=signed.cookie;const at=signed.body.arrival.at;
 const repeated=await call('checkin',{branch:0,token,staff:sid,pin:'1234'});assert.equal(repeated.body.arrival.at,at,'duplicate scan preserves first arrival');
 const pre=await call('me',undefined,sc);assert.equal(pre.body.needsTrainingReview,true);assert.equal(pre.body.tasks.length,0);
 const allSkills=Object.fromEntries(['till','pick','neg','over','low','shop','img'].map(k=>[k,'trained']));
 assert.equal((await call('training-save',{skills:allSkills},sc)).status,200);
 const my=await call('me',undefined,sc);assert.equal(my.body.till,true);assert.equal(my.body.needsTrainingReview,false);assert.ok(my.body.tasks.some(t=>t.category==='shop'));
 const newsign=await call('checkin',{branch:0,token,staff:nid,pin:'5678'});const nc=newsign.cookie;
 const newSkills={...allSkills,till:'untrained',shop:'learning',neg:'untrained',img:'untrained'};
 assert.equal((await call('training-save',{skills:newSkills},nc)).status,200);
 const board=await call('dashboard',undefined,mc);const b=board.body.branches[0];assert.equal(b.day.till,sid);assert.equal(b.day.tasks.filter(t=>t.category==='till'&&!t.archived).length,1);
 assert.ok(b.day.tasks.filter(t=>t.assignee===nid).every(t=>['pick','over','low'].includes(t.category)));
 assert.ok(!JSON.stringify(board.body).includes('legacyHash'));assert.ok(!JSON.stringify(board.body).includes('"salt"'));
 assert.equal((await call('task-save',{branch:0,title:'Learn images',assignee:nid,category:'img',priority:'normal'},mc)).status,400,'untrained work needs supervision');
 // Till colleague may supervise only a configured quiet-period duty.
 assert.equal((await call('task-save',{branch:0,title:'Learn Shopify',assignee:nid,category:'shop',priority:'normal',trainingBuddy:sid},mc)).status,200);
 const task=(await call('me',undefined,nc)).body.tasks.find(t=>t.category==='pick');assert.ok(task);
 assert.equal((await call('task-status',{id:task.id,status:'done'},sc)).status,404,'staff cannot complete someone else’s task');
 assert.equal((await call('task-status',{id:task.id,status:'progress'},nc)).status,200);
 assert.equal((await call('allocate',{branch:0},mc)).status,200);
 assert.equal((await call('me',undefined,nc)).body.tasks.find(t=>t.id===task.id).status,'progress');
 assert.equal((await call('task-status',{id:task.id,status:'done'},nc)).status,200);
 assert.equal((await call('task-archive',{branch:0,id:'auto-till'},mc)).status,400);
 assert.equal((await call('set-till',{branch:0,staff:nid},mc)).status,400);
 assert.equal((await call('rotate',{branch:0},kc)).status,401,'kiosk cannot rotate without manager');
 assert.equal((await call('rotate',{branch:0},mc)).status,200);
 assert.equal((await call('scan',{branch:0,token})).status,401,'old token invalid immediately');
 assert.equal((await call('me',undefined,nc)).status,200,'rotation does not terminate an existing shift');
 // Database outage must never return a successful attendance write.
 breakStorage=true;const outage=await call('task-status',{id:task.id,status:'pending'},nc);breakStorage=false;assert.equal(outage.status,503);
 assert.equal((await call('checkout',{},nc)).status,400);const outqr=await call('qr',undefined,kc,{branch:0});assert.equal((await call('checkin',{branch:0,token:outqr.body.token,staff:nid,pin:'5678',mode:'out'})).status,200);assert.equal((await call('me',undefined,nc)).status,401);
 assert.equal((await call('logout',{},sc)).status,200);assert.equal((await call('me',undefined,sc)).status,401);
 assert.equal((await call('manager-logout',{},mc)).status,200);assert.equal((await call('dashboard',undefined,mc)).status,401);
});

test('generic tick endpoints cannot expose old attendance or delete via GET',async()=>{
 assert.equal((await call('',undefined,'',{key:'cc_team0'},ticks)).status,400);
 assert.equal((await call('',undefined,'',{del:'cc_pk_ticks'},ticks)).status,405);
 assert.equal((await call('',{key:'cc_team0',value:{}},'',{},ticks)).status,401);
 assert.equal((await call('',undefined,'',{key:'cc_pk_timing'},ticks)).status,401);
});

test('daily tokens expire by UK date, not by a device-provided timestamp',async()=>{
 const m=await call('manager-login',{password:process.env.ATTENDANCE_MANAGER_PASSWORD});const k=await call('pair',{branch:2},m.cookie);const q=await call('qr',undefined,k.cookie,{branch:2});
 const realNow=Date.now;Date.now=()=>realNow()+86400000;
 try{assert.equal((await call('scan',{branch:2,token:q.body.token})).status,401);const next=await call('qr',undefined,k.cookie,{branch:2});assert.equal(next.status,200);assert.notEqual(next.body.token,q.body.token);}
 finally{Date.now=realNow;}
});

test('parallel arrivals retain both employees; legacy history migrates without public hashes',async()=>{
 data.delete('attendance:v2:branch:1');
 data.set('cc_team1',JSON.stringify({staff:{alice:{name:'Alice',hash:'legacy',removed:false}},days:{'2026-10-01':{signins:{alice:{name:'Alice',ts:1790841600000}}}}}));
 const m=await call('manager-login',{password:process.env.ATTENDANCE_MANAGER_PASSWORD});const board=await call('dashboard',undefined,m.cookie);assert.ok(board.body.branches[1].staff.some(s=>s.name==='Alice'));
 const people=await Promise.all(['One','Two'].map(async name=>{const r=await call('staff-save',{branch:3,name,pin:'7777',shiftStart:'09:00',seniority:'experienced'},m.cookie);assert.equal(r.status,200);return r.body.id;}));
 const q=await call('qr',undefined,m.cookie,{branch:3});
 const arrivals=await Promise.all(people.map(staff=>call('checkin',{branch:3,token:q.body.token,staff,pin:'7777'})));assert.deepEqual(arrivals.map(a=>a.status),[200,200]);
 const final=await call('dashboard',undefined,m.cookie);assert.equal(Object.keys(final.body.branches[3].day.arrivals).length,2);
});

test('manager-confirmed skills override staff reports; till gaps stay explicit',()=>{
 const state={staff:{a:{name:'A',active:true,trainingUpdatedAt:1,skills:{till:'trained',pick:'trained'},confirmedSkills:{till:'untrained'},seniority:'senior'}},days:{},config:{enabled:['pick'],tillDuties:[],tillRequired:true}};
 const date=londonDay();state.days[date]={arrivals:{a:{at:Date.now(),trainingDate:date}},tasks:[]};const d=allocate(state,0);assert.equal(d.till,'');assert.ok(d.gaps.some(g=>g.job==='till'));assert.equal(d.tasks.find(t=>t.category==='pick').assignee,'a');
});


test('QR changes each minute; a valid scan allows 90 seconds for PIN entry and cannot be replayed',async()=>{
 const manager=await call('manager-login',{password:process.env.ATTENDANCE_MANAGER_PASSWORD});
 const q=await call('qr',undefined,manager.cookie,{branch:3});
 const ticket=await call('scan',{branch:3,token:q.body.token});assert.equal(ticket.status,200);
 const board=await call('dashboard',undefined,manager.cookie);const person=board.body.branches[3].staff.find(s=>s.name==='One');
 const original=Date.now;const now=original();Date.now=()=>q.body.expiresAt+1000;
 try{
  assert.equal((await call('scan',{branch:3,token:q.body.token})).status,401,'captured QR is invalid after its minute');
  const next=await call('qr',undefined,manager.cookie,{branch:3});assert.notEqual(next.body.token,q.body.token);
  const completed=await call('checkin',{branch:3,ticket:ticket.body.ticket,staff:person.id,pin:'7777'});assert.equal(completed.status,200,'already-scanned PIN form survives minute change');
  assert.equal((await call('checkin',{branch:3,ticket:ticket.body.ticket,staff:person.id,pin:'7777'})).status,401,'scan ticket is single-use');
  const waiting=await call('scan',{branch:3,token:next.body.token});
  Date.now=()=>q.body.expiresAt+93000;
  assert.equal((await call('checkin',{branch:3,ticket:waiting.body.ticket,staff:person.id,pin:'7777'})).status,401,'PIN form expires after 90 seconds');
 }finally{Date.now=original;}
});

test('task timing pauses at clock-out and returning staff retain separate attendance spans',async()=>{
 const m=await call('manager-login',{password:process.env.ATTENDANCE_MANAGER_PASSWORD});
 const q=await call('qr',undefined,m.cookie,{branch:3});
 const board=await call('dashboard',undefined,m.cookie);const p=board.body.branches[3].staff.find(s=>s.name==='Two');
 const login=await call('checkin',{branch:3,token:q.body.token,staff:p.id,pin:'7777'});const sc=login.cookie;
 const skills=Object.fromEntries(['till','pick','neg','over','low','shop','img'].map(k=>[k,'trained']));await call('training-save',{skills},sc);
 const work=await call('task-save',{branch:3,title:'Timed manual job',category:'custom',priority:'normal',assignee:p.id},m.cookie);assert.equal(work.status,200);
 await call('task-status',{id:work.body.id,status:'progress'},sc);
 const original=Date.now;const now=original();Date.now=()=>now+120000;
 try{
  const current=await call('qr',undefined,m.cookie,{branch:3});const out=await call('checkin',{branch:3,token:current.body.token,staff:p.id,pin:'7777',mode:'out'});assert.equal(out.status,200);
  const after=await call('dashboard',undefined,m.cookie);const task=after.body.branches[3].day.tasks.find(t=>t.id===work.body.id);assert.equal(task.status,'pending');assert.ok(task.workMs>=119000);assert.equal(task.runningSince,undefined);assert.equal(task.workSegments[0].staff,p.id);
  Date.now=()=>now+180000;const fresh=await call('qr',undefined,m.cookie,{branch:3});const back=await call('checkin',{branch:3,token:fresh.body.token,staff:p.id,pin:'7777'});assert.equal(back.status,200);assert.equal(back.body.arrival.sessions.length,2);assert.ok(back.body.arrival.sessions[0].out);assert.equal(back.body.arrival.sessions[1].out,undefined);
 }finally{Date.now=original;}
});

test('health confirms storage without exposing records',async()=>{const h=await call('health');assert.equal(h.status,200);assert.equal(h.body.storage,'connected');breakStorage=true;try{assert.equal((await call('health')).status,503);}finally{breakStorage=false;}});

test('public QR roster excludes private data; manager-only branch location checks gate and tag attendance',async()=>{
 const m=await call('manager-login',{password:process.env.ATTENDANCE_MANAGER_PASSWORD});
 const location={latitude:53.8,longitude:-1.55,radius:150,required:true};
 assert.equal((await call('location-configure',{branch:1,location})).status,401);
 assert.equal((await call('location-configure',{branch:1,location:{...location,latitude:100}},m.cookie)).status,400);
 assert.equal((await call('location-configure',{branch:1,location},m.cookie)).status,200);
 const person=await call('staff-save',{branch:1,name:'Location test',pin:'9876',shiftStart:'09:00',seniority:'new'},m.cookie);
 const q=await call('qr',undefined,'',{branch:1});assert.equal(q.status,200);assert.equal(q.body.roster[0].status,'Not signed in');
 const scan=await call('scan',{branch:1,token:q.body.token});assert.equal(scan.body.locationRequired,true);
 const payload={branch:1,ticket:scan.body.ticket,staff:person.body.id,pin:'9876'};
 assert.equal((await call('checkin',payload)).status,400,'required missing location rejected');
 assert.equal((await call('checkin',{...payload,location:{status:'denied'}})).status,400);
 const fix={latitude:53.8,longitude:-1.55,accuracy:15,timestamp:Date.now()};
 assert.equal((await call('checkin',{...payload,location:{...fix,latitude:53.9}})).status,400,'outside branch rejected');
 assert.equal((await call('checkin',{...payload,location:{...fix,accuracy:500}})).status,400,'poor accuracy rejected');
 assert.equal((await call('checkin',{...payload,location:{...fix,timestamp:Date.now()-120000}})).status,400,'stale tag rejected');
 const entered=await call('checkin',{...payload,location:fix});assert.equal(entered.status,200,JSON.stringify(entered.body));assert.equal(entered.body.arrival.location.status,'near');assert.equal(entered.body.arrival.location.branch,1);
 const roster=await call('qr',undefined,'',{branch:1});assert.equal(roster.body.roster.find(s=>s.name==='Location test').status,'Clocked in');assert.deepEqual(Object.keys(roster.body.roster.find(s=>s.name==='Location test')).sort(),['at','name','outAt','status']);assert.ok(!JSON.stringify(roster.body).includes('latitude'));
 const out=await call('checkin',{branch:1,token:q.body.token,staff:person.body.id,pin:'9876',mode:'out',location:{...fix,timestamp:Date.now()}});assert.equal(out.status,200);assert.deepEqual(out.body.arrival.locationEvents.map(g=>g.mode),['in','out']);
 // Disabling enforcement must visibly flag an outside fix, never label it near.
 await call('location-configure',{branch:1,location:{...location,required:false}},m.cookie);
 const back=await call('checkin',{branch:1,token:q.body.token,staff:person.body.id,pin:'9876',location:{...fix,latitude:53.9,timestamp:Date.now()}});assert.equal(back.status,200);assert.equal(back.body.arrival.location.status,'outside');
 const board=await call('dashboard',undefined,m.cookie);const b=board.body.branches[1];assert.equal(b.location.latitude,53.8);assert.equal(b.day.arrivals[person.body.id].locationEvents.length,3);
});

test('location tags distinguish missing, uncertain and unconfigured positions',async()=>{
 const {checkLocation}=await import('../lib/location.js');const now=Date.now();const fix={latitude:53.8,longitude:-1.55,accuracy:10,timestamp:now};
 assert.equal(checkLocation(fix,null,0,now).status,'unconfigured');
 assert.equal(checkLocation({status:'denied'},null,0,now).status,'denied');
 assert.equal(checkLocation({...fix,latitude:'53.8'},null,0,now).status,'unavailable');
 assert.equal(checkLocation({...fix,timestamp:now+120000},null,0,now).status,'unavailable');
 assert.equal(checkLocation({...fix,accuracy:101},{...fix,radius:150,required:false},0,now).status,'inaccurate');
});
