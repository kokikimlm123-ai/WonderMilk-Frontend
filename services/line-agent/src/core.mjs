import {DatabaseSync} from 'node:sqlite';
import {createHmac,timingSafeEqual,createHash,randomUUID} from 'node:crypto';
import {mkdirSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {FARMS} from './config.mjs';

export class UserError extends Error {}
export function verifySignature(raw,signature,secret) {
  if (!secret||typeof signature!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const actual=Buffer.from(signature,'base64');
  const expected=createHmac('sha256',secret).update(raw).digest();
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export function sameSecret(a,b) {
  if(!a||!b)return false;
  return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
}
export function validDate(d) {
  return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
}
export const FIELDS={
  cow:['birth_date','calving_date','lactation_number','repro_status','herd_status','fulink_id','barn','notes','ai_date','dry_date','dim'],
  milk:['milk_kg','sold_kg','calf_kg','discard_kg','cows_milked','session_start','session_end','notes'],
  feed:['feed_name','delivered_kg','leftover_kg','dm_percent','cow_count','ration_version','ingredient_weights','notes'],
  health:['event_type','treatment','withholding_until','semen_id','semen_breed','pregnancy_result','cmt_score','bcs','notes'],
  environment:['temperature_c','humidity_percent','thi','source','notes'],
  milk_test:['fat_percent','snf_percent','protein_percent','lactose_percent','scc','scc_unit','cleanliness','collector','notes'],
};
export function validateRecord(r) {
  if(!r||!FARMS.includes(r.farm))throw new UserError('Farm 2၊ Farm 4၊ Ryokusan သုံးခုကိုသာ အသုံးပြုနိုင်ပါတယ်။');
  if(!Object.hasOwn(FIELDS,r.type))throw new UserError('စာရင်းအမျိုးအစား မသေချာပါ။');
  if(r.cow_id!==null&&(typeof r.cow_id!=='string'||!r.cow_id.trim()||r.cow_id.length>80))throw new UserError('Cow ID ကို စာသားအတိုင်း ထည့်ပါ။');
  if(['cow','health'].includes(r.type)&&!r.cow_id)throw new UserError('Cow ID လိုပါတယ်။');
  if(r.date!==null&&!validDate(r.date))throw new UserError('ရက်စွဲကို YYYY-MM-DD နဲ့ ပြန်ပေးပါ။');
  if(r.type!=='cow'&&!r.date)throw new UserError('စာရင်းရက်စွဲ လိုပါတယ်။');
  for(const k of ['session','group_name'])if(r[k]!==null&&(typeof r[k]!=='string'||r[k].length>100))throw new UserError('Session / group အမည် မမှန်ပါ။');
  if(!r.data||typeof r.data!=='object'||Array.isArray(r.data)||Object.keys(r.data).length===0)throw new UserError('သိမ်းရန် အချက်အလက် မရှိပါ။');
  for(const [k,v] of Object.entries(r.data)) {
    if(!FIELDS[r.type].includes(k)||v===null||!['string','number','boolean'].includes(typeof v))throw new UserError(`Field မမှန်ပါ: ${k}`);
    if(typeof v==='string'&&v.length>3000)throw new UserError('စာရင်းတစ်ခုမှာ စာအလွန်များနေပါတယ်။');
    if(typeof v==='number'&&(!Number.isFinite(v)||(v<0&&k!=='temperature_c')))throw new UserError(`ကိန်းဂဏန်း ပြန်စစ်ပါ: ${k}`);
    if((k.endsWith('_kg')||k.endsWith('_percent')||['cows_milked','cow_count','dim','scc','thi','temperature_c','lactation_number'].includes(k))&&typeof v!=='number')throw new UserError(`ကိန်းဂဏန်း လိုပါတယ်: ${k}`);
    if(['cows_milked','cow_count','dim','lactation_number'].includes(k)&&!Number.isInteger(v))throw new UserError(`ကိန်းပြည့် လိုပါတယ်: ${k}`);
    if(k.endsWith('_percent')&&(v<0||v>100))throw new UserError('ရာခိုင်နှုန်း 0–100 အတွင်း ဖြစ်ရပါမယ်။');
    if((k.endsWith('_date')||k==='withholding_until')&&!validDate(v))throw new UserError(`ရက်စွဲ မမှန်ပါ: ${k}`);
  }
  if(r.type==='milk'&&!Object.keys(r.data).some(k=>k.endsWith('_kg')))throw new UserError('နို့ပမာဏ kg လိုပါတယ်။');
  if(r.type==='feed'&&r.data.leftover_kg!==undefined&&r.data.delivered_kg!==undefined&&r.data.leftover_kg>r.data.delivered_kg)throw new UserError('အစာကျန်ပမာဏက ပေးထားသောအစာထက် များနေပါတယ်။ ပြန်စစ်ပါ။');
  if(r.type==='milk_test'&&r.data.scc!==undefined&&!r.data.scc_unit)throw new UserError('SCC ရဲ့ unit ကို ပြောပေးပါ။');
  return {...r,cow_id:r.cow_id?.trim()||null,date:r.type==='cow'?null:r.date};
}
function identity(r) {
  if(r.type==='health')return null;
  return JSON.stringify([r.farm,r.type,r.cow_id||'',r.type==='cow'?'':r.date,r.session||'',r.group_name||'',r.type==='feed'?r.data.feed_name||'':r.type==='milk_test'?r.data.collector||'':'']);
}
export class Store {
  constructor(dir) {
    mkdirSync(dir,{recursive:true,mode:0o700});
    this.db=new DatabaseSync(join(dir,'agent.sqlite'));chmodSync(join(dir,'agent.sqlite'),0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,payload TEXT,status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,plan TEXT,error TEXT);
      CREATE TABLE IF NOT EXISTS drafts(actor TEXT PRIMARY KEY,value TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,identity TEXT UNIQUE,value TEXT NOT NULL,version INTEGER NOT NULL,updated TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS changes(id TEXT PRIMARY KEY,event TEXT NOT NULL,record_id TEXT NOT NULL,actor TEXT NOT NULL,old_value TEXT,new_value TEXT NOT NULL,at TEXT NOT NULL,synced INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS operations(event TEXT PRIMARY KEY,result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outgoing(id TEXT PRIMARY KEY,group_id TEXT NOT NULL,text TEXT NOT NULL,retry_key TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',created INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS usage(day TEXT PRIMARY KEY,calls INTEGER NOT NULL DEFAULT 0,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0);
    `);
    // One process and one replica only; committed operations remain idempotent on replay.
    this.db.prepare("UPDATE events SET status='queued' WHERE status='processing'").run();
  }
  close(){this.db.close();}
  setting(k){return this.db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value;}
  set(k,v){this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,v);}
  bind(group,code,configuredCode) {
    if(this.setting('group'))return this.setting('group')===group;
    if(configuredCode.length<24||!sameSecret(code,configuredCode))return false;
    this.set('group',group);return true;
  }
  enqueue(events) {
    this.db.exec('BEGIN IMMEDIATE');let count=0;
    try {
      for(const e of events) {
        if(typeof e.webhookEventId!=='string'||e.webhookEventId.length>200)throw new Error('Missing webhookEventId');
        count+=Number(this.db.prepare('INSERT OR IGNORE INTO events(id,payload,created) VALUES(?,?,?)').run(e.webhookEventId,JSON.stringify(e),Date.now()).changes);
      }
      this.db.exec('COMMIT');return count;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  next() {
    const e=this.db.prepare("SELECT * FROM events WHERE status='queued' ORDER BY created,id LIMIT 1").get();
    if(e)this.db.prepare("UPDATE events SET status='processing',attempts=attempts+1 WHERE id=?").run(e.id);
    return e;
  }
  finish(id,status='done',error=null){this.db.prepare('UPDATE events SET status=?,error=?,payload=NULL,plan=NULL WHERE id=?').run(status,error,id);}
  draft(actor){const d=this.db.prepare('SELECT * FROM drafts WHERE actor=? AND expires>?').get(actor,Date.now());return d?JSON.parse(d.value):null;}
  saveDraft(actor,v){this.db.prepare('INSERT INTO drafts VALUES(?,?,?) ON CONFLICT(actor) DO UPDATE SET value=excluded.value,expires=excluded.expires').run(actor,JSON.stringify(v),Date.now()+15*60*1000);}
  clearDraft(actor){this.db.prepare('DELETE FROM drafts WHERE actor=?').run(actor);}
  records(farms,{cow_id=null,type=null,date_from=null,date_to=null}={}) {
    return this.db.prepare('SELECT value FROM records ORDER BY updated DESC').all().map(r=>JSON.parse(r.value))
      .filter(r=>farms.includes(r.farm)&&(!cow_id||r.cow_id===cow_id)&&(!type||r.type===type)&&(!date_from||!r.date||r.date>=date_from)&&(!date_to||!r.date||r.date<=date_to));
  }
  mutate(event,actor,action,proposals,photoHash=null) {
    const done=this.db.prepare('SELECT result FROM operations WHERE event=?').get(event);
    if(done)return JSON.parse(done.result);
    if(!['create','update'].includes(action)||!Array.isArray(proposals)||proposals.length<1||proposals.length>40)throw new UserError('တစ်ကြိမ်လျှင် စာရင်း 1–40 ခု ထည့်နိုင်ပါတယ်။');
    this.db.exec('BEGIN IMMEDIATE');const changed=[];
    try {
      if(photoHash&&this.setting(`photo:${photoHash}`))throw new UserError('ဒီဓာတ်ပုံကို သိမ်းပြီးသားပါ။ /records နဲ့ စစ်နိုင်ပါတယ်။');
      for(const [i,p] of proposals.entries()) {
        let old=null;
        if(action==='update') {
          if(!p.id)throw new UserError('ပြင်ရန် Record ID လိုပါတယ်။ /records နဲ့ အရင်ရှာပါ။');
          const found=this.db.prepare('SELECT value FROM records WHERE id=?').get(p.id);
          if(!found)throw new UserError('Bot မှသွင်းထားသော Record ID မတွေ့ပါ။ မူလဖိုင်ကို တိုက်ရိုက်မပြင်သေးပါ။');
          old=JSON.parse(found.value);
          if(old.farm!==p.farm||old.type!==p.type||old.cow_id!==p.cow_id)throw new UserError('Farm / Cow ID / အမျိုးအစားကို ပြောင်း၍ မပြင်နိုင်ပါ။');
          if(p.version!==old.version)throw new UserError('စာရင်း version ပြောင်းသွားပါတယ်။ /records နဲ့ ပြန်ဖတ်ပြီး ပြင်ပါ။');
        }
        const r=validateRecord({...old,...p,data:{...old?.data,...p.data}});
        const id=old?.id||randomUUID(),version=(old?.version||0)+1,at=new Date().toISOString();
        const value={...r,id,version,updated_at:at,actor,source_event:event};
        try {
          this.db.prepare('INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET identity=excluded.identity,value=excluded.value,version=excluded.version,updated=excluded.updated')
            .run(id,identity(value),JSON.stringify(value),version,at);
        }catch(e){if(String(e).includes('UNIQUE'))throw new UserError('ဒီ Farm၊ Cow ID၊ ရက်စွဲ၊ session အတွက် စာရင်းရှိပြီးသားပါ။ /records နဲ့ ရှာပြီး ပြင်ပါ။');throw e;}
        this.db.prepare('INSERT INTO changes(id,event,record_id,actor,old_value,new_value,at) VALUES(?,?,?,?,?,?,?)')
          .run(`${event}:${i}`,event,id,actor,old?JSON.stringify(old):null,JSON.stringify(value),at);
        changed.push(value);
      }
      this.db.prepare('INSERT INTO operations VALUES(?,?)').run(event,JSON.stringify(changed));
      if(photoHash)this.set(`photo:${photoHash}`,event);
      this.db.exec('COMMIT');return changed;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  out(id,group,text) {
    const chunks=[];let rest=String(text);
    while(rest.length>4800){let end=rest.lastIndexOf('\n',4800);if(end<1)end=4800;if(/[\uD800-\uDBFF]/.test(rest[end-1]))end--;chunks.push(rest.slice(0,end));rest=rest.slice(end).replace(/^\n/,'');}
    if(rest)chunks.push(rest);
    chunks.forEach((chunk,i)=>this.db.prepare('INSERT OR IGNORE INTO outgoing(id,group_id,text,retry_key,created) VALUES(?,?,?,?,?)').run(i?`${id}:part:${i}`:id,group,chunk,randomUUID(),Date.now()+i));
  }
  takeAiCall(day,max){this.db.prepare('INSERT OR IGNORE INTO usage(day) VALUES(?)').run(day);return Number(this.db.prepare('UPDATE usage SET calls=calls+1 WHERE day=? AND calls<?').run(day,max).changes)===1;}
  addUsage(day,u){this.db.prepare('UPDATE usage SET input_tokens=input_tokens+?,output_tokens=output_tokens+? WHERE day=?').run(Number(u?.input_tokens)||0,Number(u?.output_tokens)||0,day);}
}
