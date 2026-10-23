// api/photo.js — evidence photos for tasks. Staff upload a JPEG for one of their tasks; it is stored in
// Vercel Blob and attached to the task record. Manager-only deletion. Uses the same cookies as /api/team.
import { fail, loadBranch, mutateBranch, todayState, session, requestOrigin, londonDay, random } from '../lib/team-store.js';
export const config = { runtime: 'edge' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const BLOB='https://blob.vercel-storage.com';
async function blobPut(path, bytes, contentType){
  const token=process.env.BLOB_READ_WRITE_TOKEN; if(!token) fail('Photo storage is not configured.',503);
  const r=await fetch(BLOB+'/'+path,{method:'PUT',headers:{Authorization:'Bearer '+token,'x-api-version':'7','x-content-type':contentType,'x-add-random-suffix':'1','x-cache-control-max-age':'31536000'},body:bytes});
  if(!r.ok) fail('Photo could not be stored ('+r.status+'). Please try again.',502);
  return r.json();
}
async function blobDel(url){const token=process.env.BLOB_READ_WRITE_TOKEN;if(!token)return;try{await fetch(BLOB+'/delete',{method:'POST',headers:{Authorization:'Bearer '+token,'x-api-version':'7','Content-Type':'application/json'},body:JSON.stringify({urls:[url]})});}catch{}}
export default async function handler(req){
  try{
    if(req.method!=='POST') return json({error:'POST required'},405);
    const origin=req.headers.get('origin');
    if((origin&&origin!==requestOrigin(req))||req.headers.get('sec-fetch-site')==='cross-site') fail('Please use this app directly.',403);
    const url=new URL(req.url); const action=url.searchParams.get('action')||'upload';
    if(action==='delete'){
      const m=await session(req,'cc_manager'); if(m?.role!=='manager') fail('Please sign in as manager.',401);
      const body=await req.json(); const branch=Number(body.branch); const date=String(body.date||''); if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('Invalid date.');
      let removed=null;
      await mutateBranch(branch,state=>{const d=state.days[date]; const t=d?.tasks.find(t=>t.id===body.id); if(!t) fail('Task not found.',404); const i=(t.photos||[]).findIndex(p=>p.url===body.url); if(i<0) fail('Photo not found.',404); removed=t.photos.splice(i,1)[0];});
      if(removed) await blobDel(removed.url);
      return json({ok:true});
    }
    // upload: staff session required, task must be theirs and from today
    const s=await session(req); if(s?.role!=='staff'||s.date!==londonDay()) fail('Please scan today’s branch QR code and sign in.',401);
    const taskId=url.searchParams.get('task')||''; const note=(url.searchParams.get('note')||'').slice(0,200);
    if(!taskId) fail('Which task is this photo for?');
    const type=req.headers.get('content-type')||''; if(!/^image\/(jpeg|png|webp)$/.test(type)) fail('Send a JPEG, PNG or WebP photo.',415);
    const bytes=await req.arrayBuffer(); if(bytes.byteLength<2000) fail('That photo looks empty. Please try again.'); if(bytes.byteLength>4_000_000) fail('Photo too large (max 4 MB). Please try again.',413);
    const {state}=await loadBranch(s.branch); const d=todayState(state); const task=d.tasks.find(t=>t.id===taskId&&t.assignee===s.staff&&!t.archived); if(!task) fail('Task no longer assigned to you.',404);
    const ext=type.split('/')[1].replace('jpeg','jpg'); const at=Date.now();
    const stored=await blobPut(`asim/${s.branch}/${s.date}/${taskId}-${random().slice(0,8)}.${ext}`,bytes,type);
    const photo={url:stored.url,at,by:s.staff,note,bytes:bytes.byteLength};
    await mutateBranch(s.branch,state=>{const t=todayState(state).tasks.find(t=>t.id===taskId); if(!t) fail('Task not found.',404); (t.photos ||= []).push(photo); if(t.photos.length>12){const old=t.photos.shift(); blobDel(old.url);} t.updatedAt=at; (t.history ||= []).push({at,by:s.staff,event:'Photo added'});});
    return json({ok:true,photo});
  }catch(e){ return json({error:e.message||'Request failed'}, e.status||400); }
}
