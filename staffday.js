/* Shared stock workspace presentation; attendance lives in the authenticated team API. */
(() => {
'use strict';
const branch = Number(document.body.dataset.branch);
const branches = [{name:'Chapeltown',color:'#7c3aed'},{name:'City Centre',color:'#2563eb'},{name:'Roundhay',color:'#0f766e'},{name:'Warehouse',color:'#c2410c'}];
const current = branches[branch];if(!current)return;
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.documentElement.style.setProperty('--accent',current.color);
document.documentElement.style.setProperty('--accent-soft',current.color+'0d');
const nav = document.createElement('nav');nav.className='cc-workspace-links';nav.setAttribute('aria-label','Team workspace');nav.innerHTML=`<a href="myday.html">My day & jobs</a><a href="asim-manager.html?branch=${branch}">Manager dashboard</a><a href="asim.html?branch=${branch}">Branch QR sign-in</a><span class="current-person" id="cc-person">Attendance & training workspace</span>`;document.body.prepend(nav);
let me=null;
async function refreshPerson(){try{const r=await fetch('/api/team?action=me',{cache:'no-store'});const j=await r.json();if(r.ok&&j.branch===branch){me=j;document.getElementById('cc-person').textContent=j.name+' · arrival '+new Date(j.arrival.at).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'});if(branch===3){window.pickerName=j.name;try{localStorage.setItem('cc_pk_name',j.name);}catch(e){}}else{window.ordBy=j.name;}if(window.view==='home')window.renderHome();}else{me=null;const status=await fetch('/api/team?action=status',{cache:'no-store'}).then(r=>r.json());document.getElementById('cc-person').textContent=status.manager?'Manager signed in':'Scan the branch QR to sign in before saving changes';}}catch(e){}}
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
    out.innerHTML=`<div class="home-intro"><div><div class="eyebrow">${esc(current.name)} · BRANCH WORKSPACE</div><h1>Everything ready for today.</h1><p>Start with your assigned jobs, then open the stock tool you need.</p></div></div><div class="cc-team-strip"><div><strong>${me?'Welcome, '+esc(me.name):'Your team. The right work. A clear day.'}</strong><p>${me?(me.till?'You are covering the till. Customer service comes first.':me.tasks.filter(t=>t.status!=='done').length+' jobs are waiting for you.'):'Scan the branch QR to record your arrival, review training and receive your jobs.'}</p></div><a class="btn primary" href="myday.html">Open my day →</a></div><div class="panel-title"><h2>Branch work areas</h2><span class="tiny">Live stock counts</span></div><div class="home-area-grid">${areas.map(a=>`<button class="area-card" data-work="${esc(a.view)}"><span class="area-name">${esc(labels[a.k]||a.label)}</span><span class="area-count" style="color:${esc(a.color)}">${a.count==null?'…':Number(a.count).toLocaleString('en-GB')}</span><span class="tiny">Open work area →</span></button>`).join('')}<button class="area-card" data-work="stocklvl"><span class="area-name">Stock levels</span><span class="area-count">↗</span><span class="tiny">Search and compare branches</span></button></div>`;
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
const work=new URLSearchParams(location.search).get('work');const views={pick:'pick',neg:'neg',over:'over',low:'low',shop:'shopify',img:'imgs'};
if(branch!==3&&views[work]){let attempts=0;const go=setInterval(()=>{if(window.destLoaded){clearInterval(go);window.homeGo(views[work]);}else if(++attempts>60)clearInterval(go);},500);}
if(branch===3&&work){const target={pick:'topup',over:'over',low:'topup'}[work];if(target){window.whTab=target;if(window.loaded>=4)window.renderWH();}}
refreshPerson();setInterval(refreshPerson,60000);
})();
