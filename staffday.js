/* Shared stock workspace presentation; attendance lives in the authenticated team API. */
(() => {
'use strict';
const branch = Number(document.body.dataset.branch);
const branches = [{name:'Chapeltown',color:'#7c3aed'},{name:'City Centre',color:'#2563eb'},{name:'Roundhay',color:'#0f766e'},{name:'Warehouse',color:'#c2410c'}];
const current = branches[branch];if(!current)return;
window.destByBc=window.destByBc||(bc=>{const d=window.destData;if(!Array.isArray(d))return null;for(const p of d)if(p.bc===bc)return p;return null;});
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.documentElement.style.setProperty('--accent',current.color);
document.documentElement.style.setProperty('--accent-soft',current.color+'0d');
const nav = document.createElement('nav');nav.className='cc-workspace-links';nav.setAttribute('aria-label','Team workspace');nav.innerHTML='<span class="current-person" id="cc-person">Attendance & training workspace</span>';document.body.prepend(nav);
let me=null;
let refreshPerson=async function(){try{const r=await fetch('/api/team?action=me',{cache:'no-store'});const j=await r.json();if(r.ok&&j.branch===branch){me=j;document.getElementById('cc-person').textContent=j.name+' · arrival '+new Date(j.arrival.at).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'});if(branch===3){window.pickerName=j.name;try{localStorage.setItem('cc_pk_name',j.name);}catch(e){}}else{window.ordBy=j.name;}if(window.view==='home')window.renderHome();}else{me=null;const status=await fetch('/api/team?action=status',{cache:'no-store'}).then(r=>r.json());document.getElementById('cc-person').textContent=status.manager?'Manager signed in':'Scan the branch QR to sign in before saving changes';}}catch(e){}}
if(branch!==3){
  window.renderHome=function(){
    document.body.classList.add('on-home');
    const out=document.getElementById('out');if(!out)return;
    if(!window.destLoaded){out.innerHTML='<div class="loading"><div class="spin"></div>Loading branch stock…</div>';return;}
    if(typeof window.loadImgs==='function'&&!window.__homeImgs){window.__homeImgs=1;window.loadImgs().then(()=>{if(window.view==='home')window.renderHome();}).catch(()=>{});}
    if(typeof window.SOURCES!=='undefined')window.SOURCES.forEach((sc,i)=>{if(!window.srcLoaded[i]&&typeof window.loadSrc==='function')window.loadSrc(i);});
    if(typeof window.startOrdPoller==='function')window.startOrdPoller();
    const areas=typeof window.homeAreas==='function'?window.homeAreas():[];
    const labels={pick:'Picking orders',neg:'Negative stock',oos:'Out of stock',over:'Overstock',order:'Low stock & replenishment',shop:'Add to Shopify',img:'Product images'};
    const labels2={pick:'Orders to pick',neg:'Negatives',oos:'Out of stock',over:'Overstock to move',order:'To order · low stock',shop:'Add to Shopify',img:'Missing images'};
    const tools=[['orders','Order'],['pick','Picking'],['fast','Fast OOS'],['whorder','W/H order'],['map','Map']].filter(([v])=>document.querySelector('.vtab[data-v="'+v+'"]'));
    const day=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',day:'numeric',month:'short'}).format(Date.now());
    const sync=window.syncOk===false?'<span class="m-sync bad">Not saved centrally · tap Sync</span>':'<span class="m-sync"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg>Synced · live counts</span>';
    out.innerHTML=`<div class="m-app m-home"><header class="m-head"><div><span class="m-label">${esc(current.name)} · ${esc(day)}${me?' · '+esc(me.name):''}</span><h1>Stock</h1></div><button type="button" class="m-icon-btn" id="m-sync" aria-label="Sync now"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"></path><path d="M21 3v6h-6"></path></svg></button></header>
      ${sync}
      ${me?`<div class="m-notice">${me.till?'<b>You are on the till today.</b> Customers come first.':'<b>'+esc(me.tasks.filter(t=>t.status!=='done').length)+' jobs waiting for you.</b> Open Tasks in the menu below.'}</div>`:`<a class="m-notice" href="asim.html?branch=${branch}" style="display:block;text-decoration:none">Scan the branch QR to clock in and get your jobs.</a>`}
      <h2>Work areas</h2>
      <div class="m-tiles">${areas.map((a,i)=>`<button type="button" class="m-tile ${i?'':'accent'}" data-work="${esc(a.view)}"><span class="k">${esc(labels2[a.k]||a.label)}</span><span class="v">${a.count==null?'…':Number(a.count).toLocaleString('en-GB')}</span><span class="s">Open work area</span></button>`).join('')}<button type="button" class="m-tile" data-work="stocklvl"><span class="k">Stock levels</span><span class="v">↗</span><span class="s">Search and compare branches</span></button></div>
      ${tools.length?`<h2>Tools</h2><div class="m-chips">${tools.map(([v,l])=>`<button type="button" class="m-chip" data-work="${v}">${l}</button>`).join('')}</div>`:''}</div>`;
    const sb=document.getElementById('m-sync');if(sb)sb.onclick=()=>document.getElementById('sync-btn')?.click();
    out.querySelectorAll('[data-work]').forEach(btn=>btn.onclick=()=>window.homeGo(btn.dataset.work));
  };
  const previousRenderView=window.renderView;
  if(typeof previousRenderView==='function')window.renderView=function(){document.body.classList.toggle('on-home',window.view==='home');return previousRenderView.apply(this,arguments);};
  if(window.view==='home')window.renderHome();
  document.querySelectorAll('#vtabs .vtab').forEach(t=>{t.setAttribute('role','button');t.tabIndex=0;t.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();t.click();}});});
}
// All generic sync writes now report success only after the server acknowledges them.
window.syncSave=function(k,v){
  if(branch===3&&(k==='cc_pk_ticks'||k==='cc_wh_sent'||k==='cc_wh_tickmeta'))window.__pkWrite=Date.now();
  window._sp ||= {};clearTimeout(window._sp[k]);
  window._sp[k]=setTimeout(async()=>{try{const r=await fetch('/api/ticks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k,value:v}),signal:AbortSignal.timeout(12000)});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'Save failed');window.syncOk=true;const status=document.getElementById('sync-txt');if(status)status.style.color='';if(typeof window.setSyncTxt==='function')window.setSyncTxt('✓ Saved');}catch(e){window.syncOk=false;const el=document.getElementById('sync-txt');if(el){el.textContent=e.message.includes('sign in')||e.message.includes('Sign in')?'Sign-in needed — scan the branch QR or sign in as manager':'Not saved centrally — reconnect and use Sync now';el.style.color='#b91c1c';el.setAttribute('role','alert');}}finally{window._sp[k]=null;}},400);
};
const work=new URLSearchParams(location.search).get('work');const views={pick:'pick',neg:'neg',over:'over',low:'low',shop:'shopify',img:'imgs',oos:'oos',stocklvl:'stocklvl'};
if(branch!==3&&views[work]){let attempts=0;const go=setInterval(()=>{if(window.destLoaded){clearInterval(go);window.homeGo(views[work]);}else if(++attempts>60)clearInterval(go);},500);}
if(branch===3&&work){const target={pick:'topup',over:'over',low:'topup'}[work];if(target){window.whTab=target;if(window.loaded>=4)window.renderWH();}}
// ---------- Sections on the stock page: every work area can show All / My section / Section 1–5 ----------
const SEC={list:[],mine:[],sel:'all',vendors:null};
try{SEC.sel=sessionStorage.getItem('cc_sec_sel_'+branch)||'all';}catch(e){}
const kwRe={};const kwHit=(name,kw)=>{const re=kwRe[kw]||(kwRe[kw]=new RegExp('(^|[^A-Z0-9])'+kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));return re.test(name);};
const normBrand=v=>String(v||'').trim().toUpperCase().replace(/\s+/g,' ').replace(/[^A-Z0-9&\/+\- ]/g,'').trim();
function ruleMatch(p,rules){const nm=String(p.nm||'').toUpperCase();for(const r of rules||[]){if(r.depts?.length&&!r.depts.includes(p.dp))continue;if(r.include?.length&&!r.include.some(k=>kwHit(nm,k)))continue;if(r.exclude?.length&&r.exclude.some(k=>kwHit(nm,k)))continue;return true;}return false;}
function secOf(p){if(!p)return '';const v=SEC.vendors&&p.bc?normBrand(SEC.vendors[p.bc]):'';if(v){for(const s of SEC.list)if(s.brands?.length&&s.brands.includes(v))return s.id;}for(const s of SEC.list)if(s.rules?.length&&ruleMatch(p,s.rules))return s.id;return '';}
function secOk(p){const sel=SEC.sel;if(sel==='all'||!SEC.list.length)return true;const id=secOf(p);if(sel==='mine')return SEC.mine.includes(id);if(sel==='none')return !id;return id===sel;}
window.secOkBc=function(bc){if(SEC.sel==='all'||!SEC.list.length)return true;const p=window.destByBc(bc);return p?secOk(p):SEC.sel==='none';};
window.secOf=secOf;
async function loadSections(){try{const r=await fetch('/api/team?action=sections&branch='+branch,{cache:'no-store'});const j=await r.json();SEC.list=(j.sections||[]).filter(s=>s.kind!=='duty');}catch(e){SEC.list=[];}
  fetch('/api/vendors').then(r=>r.json()).then(j=>{SEC.vendors=j&&!j.error?j:{};if(!window.vmap)window.vmap=SEC.vendors;if(SEC.sel!=='all')rerender();}).catch(()=>{SEC.vendors={};});
  if(SEC.sel!=='all')rerender();}
function rerender(){if(typeof window.renderView==='function'&&window.view&&window.view!=='home'&&window.destLoaded)window.renderView();}
function secLabel(s){return s.area?s.area.split('·')[0].trim():s.name;}
function secBar(){if(!SEC.list.length)return '';const chips=[['all','All']];if(SEC.mine.length)chips.push(['mine','My section']);SEC.list.forEach(s=>chips.push([s.id,secLabel(s)]));chips.push(['none','No section']);
  return '<div class="m-chips sec-bar" role="group" aria-label="Section">'+chips.map(([id,l])=>'<button type="button" class="m-chip'+(SEC.sel===id?' on':'')+'" data-secsel="'+esc(id)+'">'+esc(l)+'</button>').join('')+'</div>';}
function wireSecBar(){document.querySelectorAll('[data-secsel]').forEach(b=>b.onclick=()=>{SEC.sel=b.dataset.secsel;try{sessionStorage.setItem('cc_sec_sel_'+branch,SEC.sel);}catch(e){}rerender();});}
function withSection(name){const fn=window[name];if(typeof fn!=='function')return;window[name]=function(){const full=window.destData;if(SEC.sel!=='all'&&Array.isArray(full)&&SEC.list.length)window.destData=full.filter(secOk);try{return fn.apply(this,arguments);}finally{window.destData=full;const out=document.getElementById('out');if(out&&!out.querySelector('.sec-bar')&&SEC.list.length){out.insertAdjacentHTML('afterbegin',secBar());wireSecBar();}}};}
if(branch!==3){['renderNeg','renderOOS','renderLow','renderShopify','renderImgs','renderOverstock','renderOrdersInbox'].forEach(withSection);loadSections();}
const baseRefresh=refreshPerson;
refreshPerson=async function(){await baseRefresh();if(me&&Array.isArray(me.mySections)){const ids=me.mySections.filter(s=>s.kind!=='duty').map(s=>s.id);const first=!SEC.mine.length&&ids.length;SEC.mine=ids;let saved=null;try{saved=sessionStorage.getItem('cc_sec_sel_'+branch);}catch(e){}if(first&&!saved){SEC.sel='mine';rerender();}}};
refreshPerson();setInterval(refreshPerson,60000);
})();
