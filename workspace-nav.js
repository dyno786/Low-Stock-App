/* Shared ASIM navigation. Branch context is a display preference, never authentication. */
(() => {
'use strict';
if(document.getElementById('asim-navigation'))return;
const branches=[{id:0,name:'Chapeltown',slug:'chapeltown',file:'chapeltown.html',color:'#7c3aed'},{id:1,name:'City Centre',slug:'citycenter',file:'citycenter.html',color:'#2563eb'},{id:2,name:'Roundhay',slug:'roundhay',file:'roundhay.html',color:'#0f766e'},{id:3,name:'Warehouse',slug:'warehouse',file:'warehouse.html',color:'#c2410c'}];
const file=location.pathname.split('/').pop(),params=new URLSearchParams(location.search);
const manager=['asim-manager.html','team.html','asim-team.html'].includes(file),signin=['asim.html','signin.html'].includes(file);
const known=new Set([...branches.map(b=>b.file),'asim.html','signin.html','asim-manager.html','asim-team.html','team.html','myday.html','orders.html','picco.html','picklog.html']);
const parse=v=>{if(v===null||v===undefined||v==='')return null;return branches.find(b=>String(b.id)===String(v)||b.slug===String(v))?.id??null;};
let saved=null;try{saved=parse(localStorage.getItem('asim.branch'));}catch{}
let branch=branches.find(b=>b.file===file)?.id??parse(document.body.dataset.navigationBranch)??parse(params.get('branch'))??parse(document.body.dataset.branch)??(file==='picklog.html'?3:saved??0);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const header=document.createElement('header');header.id='asim-navigation';header.className='asim-navigation';header.setAttribute('aria-label','ASIM workspace');
const signout=document.getElementById('manager-signout');
function link(label,url,active=false){return `<a href="${url}"${active?' aria-current="page"':''}>${label}</a>`;}
function home(event){if(file!==branches[branch].file)return;event.preventDefault();history.replaceState(null,'',branches[branch].file);if(branch!==3&&typeof window.homeGo==='function'){window.homeGo('home');window.scrollTo({top:0,behavior:'smooth'});}else if(branch===3&&typeof window.renderWH==='function'){window.whTab='topup';try{localStorage.setItem('cc_wh_tab','topup');}catch{}window.renderWH();}else location.assign(branches[branch].file);}
function render(){
 const b=branches[branch];header.style.setProperty('--asim-accent',b.color);
 header.innerHTML=`<div class="asim-nav-top"><a class="asim-nav-brand" href="${b.file}" aria-label="ASIM branch home"><span>A</span><strong>ASIM<small>${esc(b.name)}</small></strong></a><div class="asim-nav-controls"><label>Branch<select id="asim-nav-branch" aria-label="Navigation branch">${branches.map(x=>`<option value="${x.id}" ${x.id===branch?'selected':''}>${x.name}</option>`).join('')}</select></label><button type="button" id="asim-nav-back">← Back</button><span id="asim-nav-account"></span></div></div><nav class="asim-nav-links" aria-label="Main navigation">${link('Branch home',b.file,file===b.file)}${link('My day & jobs',`myday.html?branch=${branch}`,file==='myday.html')}${link('Staff QR',`asim.html?branch=${branch}`,signin)}${link('Manager',`asim-manager.html?branch=${branch}`,manager)}<details class="asim-nav-more"><summary>All tools & pages</summary><div class="asim-nav-menu"><span class="asim-nav-phone">GO TO</span>${['Branch home|'+b.file,'My day & jobs|myday.html?branch='+branch,'Staff QR|asim.html?branch='+branch,'Manager|asim-manager.html?branch='+branch].map(x=>{const [l,h]=x.split('|');return link(l,h).replace('<a ','<a data-phone="1" ');}).join('')}<span>MANAGER</span>${[['Attendance','overview'],['Daily jobs','tasks'],['Sections','sections'],['Training matrix','training'],['Time & workload','activity'],['Staff & branch setup','setup']].map(([label,tab])=>link(label,`asim-manager.html?branch=${branch}&tab=${tab}`,manager&&(params.get('tab')||'overview')===tab)).join('')+link('All staff · training · work (every branch)','asim-team.html',file==='asim-team.html')}<span>BRANCH TOOLS</span>${(branch===3?[['Picking & replenishment','pick'],['Overstock','over']]:[['Picking orders','pick'],['Low stock & replenishment','low'],['Negative stock','neg'],['Overstock','over'],['Out of stock','oos'],['Stock levels','stocklvl'],['Shopify products','shop'],['Product images','img']]).map(([label,work])=>link(label,`${b.file}?work=${work}`)).join('')}${link('Branch orders',`orders.html?branch=${branch}`,file==='orders.html')}${link('PICCO product search',`picco.html?branch=${b.slug}`,file==='picco.html')}${branch===3?link('Pick-times log','picklog.html?branch=3',file==='picklog.html'):''}</div></details></nav>`;
 if(signout)header.querySelector('#asim-nav-account').append(signout);
 header.querySelector('#asim-nav-branch').onchange=e=>{const next=Number(e.target.value);try{localStorage.setItem('asim.branch',String(next));}catch{};const target=signin?'asim.html':manager?'asim-manager.html':file==='myday.html'?'myday.html':file==='picco.html'?'picco.html':file==='orders.html'?'orders.html':branches[next].file;location.assign(target===branches[next].file?target:`${target}?branch=${target==='picco.html'?branches[next].slug:next}${manager?'&tab='+encodeURIComponent(new URLSearchParams(location.search).get('tab')||'overview'):''}`);};
 header.querySelector('.asim-nav-brand').onclick=home;header.querySelector('.asim-nav-links>a').onclick=home;
 header.querySelector('#asim-nav-back').onclick=()=>{
  if(file===b.file&&branch!==3&&typeof window.homeGo==='function'&&window.view!=='home'){home({preventDefault(){}});return;}
  if(file===b.file&&branch===3&&window.whTab!=='topup'){home({preventDefault(){}});return;}
  const current=new URLSearchParams(location.search);
  if(manager&&current.get('tab')&&current.get('tab')!=='overview'){location.assign(`asim-manager.html?branch=${branch}`);return;}
  let ref;try{ref=new URL(document.referrer);}catch{}
  if(ref?.origin===location.origin&&known.has(ref.pathname.split('/').pop())&&history.length>1)history.back();else location.assign(b.file);
 };
 const more=header.querySelector('details');more.addEventListener('keydown',e=>{if(e.key==='Escape'){more.open=false;more.querySelector('summary').focus();}});
}
window.AsimNavigation={setBranch(value){const id=parse(value);if(id===null||id===branch)return;branch=id;try{localStorage.setItem('asim.branch',String(id));}catch{}render();}};
try{localStorage.setItem('asim.branch',String(branch));}catch{}
render();document.body.prepend(header);document.body.classList.add('asim-has-navigation');document.querySelector('body>.app-header')?.remove();
// Phone bottom menu on the stock pages: same five items as "My day".
if(!manager&&!signin&&file!=='myday.html'){
 const I={home:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',tasks:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',stock:'<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',me:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'};
 const ic=k=>`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;
 const bb=branches[branch]||branches[0];const day=`myday.html?branch=${bb.id}`;
 const bar=document.createElement('nav');bar.className='asim-bottom';bar.setAttribute('aria-label','Main menu');
 bar.innerHTML=`<a href="${day}">${ic('home')}<span>Today</span></a><a href="${day}&pane=tasks">${ic('tasks')}<span>Tasks</span></a><a href="asim.html?branch=${bb.id}">${ic('clock')}<span>Clock in</span></a><a href="${esc(bb.file)}" aria-current="page">${ic('stock')}<span>Stock</span></a><a href="${day}&pane=me">${ic('me')}<span>Me</span></a>`;
 document.body.appendChild(bar);document.body.classList.add('asim-has-bottom');
 let th='red';try{th=localStorage.getItem('asim.theme')||'red';}catch{}bar.dataset.theme=th;
}
document.addEventListener('click',e=>{if(!header.contains(e.target)){const d=header.querySelector('details');if(d)d.open=false;}});
})();
