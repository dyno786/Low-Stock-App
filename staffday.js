// staffday.js — staff sign-in (name + PIN), 9:00 job allocation, late takeover, manager view.
// Loaded at the end of chapeltown.html / citycenter.html / roundhay.html. Uses that page's
// DEST_ID, homeCounts(), homeGo(), renderHome(). Shared state lives in Redis key cc_team<DEST_ID>.
(function(){
'use strict';
if(typeof DEST_ID==='undefined')return;
var BID=DEST_ID, KEY='cc_team'+BID;
var BNAME=['Chapeltown','City Center','Roundhay'][BID]||'Branch';
var START_H=9, START_M=0;                 // shift start: anyone signing in after this is late
var MGR_HASH='77f1cec5dabf986e5d5aea8b199033ecaa62b0f991e27512ddf3ee3fb6c86cd7'; // same manager password as the warehouse
var JOBS={
  pick:{label:'Orders to pick',     icon:'📦',color:'#7c3aed',min:7,  view:'pick',   cnt:'pick'},
  neg: {label:'Negatives',          icon:'🔴',color:'#dc2626',min:2.5,view:'neg',    cnt:'neg'},
  over:{label:'Overstock to move',  icon:'🔄',color:'#2563eb',min:1.5,view:'over',   cnt:'over'},
  shop:{label:'Add to Shopify',     icon:'🛍',color:'#db2777',min:5,  view:'shopify',cnt:'shop'},
  img: {label:'Missing images',     icon:'📸',color:'#0891b2',min:2.5,view:'imgs',   cnt:'miss'}
};
var JOB_KEYS=['pick','neg','over','shop','img'];

// ---------- helpers ----------
function esc(x){return (''+(x==null?'':x)).replace(/[<>&"]/g,function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c];});}
function nk(n){return (''+n).trim().toLowerCase().replace(/\s+/g,' ');}
function today(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function startTs(ds){var p=(ds||today()).split('-');return new Date(+p[0],+p[1]-1,+p[2],START_H,START_M,0).getTime();}
function hm(ts){return new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}
function mins(ms){var m=Math.round(ms/60000);return m>=60?(Math.floor(m/60)+'h '+(m%60)+'m'):(m+'m');}
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
async function sha(s){var b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(function(x){return ('0'+x.toString(16)).slice(-2);}).join('');}
function pinHash(key,pin){return sha('cc-staff|'+BID+'|'+key+'|'+pin);}
function isMgr(){try{return sessionStorage.getItem('cc_wh_mgr')==='1';}catch(e){return false;}}
function counts(){try{return (typeof homeCounts==='function')?homeCounts():{};}catch(e){return {};}}
function dataReady(){try{return typeof destData!=='undefined'&&destData&&destData.length>0;}catch(e){return false;}}
function jobCount(j){var c=counts()[JOBS[j].cnt];return (c==null)?null:c;}
function jobMins(j){var c=jobCount(j)||0;return c*JOBS[j].min;}

// ---------- shared state ----------
var T={staff:{},days:{},cfg:{}};
try{var _c=JSON.parse(lsGet(KEY)||'null');if(_c&&typeof _c==='object')T=_c;}catch(e){}
norm(T);
function norm(t){t.staff=t.staff||{};t.days=t.days||{};t.cfg=t.cfg||{};return t;}
function day(ds){ds=ds||today();if(!T.days[ds])T.days[ds]={signins:{},alloc:null,allocAt:0,allocRev:0,done:{},till:''};var d=T.days[ds];d.signins=d.signins||{};d.done=d.done||{};return d;}
function mergeDay(a,b){
  if(!b)return a;if(!a)return JSON.parse(JSON.stringify(b));
  Object.keys(b.signins||{}).forEach(function(k){var x=b.signins[k],y=a.signins[k];if(!y||(x.chg||x.ts)>(y.chg||y.ts))a.signins[k]=x;});
  Object.keys(b.done||{}).forEach(function(k){if(!a.done[k])a.done[k]=b.done[k];});
  if(b.help){a.help=a.help||{};Object.keys(b.help).forEach(function(k){if(!a.help[k])a.help[k]=b.help[k];});}
  if((b.allocRev||0)>(a.allocRev||0)||((b.allocRev||0)===(a.allocRev||0)&&b.allocAt&&(!a.allocAt||b.allocAt<a.allocAt))){a.alloc=b.alloc;a.allocAt=b.allocAt;a.allocRev=b.allocRev;a.till=b.till;}
  return a;
}
function mergeAll(remote){
  if(!remote||typeof remote!=='object')return false;norm(remote);
  var before=JSON.stringify(T);
  Object.keys(remote.staff).forEach(function(k){var r=remote.staff[k],l=T.staff[k];if(!l||(r.ts||0)>(l.ts||0))T.staff[k]=r;});
  Object.keys(remote.days).forEach(function(ds){T.days[ds]=mergeDay(T.days[ds],remote.days[ds]);});
  if((remote.cfg.ts||0)>(T.cfg.ts||0))T.cfg=remote.cfg;
  return JSON.stringify(T)!==before;
}
function prune(){var cut=Date.now()-45*86400000;Object.keys(T.days).forEach(function(ds){if(startTs(ds)<cut)delete T.days[ds];});}
function saveLocal(){lsSet(KEY,JSON.stringify(T));}
var pushT=null;
function push(){saveLocal();clearTimeout(pushT);pushT=setTimeout(async function(){
  // read-merge-write so two phones never wipe each other's sign-ins
  try{var r=await fetch('/api/ticks?key='+KEY,{cache:'no-store'});var j=await r.json();if(j&&j.data)mergeAll(j.data);}catch(e){}
  prune();saveLocal();
  try{await fetch('/api/ticks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:KEY,value:T})});}catch(e){}
},300);}
async function pull(){try{var r=await fetch('/api/ticks?key='+KEY,{cache:'no-store'});var j=await r.json();if(j&&j.data&&mergeAll(j.data)){saveLocal();return true;}}catch(e){}return false;}

// ---------- who is on this phone ----------
function me(){try{var m=JSON.parse(lsGet('cc_team_me'+BID)||'null');if(m&&m.date===today()&&T.staff[m.key]){var s=day().signins[m.key];if(s&&!s.out)return m.key;}}catch(e){}return '';}
function setMe(k){lsSet('cc_team_me'+BID,JSON.stringify({date:today(),key:k}));}
function clearMe(){lsSet('cc_team_me'+BID,'');}
function staffName(k){return (T.staff[k]&&T.staff[k].name)||k;}
function onShift(d){d=d||day();return Object.keys(d.signins).filter(function(k){return !d.signins[k].out;}).sort(function(a,b){return d.signins[a].ts-d.signins[b].ts;});}
function lateBy(s,ds){var st=startTs(ds);return s.ts>st?(s.ts-st):0;}

// ---------- allocation ----------
function tillTask(){return BID===1?{label:'Till + add new deliveries online',icon:'🧾',sub:'Take 1 pc from each delivery and add it online in CC Scan Station'}:{label:'Till',icon:'🧾',sub:'Serve customers. Help with jobs only when it is quiet.'};}
function allocate(force){
  var d=day();if(d.alloc&&!force)return false;if(!dataReady())return false;
  var ppl=onShift(d);if(!ppl.length)return false;
  var till=ppl[0], workers=ppl.length>1?ppl.slice(1):[ppl[0]];
  var alloc={};ppl.forEach(function(k){alloc[k]=[];});
  var load={};workers.forEach(function(k){load[k]=0;});
  var jobs=JOB_KEYS.filter(function(j){return (jobCount(j)||0)>0;});
  if(!jobs.length)jobs=['img','shop'];
  jobs.sort(function(a,b){return jobMins(b)-jobMins(a);});
  jobs.forEach(function(j){var best=workers[0];workers.forEach(function(k){if(load[k]<load[best])best=k;});alloc[best].push(j);load[best]+=jobMins(j)||10;});
  d.alloc=alloc;d.till=till;d.allocAt=Date.now();d.allocRev=(d.allocRev||0)+1;
  push();return true;
}
function unfinished(d,k){return (d.alloc&&d.alloc[k]||[]).filter(function(j){return !d.done[k+'|'+j];});}
function loadOf(d,x){return unfinished(d,x).reduce(function(a,j){return a+(jobMins(j)||10);},0);}
function giveLate(k){
  var d=day();if(!d.alloc||d.alloc[k])return;
  d.alloc[k]=[];
  var donors=onShift(d).filter(function(x){return x!==k&&d.alloc[x];});
  // take one whole unfinished job from the busiest person who has 2 or more left: the one closest to half their remaining work
  var best=null,bl=-1;donors.forEach(function(x){if(unfinished(d,x).length>=2){var l=loadOf(d,x);if(l>bl){bl=l;best=x;}}});
  if(best){var u=unfinished(d,best),half=bl/2,pickJ=u[0],diff=1e18;u.forEach(function(j){var df=Math.abs((jobMins(j)||10)-half);if(df<diff){diff=df;pickJ=j;}});
    d.alloc[best]=d.alloc[best].filter(function(x){return x!==pickJ;});d.alloc[k].push(pickJ);}
  else{ // nobody has two jobs left: help whoever has the most work on their one job
    var b2=null,l2=0;donors.forEach(function(x){var l=loadOf(d,x);if(l>l2){l2=l;b2=x;}});
    if(b2){var j2=unfinished(d,b2)[0];d.alloc[k].push(j2);d.help=d.help||{};d.help[k+'|'+j2]=b2;}
    else d.alloc[k].push('img');
  }
  d.allocRev=(d.allocRev||0)+1;
}

// ---------- UI: styles ----------
var css=document.createElement('style');
css.textContent='#sd-lock{position:fixed;inset:0;z-index:9000;background:var(--bg,#f6f5fa);overflow:auto;font-family:var(--font,system-ui,sans-serif)}'+
'.sd-box{max-width:440px;margin:0 auto;padding:26px 18px 40px}'+
'.sd-inp{width:100%;padding:13px;border:1.5px solid var(--border,#ddd);border-radius:11px;font-size:17px;box-sizing:border-box;font-family:inherit;background:#fff}'+
'.sd-btn{display:block;width:100%;border:none;border-radius:12px;padding:15px;font-size:16px;font-weight:800;cursor:pointer;font-family:inherit;margin-top:10px;background:#6d28d9;color:#fff}'+
'.sd-btn2{display:block;width:100%;border:1.5px solid var(--border,#ddd);border-radius:12px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:8px;background:#fff;color:#111}'+
'.sd-name{display:inline-block;border:1.5px solid var(--border,#ddd);background:#fff;border-radius:999px;padding:10px 15px;margin:4px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}'+
'.sd-name.on{border-color:#6d28d9;background:#6d28d9;color:#fff}'+
'#sd-bar{position:sticky;top:0;z-index:800;background:#f5f3ff;border-bottom:1px solid #ddd6fe;padding:8px 12px;display:flex;align-items:center;gap:8px;font-family:var(--font,system-ui,sans-serif);font-size:13px}'+
'#sd-sheet{position:fixed;inset:0;z-index:9100;background:rgba(20,18,30,.45);display:flex;align-items:flex-end;justify-content:center;font-family:var(--font,system-ui,sans-serif)}'+
'.sd-panel{background:#fff;width:100%;max-width:520px;max-height:88vh;overflow:auto;border-radius:18px 18px 0 0;padding:16px 16px 26px;box-sizing:border-box}'+
'.sd-h{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:17px;margin-bottom:10px}'+
'.sd-x{border:none;background:#f1f1f4;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:15px}'+
'.sd-job{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--border,#e5e7eb);border-radius:12px;margin-bottom:8px;background:#fff}'+
'.sd-sec{font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;margin:16px 0 6px}'+
'.sd-small{font-size:12px;color:#6b7280}';
document.head.appendChild(css);

function sheet(html){closeSheet();var m=document.createElement('div');m.id='sd-sheet';m.innerHTML='<div class="sd-panel">'+html+'</div>';document.body.appendChild(m);m.addEventListener('click',function(e){if(e.target===m)closeSheet();});return m;}
function closeSheet(){var m=document.getElementById('sd-sheet');if(m)m.parentNode.removeChild(m);}

// ---------- lock screen / sign in ----------
var pickKey='';
function renderLock(){
  var lk=document.getElementById('sd-lock');
  if(me()||isMgr()||!hasStaff()){if(lk)lk.parentNode.removeChild(lk);return;}
  var typed=lk&&document.getElementById('sd-pin')?document.getElementById('sd-pin').value:'';
  var sig=Object.keys(T.staff).sort().join(',')+'|'+pickKey;
  if(lk&&lk.getAttribute('data-sig')===sig)return;
  if(!lk){lk=document.createElement('div');lk.id='sd-lock';document.body.appendChild(lk);}
  lk.setAttribute('data-sig',sig);
  var names=Object.keys(T.staff).filter(function(k){return !T.staff[k].removed;}).sort(function(a,b){return staffName(a).localeCompare(staffName(b));});
  var now=Date.now(),late=now>startTs();
  lk.innerHTML='<div class="sd-box" style="text-align:center">'+
    '<div style="font-size:40px">👋</div><div style="font-weight:900;font-size:21px;margin:4px 0">'+esc(BNAME)+' — sign in</div>'+
    '<div class="sd-small" style="margin-bottom:16px;font-size:13px">'+(late?'<b style="color:#dc2626">It is after '+('0'+START_H).slice(-2)+':'+('0'+START_M).slice(-2)+' — your sign-in will show as late.</b>':'Sign in when you arrive. Everyone gets their job list at '+('0'+START_H).slice(-2)+':'+('0'+START_M).slice(-2)+'.')+'</div>'+
    (names.length?'<div style="margin-bottom:12px">'+names.map(function(k){return '<button class="sd-name'+(pickKey===k?' on':'')+'" data-k="'+esc(k)+'">'+esc(staffName(k))+'</button>';}).join('')+'</div>'+
      (pickKey?'<input id="sd-pin" class="sd-inp" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="Your PIN" style="text-align:center;letter-spacing:6px">'+
      '<div id="sd-err" style="color:#dc2626;font-weight:700;font-size:13px;min-height:18px;margin-top:6px"></div>'+
      '<button class="sd-btn" id="sd-go">Sign in as '+esc(staffName(pickKey))+'</button>':'<div class="sd-small">Tap your name</div>')
    :'<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px;font-size:14px;color:#9a3412">No staff set up for this branch yet. The manager needs to add staff names and PINs.</div>')+
    '<button id="sd-mgr" style="margin-top:34px;border:none;background:none;color:#6b7280;font-size:13px;font-weight:700;text-decoration:underline;cursor:pointer">🔒 Manager login</button>'+
  '</div>';
  lk.querySelectorAll('.sd-name').forEach(function(b){b.addEventListener('click',function(){pickKey=this.getAttribute('data-k');renderLock();var p=document.getElementById('sd-pin');if(p)p.focus();});});
  var pin=document.getElementById('sd-pin');if(pin){pin.value=typed;pin.addEventListener('keydown',function(e){if(e.key==='Enter')signIn();});}
  var go=document.getElementById('sd-go');if(go)go.addEventListener('click',signIn);
  document.getElementById('sd-mgr').addEventListener('click',mgrLogin);
}
async function signIn(){
  var pin=document.getElementById('sd-pin'),err=document.getElementById('sd-err');if(!pin||!pickKey)return;
  var s=T.staff[pickKey];if(!s)return;
  var h=await pinHash(pickKey,pin.value.trim());
  if(h!==s.hash){err.textContent='Wrong PIN';pin.value='';pin.focus();return;}
  var d=day(),ex=d.signins[pickKey],now=Date.now();
  if(!ex)d.signins[pickKey]={name:s.name,ts:now,chg:now};
  else if(ex.out){delete ex.out;ex.backTs=now;ex.chg=now;}
  setMe(pickKey);
  if(d.alloc&&!d.alloc[pickKey])giveLate(pickKey);
  pickKey='';push();refresh();
}
function signOut(){var k=me();if(!k)return;if(!confirm('Sign out '+staffName(k)+' on this phone?'))return;clearMe();refresh();}

// ---------- manager ----------
function mgrLogin(){
  sheet('<div class="sd-h"><span>🔒 Manager login</span><button class="sd-x" id="sd-mx">✕</button></div>'+
    '<input id="sd-mp" class="sd-inp" type="password" inputmode="numeric" autocomplete="off" placeholder="Manager password" style="text-align:center;letter-spacing:5px">'+
    '<div id="sd-me" style="color:#dc2626;font-weight:700;font-size:13px;min-height:18px;margin-top:6px"></div><button class="sd-btn" id="sd-mg">Log in</button>');
  var i=document.getElementById('sd-mp');setTimeout(function(){i.focus();},50);
  function go(){sha('cc-wh-mgr|'+i.value.trim()).then(function(h){if(h===MGR_HASH){try{sessionStorage.setItem('cc_wh_mgr','1');}catch(e){}closeSheet();refresh();mgrPanel();}else{document.getElementById('sd-me').textContent='Wrong password';i.value='';}});}
  document.getElementById('sd-mg').addEventListener('click',go);i.addEventListener('keydown',function(e){if(e.key==='Enter')go();});
  document.getElementById('sd-mx').addEventListener('click',closeSheet);
}
function mgrLogout(){try{sessionStorage.removeItem('cc_wh_mgr');}catch(e){}closeSheet();refresh();}
var mgrTabSel='today';
function mgrPanel(){
  if(!isMgr())return mgrLogin();
  var d=day(),h='<div class="sd-h"><span>👥 '+esc(BNAME)+' — manager</span><button class="sd-x" id="sd-px">✕</button></div>'+
    '<div style="display:flex;gap:6px;margin-bottom:6px">'+[['today','Today'],['staff','Staff & PINs'],['hist','History']].map(function(t){return '<button class="sd-tab" data-t="'+t[0]+'" style="flex:1;border:1.5px solid '+(mgrTabSel===t[0]?'#6d28d9':'#e5e7eb')+';background:'+(mgrTabSel===t[0]?'#6d28d9':'#fff')+';color:'+(mgrTabSel===t[0]?'#fff':'#111')+';border-radius:10px;padding:9px;font-weight:800;font-size:13px;cursor:pointer">'+t[1]+'</button>';}).join('')+'</div>';
  if(mgrTabSel==='today')h+=mgrToday(d);
  else if(mgrTabSel==='staff')h+=mgrStaff();
  else h+=mgrHist();
  h+='<button class="sd-btn2" id="sd-lo" style="margin-top:18px">🔓 Log out of manager</button>';
  var m=sheet(h);
  m.querySelectorAll('.sd-tab').forEach(function(b){b.addEventListener('click',function(){mgrTabSel=this.getAttribute('data-t');mgrPanel();});});
  document.getElementById('sd-px').addEventListener('click',closeSheet);
  document.getElementById('sd-lo').addEventListener('click',mgrLogout);
  wireMgr(m);
}
function personCard(d,k,mgr){
  var s=d.signins[k],lt=lateBy(s),isTill=d.till===k,jobs=(d.alloc&&d.alloc[k])||[];
  var h='<div style="border:1px solid #e5e7eb;border-radius:12px;padding:11px 12px;margin-bottom:8px;background:#fff'+(s.out?';opacity:.55':'')+'">'+
    '<div style="display:flex;align-items:center;gap:8px"><b style="font-size:15px">'+esc(staffName(k))+'</b>'+
    (isTill?'<span style="font-size:11px;font-weight:800;background:#fef3c7;color:#92400e;border-radius:999px;padding:2px 8px">TILL</span>':'')+
    '<span style="flex:1"></span><span class="sd-small">in '+hm(s.ts)+'</span>'+
    (lt?'<span style="font-size:11.5px;font-weight:800;color:#dc2626">late '+mins(lt)+'</span>':'<span style="font-size:11.5px;font-weight:800;color:#059669">on time</span>')+'</div>'+
    (s.out?'<div class="sd-small">signed out '+hm(s.outTs||s.ts)+'</div>':'');
  if(isTill){var tt=tillTask();h+='<div class="sd-small" style="margin-top:4px">'+tt.icon+' '+esc(tt.label)+'</div>';}
  jobs.forEach(function(j){var J=JOBS[j];if(!J)return;var dn=d.done[k+'|'+j],c=jobCount(j);
    h+='<div style="display:flex;align-items:center;gap:7px;margin-top:5px;font-size:13px"><span>'+(dn?'✅':J.icon)+'</span><span style="flex:1;'+(dn?'text-decoration:line-through;color:#6b7280':'')+'">'+J.label+(d.help&&d.help[k+'|'+j]?' <span class="sd-small">(helping '+esc(staffName(d.help[k+'|'+j]))+')</span>':'')+'</span>'+
      (dn?'<span class="sd-small">done '+hm(dn)+'</span>':'<span style="font-weight:800;color:'+J.color+'">'+(c==null?'…':c)+' left</span>')+
      (mgr?'<button class="sd-mv" data-k="'+esc(k)+'" data-j="'+j+'" style="border:1px solid #e5e7eb;background:#fff;border-radius:7px;padding:3px 7px;font-size:11px;cursor:pointer">move</button>':'')+'</div>';});
  if(!isTill&&!jobs.length)h+='<div class="sd-small" style="margin-top:4px">'+(d.alloc?'No jobs':'Jobs arrive at '+('0'+START_H).slice(-2)+':'+('0'+START_M).slice(-2))+'</div>';
  if(mgr)h+='<div style="display:flex;gap:6px;margin-top:8px">'+(isTill?'':'<button class="sd-till" data-k="'+esc(k)+'" style="border:1px solid #e5e7eb;background:#fff;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:700;cursor:pointer">Put on till</button>')+(s.out?'':'<button class="sd-out" data-k="'+esc(k)+'" style="border:1px solid #fecaca;background:#fff;color:#dc2626;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:700;cursor:pointer">Sign out</button>')+'</div>';
  return h+'</div>';
}
function mgrToday(d){
  var ppl=Object.keys(d.signins).sort(function(a,b){return d.signins[a].ts-d.signins[b].ts;});
  var notIn=Object.keys(T.staff).filter(function(k){return !T.staff[k].removed&&!d.signins[k];});
  var h='<div class="sd-small" style="margin:4px 0 10px">'+(d.alloc?('Jobs given out at '+hm(d.allocAt)+'.'):('Jobs will be given out automatically at '+('0'+START_H).slice(-2)+':'+('0'+START_M).slice(-2)+' to everyone signed in.'))+'</div>';
  h+=ppl.length?ppl.map(function(k){return personCard(d,k,true);}).join(''):'<div class="sd-small" style="padding:10px 0">Nobody has signed in yet today.</div>';
  if(notIn.length)h+='<div class="sd-sec">Not signed in</div><div style="font-size:13.5px">'+notIn.map(function(k){return esc(staffName(k));}).join(', ')+(Date.now()>startTs()?' <b style="color:#dc2626">— late</b>':'')+'</div>';
  h+='<button class="sd-btn" id="sd-alloc">'+(d.alloc?'↻ Re-share jobs now':'▶ Give out jobs now')+'</button>';
  if(d.alloc)h+='<div class="sd-small" style="margin-top:6px">Re-sharing replaces everyone’s list (finished jobs stay ticked).</div>';
  return h;
}
function mgrStaff(){
  var ks=Object.keys(T.staff).filter(function(k){return !T.staff[k].removed;}).sort(function(a,b){return staffName(a).localeCompare(staffName(b));});
  var h='<div class="sd-sec">Staff at '+esc(BNAME)+'</div>'+(ks.length?ks.map(function(k){return '<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #f1f1f4"><b style="flex:1">'+esc(staffName(k))+'</b><button class="sd-rp" data-k="'+esc(k)+'" style="border:1px solid #e5e7eb;background:#fff;border-radius:8px;padding:5px 9px;font-size:12px;cursor:pointer">New PIN</button><button class="sd-rm" data-k="'+esc(k)+'" style="border:1px solid #fecaca;background:#fff;color:#dc2626;border-radius:8px;padding:5px 9px;font-size:12px;cursor:pointer">Remove</button></div>';}).join(''):'<div class="sd-small">No staff yet.</div>')+
    '<div class="sd-sec">Add staff</div><input id="sd-an" class="sd-inp" placeholder="Name" autocomplete="off"><input id="sd-ap" class="sd-inp" type="tel" inputmode="numeric" maxlength="8" placeholder="4-digit PIN" style="margin-top:8px"><button class="sd-btn" id="sd-add">+ Add</button>';
  if(BID===1)h+='<div class="sd-sec">CC Scan Station link (till job)</div><input id="sd-scan" class="sd-inp" placeholder="https://…" value="'+esc(T.cfg.scanUrl||'')+'" style="font-size:14px"><button class="sd-btn2" id="sd-scans">Save link</button>';
  return h;
}
function mgrHist(){
  var dss=Object.keys(T.days).sort().reverse().slice(0,30);
  if(!dss.length)return '<div class="sd-small" style="padding:10px 0">No history yet.</div>';
  return dss.map(function(ds){var d=T.days[ds];var ppl=Object.keys(d.signins||{}).sort(function(a,b){return d.signins[a].ts-d.signins[b].ts;});
    var label=new Date(startTs(ds)).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
    return '<div class="sd-sec">'+label+'</div>'+(ppl.length?ppl.map(function(k){var s=d.signins[k],lt=lateBy(s,ds),jobs=(d.alloc&&d.alloc[k])||[],dn=jobs.filter(function(j){return d.done&&d.done[k+'|'+j];}).length;
      return '<div style="display:flex;gap:8px;font-size:13px;padding:4px 0"><b style="flex:1">'+esc(staffName(k))+(d.till===k?' <span class="sd-small">till</span>':'')+'</b><span>'+hm(s.ts)+'</span><span style="width:70px;text-align:right;font-weight:700;color:'+(lt?'#dc2626':'#059669')+'">'+(lt?('late '+mins(lt)):'on time')+'</span><span class="sd-small" style="width:62px;text-align:right">'+dn+'/'+jobs.length+' jobs</span></div>';}).join(''):'<div class="sd-small">Nobody signed in</div>');}).join('');
}
function wireMgr(m){
  var d=day();
  var a=document.getElementById('sd-alloc');if(a)a.addEventListener('click',function(){if(!dataReady()){alert('Stock data is still loading. Try again in a few seconds.');return;}if(d.alloc&&!confirm('Re-share all jobs between everyone signed in now?'))return;allocate(true);refresh();mgrPanel();});
  m.querySelectorAll('.sd-till').forEach(function(b){b.addEventListener('click',function(){var k=this.getAttribute('data-k'),old=d.till;d.till=k;if(d.alloc){var mine=d.alloc[k]||[];d.alloc[k]=[];if(old&&d.alloc[old]!==undefined)d.alloc[old]=(d.alloc[old]||[]).concat(mine);}d.allocRev=(d.allocRev||0)+1;push();refresh();mgrPanel();});});
  m.querySelectorAll('.sd-out').forEach(function(b){b.addEventListener('click',function(){var k=this.getAttribute('data-k');if(!confirm('Sign out '+staffName(k)+'? Their unfinished jobs go to the others.'))return;d.signins[k].out=true;d.signins[k].outTs=Date.now();d.signins[k].chg=Date.now();
    if(d.alloc){var left=unfinished(d,k),others=onShift(d).filter(function(x){return x!==k&&x!==d.till;});if(!others.length)others=onShift(d).filter(function(x){return x!==k;});left.forEach(function(j,i){if(others.length){var o=others[i%others.length];d.alloc[o]=(d.alloc[o]||[]).concat([j]);}});d.alloc[k]=(d.alloc[k]||[]).filter(function(j){return d.done[k+'|'+j];});if(d.till===k&&others.length)d.till=others[0];d.allocRev=(d.allocRev||0)+1;}
    push();refresh();mgrPanel();});});
  m.querySelectorAll('.sd-mv').forEach(function(b){b.addEventListener('click',function(){var k=this.getAttribute('data-k'),j=this.getAttribute('data-j');var ppl=onShift(d).filter(function(x){return x!==k;});if(!ppl.length){alert('Nobody else is signed in.');return;}
    var p=prompt('Move "'+JOBS[j].label+'" to:\n'+ppl.map(function(x,i){return (i+1)+') '+staffName(x);}).join('\n'),'1');var i=parseInt(p)-1;if(isNaN(i)||!ppl[i])return;
    d.alloc[k]=d.alloc[k].filter(function(x){return x!==j;});d.alloc[ppl[i]]=(d.alloc[ppl[i]]||[]).concat([j]);d.allocRev=(d.allocRev||0)+1;push();refresh();mgrPanel();});});
  var add=document.getElementById('sd-add');if(add)add.addEventListener('click',async function(){var n=document.getElementById('sd-an').value.trim(),p=document.getElementById('sd-ap').value.trim();if(!n){alert('Enter a name');return;}if(!/^\d{4,8}$/.test(p)){alert('PIN must be 4 to 8 digits');return;}var k=nk(n);T.staff[k]={name:n,hash:await pinHash(k,p),ts:Date.now()};push();mgrPanel();});
  m.querySelectorAll('.sd-rp').forEach(function(b){b.addEventListener('click',async function(){var k=this.getAttribute('data-k');var p=prompt('New PIN for '+staffName(k)+' (4 to 8 digits):','');if(p==null)return;p=p.trim();if(!/^\d{4,8}$/.test(p)){alert('PIN must be 4 to 8 digits');return;}T.staff[k].hash=await pinHash(k,p);T.staff[k].ts=Date.now();push();alert('PIN changed');});});
  m.querySelectorAll('.sd-rm').forEach(function(b){b.addEventListener('click',function(){var k=this.getAttribute('data-k');if(!confirm('Remove '+staffName(k)+'? Their history stays.'))return;T.staff[k].removed=true;T.staff[k].ts=Date.now();push();mgrPanel();});});
  var sv=document.getElementById('sd-scans');if(sv)sv.addEventListener('click',function(){T.cfg.scanUrl=document.getElementById('sd-scan').value.trim();T.cfg.ts=Date.now();push();alert('Saved');});
}

// ---------- staff: my jobs ----------
function myJobsPanel(){
  var k=me();if(!k)return;var d=day(),isTill=d.till===k,jobs=(d.alloc&&d.alloc[k])||[];
  var h='<div class="sd-h"><span>📋 '+esc(staffName(k))+' — today</span><button class="sd-x" id="sd-jx">✕</button></div>';
  var s=d.signins[k];h+='<div class="sd-small" style="margin-bottom:10px">Signed in '+hm(s.ts)+(lateBy(s)?' · <b style="color:#dc2626">late '+mins(lateBy(s))+'</b>':'')+'</div>';
  if(!d.alloc)h+='<div style="background:#f5f3ff;border-radius:12px;padding:14px;font-size:14px">Your job list arrives at <b>'+('0'+START_H).slice(-2)+':'+('0'+START_M).slice(-2)+'</b>.</div>';
  if(isTill){var tt=tillTask();h+='<div class="sd-job" style="border-left:5px solid #f59e0b"><div style="font-size:22px">'+tt.icon+'</div><div style="flex:1"><div style="font-weight:800">'+esc(tt.label)+'</div><div class="sd-small">'+esc(tt.sub)+'</div></div>'+(BID===1&&T.cfg.scanUrl?'<a href="'+esc(T.cfg.scanUrl)+'" target="_blank" style="background:#f59e0b;color:#fff;border-radius:9px;padding:8px 11px;font-weight:800;font-size:13px;text-decoration:none">Open</a>':'')+'</div>';}
  jobs.forEach(function(j){var J=JOBS[j];if(!J)return;var dn=d.done[k+'|'+j],c=jobCount(j);
    h+='<div class="sd-job" style="border-left:5px solid '+J.color+(dn?';opacity:.6':'')+'"><div style="font-size:22px">'+(dn?'✅':J.icon)+'</div><div style="flex:1;min-width:0"><div style="font-weight:800'+(dn?';text-decoration:line-through':'')+'">'+J.label+'</div><div class="sd-small">'+(dn?('done '+hm(dn)):((c==null?'…':c)+' to do'))+(d.help&&d.help[k+'|'+j]?' · helping '+esc(staffName(d.help[k+'|'+j])):'')+'</div></div>'+
      (dn?'<button class="sd-undo" data-j="'+j+'" style="border:1px solid #e5e7eb;background:#fff;border-radius:9px;padding:8px 10px;font-size:12px;cursor:pointer">Undo</button>':'<button class="sd-open" data-v="'+J.view+'" style="border:1px solid '+J.color+';background:#fff;color:'+J.color+';border-radius:9px;padding:8px 10px;font-weight:800;font-size:13px;cursor:pointer">Open</button><button class="sd-done" data-j="'+j+'" style="border:none;background:#059669;color:#fff;border-radius:9px;padding:8px 10px;font-weight:800;font-size:13px;cursor:pointer;margin-left:4px">Done</button>')+'</div>';});
  if(d.alloc&&!isTill&&!jobs.length)h+='<div class="sd-small">No jobs for you right now. Ask the manager.</div>';
  h+='<button class="sd-btn2" id="sd-so" style="margin-top:14px">Sign out on this phone</button>';
  var m=sheet(h);
  document.getElementById('sd-jx').addEventListener('click',closeSheet);
  document.getElementById('sd-so').addEventListener('click',function(){closeSheet();signOut();});
  m.querySelectorAll('.sd-open').forEach(function(b){b.addEventListener('click',function(){closeSheet();if(typeof homeGo==='function')homeGo(this.getAttribute('data-v'));});});
  m.querySelectorAll('.sd-done').forEach(function(b){b.addEventListener('click',function(){var j=this.getAttribute('data-j');var c=jobCount(j);if(c&&c>0&&!confirm(c+' still showing for '+JOBS[j].label+'. Mark done anyway?'))return;d.done[k+'|'+j]=Date.now();push();refresh();myJobsPanel();});});
  m.querySelectorAll('.sd-undo').forEach(function(b){b.addEventListener('click',function(){delete d.done[k+'|'+this.getAttribute('data-j')];push();refresh();myJobsPanel();});});
}

// ---------- top bar ----------
function renderBar(){
  var bar=document.getElementById('sd-bar');
  var k=me(),mg=isMgr();
  if(!k&&!mg){if(bar)bar.style.display='none';return;}
  if(!bar){bar=document.createElement('div');bar.id='sd-bar';var hdr=document.querySelector('.hdr');if(hdr&&hdr.parentNode)hdr.parentNode.insertBefore(bar,hdr.nextSibling);else document.body.insertBefore(bar,document.body.firstChild);}
  bar.style.display='flex';
  var d=day(),html='';
  if(k){var jobs=(d.alloc&&d.alloc[k])||[],left=jobs.filter(function(j){return !d.done[k+'|'+j];}).length;
    html+='<b style="color:#5b21b6">👤 '+esc(staffName(k))+'</b><span style="color:#6d28d9">'+(d.till===k?'on till · ':'')+(d.alloc?(left+' job'+(left===1?'':'s')+' left'):'jobs at '+('0'+START_H).slice(-2)+':'+('0'+START_M).slice(-2))+'</span><span style="flex:1"></span><button id="sd-my" style="border:none;background:#6d28d9;color:#fff;border-radius:9px;padding:7px 12px;font-weight:800;font-size:13px;cursor:pointer">📋 My jobs</button>';}
  else html+='<b style="color:#5b21b6">👁 Manager</b><span style="color:#6d28d9">'+onShift(d).length+' signed in</span><span style="flex:1"></span>';
  if(mg)html+='<button id="sd-mp2" style="border:1px solid #6d28d9;background:#fff;color:#6d28d9;border-radius:9px;padding:7px 11px;font-weight:800;font-size:13px;cursor:pointer">👥 Team</button>';
  bar.innerHTML=html;
  var b1=document.getElementById('sd-my');if(b1)b1.addEventListener('click',myJobsPanel);
  var b2=document.getElementById('sd-mp2');if(b2)b2.addEventListener('click',mgrPanel);
}

// ---------- home screen: replace the old "how many people" planner with today's team ----------
function teamCardHTML(){
  var d=day(),ppl=onShift(d);
  var h='<div class="src-card" id="sd-team" style="margin-top:14px"><div class="src-hdr" style="display:flex;justify-content:space-between;align-items:center"><div class="src-name">👥 Today’s team</div>'+
    '<button onclick="window.__sdMgr()" style="border:1px solid #6d28d9;background:#fff;color:#6d28d9;border-radius:9px;padding:6px 11px;font-weight:700;font-size:12px;cursor:pointer">'+(isMgr()?'Manage':'🔒 Manager')+'</button></div>';
  h+='<div class="sd-small" style="margin:2px 0 8px">'+(d.alloc?('Jobs given out at '+hm(d.allocAt)):('Jobs are given out at '+('0'+START_H).slice(-2)+':'+('0'+START_M).slice(-2)+' to everyone signed in'))+'</div>';
  h+=ppl.length?ppl.map(function(k){return personCard(d,k,false);}).join(''):'<div class="sd-small" style="padding:6px 0">Nobody signed in yet.</div>';
  return h+'</div>';
}
window.__sdMgr=function(){if(isMgr())mgrPanel();else mgrLogin();};
function hasStaff(){return Object.keys(T.staff).some(function(k){return !T.staff[k].removed;});}
if(typeof renderHome==='function'){
  var _rh=renderHome;
  renderHome=window.renderHome=function(){
    _rh.apply(this,arguments);
    if(!hasStaff())return;               // branch not using sign-in yet: leave the old home screen alone
    try{var out=document.getElementById('out');if(!out)return;
      var wrap=document.createElement('div');wrap.innerHTML=teamCardHTML();var card=wrap.firstChild;
      var grid=out.querySelector('div[style*="grid-template-columns"]');
      if(!grid){return;}
      // drop the old "how many people / today's jobs" section, keep the job cards and the WhatsApp update link
      var sib=grid.nextSibling;while(sib){var nx=sib.nextSibling;var t=(sib.outerHTML||'');if(t.indexOf('wa.me')<0&&t.indexOf('homeSetPhone')<0)sib.parentNode.removeChild(sib);sib=nx;}
      grid.parentNode.insertBefore(card,grid.nextSibling);
      var hd=grid.previousSibling;if(hd&&/how many|Set today/i.test(hd.textContent||''))hd.querySelectorAll('div').forEach(function(x){if(/Set today/.test(x.textContent)&&!x.children.length)x.textContent='Sign in when you arrive. Jobs are shared out at '+('0'+START_H).slice(-2)+':'+('0'+START_M).slice(-2)+'.';});
      var ed=out.querySelector('button[onclick="homeEdit()"]');if(ed)ed.style.display='none';
    }catch(e){}
  };
}

// ---------- loop ----------
function refresh(){
  renderLock();renderBar();
  try{if(typeof view!=='undefined'&&view==='home'&&typeof renderHome==='function'&&!document.getElementById('sd-sheet'))renderHome();}catch(e){}
}
var ticking=false;
async function tick(){
  if(ticking)return;ticking=true;
  try{
    var d=day();
    if(!d.alloc&&Date.now()>=startTs()&&onShift(d).length&&dataReady()){
      await pull();d=day();               // fresh sign-ins before sharing out
      if(!d.alloc&&allocate(false))refresh();
    }
    d=day();
    if(d.alloc){var miss=onShift(d).filter(function(k){return !d.alloc[k];});
      if(miss.length){miss.forEach(giveLate);push();refresh();}}
  }finally{ticking=false;}
  renderLock();renderBar();
}
renderLock();renderBar();
try{if(typeof view!=='undefined'&&view==='home')renderHome();}catch(e){}
pull().then(function(ch){if(ch)refresh();else{renderLock();renderBar();}tick();});
setInterval(function(){pull().then(function(ch){if(ch&&!document.getElementById('sd-sheet'))refresh();tick();});},20000);
setInterval(tick,30000);
window.__sd={T:function(){return T;},allocate:allocate,day:day,me:me};
})();
