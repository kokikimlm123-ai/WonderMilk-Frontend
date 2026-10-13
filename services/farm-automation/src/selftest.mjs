import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from './store.mjs';
import {hash} from './domain.mjs';
// Runs only when explicitly enabled in the development runtime. No LINE/AI calls.
export async function selftest(pool,media){
 const schema='v2_probe_'+randomUUID().replaceAll('-','');const client=await pool.connect();
 const query=(...args)=>client.query(...args);let created=false;
 try{
  await query(`CREATE SCHEMA ${schema}`);created=true;await query(`SET search_path TO ${schema}`);
  const store=new Store({query,connect:async()=>({query,release(){}})});await store.init();
  const e={id:'probe-event',group:'probe-group',farm:'Farm 2',message:'probe-message',actor:'synthetic',kind:'text',text:'synthetic development verification',at:Date.now()};
  assert.equal(await store.ingest([e,e]),1);const claimed=await store.claim();assert.equal(claimed.id,e.id);
  const record={kind:'milk',date:'2026-10-13',session:'probe',milk_kg:1};
  assert.equal(await store.complete(claimed,{records:[record],issues:[],method:'synthetic-probe'}),true);
  const actor={actor:'probe-reviewer',groups:[e.group]};assert.equal((await store.records(actor)).length,0);
  await store.review(e.id,actor,{version:1,decision:'approve',reason:'Synthetic database integration check'});assert.equal((await store.records(actor)).length,1);
  await assert.rejects(store.review(e.id,actor,{version:1,decision:'approve',reason:'Replay'}),{status:409});
  await store.ingest([{...e,id:'probe-unsend',kind:'unsend'}]);assert.equal((await store.records(actor)).length,0);
  console.log(JSON.stringify({check:'postgres_draft_review_replay_unsend',status:'passed'}));
 }finally{try{await query('SET search_path TO public');if(created)await query(`DROP SCHEMA ${schema} CASCADE`);}finally{client.release();}}
 if(media){const key=`selftest/${randomUUID()}.png`,bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ9kAAAAASUVORK5CYII=','base64');
  try{await media.put(key,{bytes,mime:'image/png'});const retrieved=await media.get(key);assert.equal(hash(retrieved.bytes),hash(bytes));}finally{await media.remove(key);}
  console.log(JSON.stringify({check:'private_evidence_put_get_delete',status:'passed'}));
 }
}
