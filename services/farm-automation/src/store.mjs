import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {hash,identity,Problem,validateRecords} from './domain.mjs';
export const mediaKey=(g,m)=>`farm/${hash(g)}/${hash(m)}.image`;
export class Store {
 constructor(pool){this.pool=pool;}
 async init(){await this.pool.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));}
 async tx(fn){const db=await this.pool.connect();try{await db.query('BEGIN');const r=await fn(db);await db.query('COMMIT');return r;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 async sourceLock(db,g,m){await db.query('INSERT INTO v2_sources(group_id,message_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[g,m]);return (await db.query('SELECT * FROM v2_sources WHERE group_id=$1 AND message_id=$2 FOR UPDATE',[g,m])).rows[0];}
 async ingest(events){return this.tx(async db=>{
  if(Number((await db.query("SELECT count(*) n FROM v2_events WHERE status IN ('queued','processing')")).rows[0].n)+events.filter(e=>e.kind!=='unsend').length>2000)throw new Problem(503,'queue_full');
  let accepted=0;
  for(const e of events){const source=await this.sourceLock(db,e.group,e.message);
   if(e.kind==='unsend'){
    await db.query('UPDATE v2_sources SET revoked=true WHERE group_id=$1 AND message_id=$2',[e.group,e.message]);
    await db.query("INSERT INTO v2_media_deletions(key) VALUES($1) ON CONFLICT DO NOTHING",[mediaKey(e.group,e.message)]);
    await db.query("UPDATE v2_events SET status='revoked',body=NULL WHERE group_id=$1 AND message_id=$2",[e.group,e.message]);
    const drafts=(await db.query('SELECT d.id FROM v2_drafts d JOIN v2_events e ON d.id=e.id WHERE e.group_id=$1 AND e.message_id=$2 FOR UPDATE OF d',[e.group,e.message])).rows;
    for(const d of drafts){await db.query("UPDATE v2_drafts SET status='revoked',proposals='[]',issues='[\"source_withdrawn\"]',evidence_key=NULL,evidence_hash=NULL,version=version+1 WHERE id=$1",[d.id]);await db.query("UPDATE v2_records SET status='source_withdrawn',value='{}' WHERE draft_id=$1",[d.id]);await db.query("INSERT INTO v2_audit VALUES($1,$2,'system','source_withdrawn','LINE unsend received',now())",[randomUUID(),d.id]);}
    continue;
   }
   if(source.revoked)continue;
   const r=await db.query('INSERT INTO v2_events(id,group_id,farm,message_id,actor,kind,body,source_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id',[e.id,e.group,e.farm,e.message,e.actor,e.kind,JSON.stringify({text:e.text}),e.at]);accepted+=r.rows.length;
  }return accepted;
 });}
 async claim(){return this.tx(async db=>{
  await db.query("UPDATE v2_events SET status='failed',error_code='retry_exhausted' WHERE status='processing' AND attempts>=3 AND available_at<=now()");
  const e=(await db.query("SELECT * FROM v2_events WHERE (status='queued' OR status='processing') AND available_at<=now() AND attempts<3 ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];if(!e)return null;
  await db.query("UPDATE v2_events SET status='processing',attempts=attempts+1,available_at=now()+interval '5 minutes' WHERE id=$1",[e.id]);return e;
 });}
 async complete(e,result,evidence={}){return this.tx(async db=>{
  const source=await this.sourceLock(db,e.group_id,e.message_id);if(source.revoked)return false;
  const current=(await db.query('SELECT status FROM v2_events WHERE id=$1 FOR UPDATE',[e.id])).rows[0];if(current.status==='done')return true;
  await db.query('INSERT INTO v2_drafts(id,group_id,farm,proposals,issues,method,evidence_key,evidence_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING',[e.id,e.group_id,e.farm,JSON.stringify(result.records),JSON.stringify(result.issues),result.method,evidence.key||null,evidence.hash||null]);
  await db.query("UPDATE v2_events SET status='done',error_code=NULL WHERE id=$1",[e.id]);return true;
 });}
 async fail(e,code){await this.pool.query("UPDATE v2_events SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,error_code=$2,available_at=now()+interval '30 seconds' WHERE id=$1 AND status='processing'",[e.id,code]);}
 async retry(id,actor){return this.tx(async db=>{const e=(await db.query('SELECT * FROM v2_events WHERE id=$1 AND group_id=ANY($2::text[]) FOR UPDATE',[id,actor.groups])).rows[0];if(!e)throw new Problem(404,'not_found');if(e.status!=='failed')throw new Problem(409,'not_failed');await db.query("UPDATE v2_events SET status='queued',attempts=0,available_at=now() WHERE id=$1",[id]);await db.query("INSERT INTO v2_audit VALUES($1,$2,$3,'retry','Reviewer requested retry',now())",[randomUUID(),id,actor.actor]);return {status:'queued'};});}
 async list(actor){return (await this.pool.query('SELECT d.*,e.body,e.message_id,e.source_at,e.actor AS sender FROM v2_drafts d JOIN v2_events e ON d.id=e.id WHERE d.group_id=ANY($1::text[]) ORDER BY d.created_at DESC LIMIT 100',[actor.groups])).rows;}
 async review(id,actor,{version,decision,records,reason}){
  if(!Number.isInteger(version)||!['approve','reject'].includes(decision)||typeof reason!=='string'||!reason.trim()||reason.length>1000)throw new Problem(400,'version_decision_reason_required');
  try{return await this.tx(async db=>{
   // Source lock first: same ordering as unsend and worker completion.
   const e=(await db.query('SELECT * FROM v2_events WHERE id=$1 AND group_id=ANY($2::text[])',[id,actor.groups])).rows[0];if(!e)throw new Problem(404,'not_found');
   const source=await this.sourceLock(db,e.group_id,e.message_id);if(source.revoked)throw new Problem(409,'source_withdrawn');
   const d=(await db.query('SELECT * FROM v2_drafts WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!d)throw new Problem(404,'not_found');
   if(d.status!=='pending'||d.version!==version)throw new Problem(409,'stale_or_final_draft');
   const proposals=records===undefined?d.proposals:records;
   if(decision==='approve'){
    const errors=validateRecords(proposals);if(errors.length)throw new Problem(422,errors.join(';'));
    for(const r of proposals)await db.query('INSERT INTO v2_records(id,draft_id,group_id,identity,value) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,d.group_id,identity(d.group_id,d.farm,r),JSON.stringify({...r,farm:d.farm,source_event:id,approved_by:actor.actor})]);
   }
   await db.query('UPDATE v2_drafts SET status=$2,version=version+1,proposals=$3,issues=$4 WHERE id=$1',[id,decision==='approve'?'approved':'rejected',JSON.stringify(proposals),JSON.stringify(decision==='approve'?[]:d.issues)]);
   await db.query('INSERT INTO v2_audit VALUES($1,$2,$3,$4,$5,now())',[randomUUID(),id,actor.actor,decision,reason]);
   return {id,status:decision==='approve'?'approved':'rejected',version:version+1};
  });}catch(e){if(e.code==='23505')throw new Problem(409,'duplicate_business_record');throw e;}
 }
 async records(actor){return (await this.pool.query("SELECT id,draft_id,value FROM v2_records WHERE group_id=ANY($1::text[]) AND status='approved' ORDER BY created_at DESC LIMIT 1000",[actor.groups])).rows;}
 async status(actor){return (await this.pool.query('SELECT id,group_id,kind,status,attempts,error_code FROM v2_events WHERE group_id=ANY($1::text[]) ORDER BY created_at DESC LIMIT 100',[actor.groups])).rows;}
 async reserveAI(limit){const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return (await this.pool.query('INSERT INTO v2_usage(day,calls) SELECT $1,1 WHERE $2::integer>0 ON CONFLICT(day) DO UPDATE SET calls=v2_usage.calls+1 WHERE v2_usage.calls<$2 RETURNING calls',[day,limit])).rows.length>0;}
 async deleteMedia(media){if(!media)return;for(const r of (await this.pool.query('SELECT key FROM v2_media_deletions LIMIT 20')).rows){await media.remove(r.key);await this.pool.query('DELETE FROM v2_media_deletions WHERE key=$1',[r.key]);}}
 async evidence(id,actor){return (await this.pool.query("SELECT evidence_key FROM v2_drafts WHERE id=$1 AND group_id=ANY($2::text[]) AND status!='revoked'",[id,actor.groups])).rows[0]?.evidence_key;}
 async prune(){
  await this.pool.query("INSERT INTO v2_media_deletions(key) SELECT 'farm/' || encode(sha256(convert_to(group_id,'UTF8')),'hex') || '/' || encode(sha256(convert_to(message_id,'UTF8')),'hex') || '.image' FROM v2_events WHERE kind='image' AND status IN ('done','failed','revoked') AND created_at<now()-interval '30 days' ON CONFLICT DO NOTHING");
  // Minimise source retention in the pilot; approved structured records remain.
  await this.pool.query("INSERT INTO v2_media_deletions(key) SELECT evidence_key FROM v2_drafts WHERE evidence_key IS NOT NULL AND created_at<now()-interval '30 days' ON CONFLICT DO NOTHING");
  await this.pool.query("UPDATE v2_drafts SET evidence_key=NULL,evidence_hash=NULL WHERE created_at<now()-interval '30 days'");
  await this.pool.query("UPDATE v2_events SET body=NULL WHERE status IN ('done','revoked','failed') AND created_at<now()-interval '30 days'");
 }
}
