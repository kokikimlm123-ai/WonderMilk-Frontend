import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
export const hash=v=>createHash('sha256').update(v).digest('hex');
export class Problem extends Error {constructor(status,code){super(code);this.status=status;}}
export const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function verify(raw,signature,secret){return !!secret&&typeof signature==='string'&&equal(createHmac('sha256',secret).update(raw).digest('base64'),signature);}
export function configuration(e=process.env){
 if(e.V2_ENV!=='development')throw new Error('V2 pilot requires V2_ENV=development');
 if(e.RAILWAY_ENVIRONMENT_NAME&&e.RAILWAY_ENVIRONMENT_NAME!=='development')throw new Error('Refusing a non-development Railway environment');
 const groups=JSON.parse(e.V2_GROUPS_JSON||'[]'), reviewers=JSON.parse(e.V2_REVIEWERS_JSON||'[]');
 if(!Array.isArray(groups)||groups.length>50||!Array.isArray(reviewers))throw new Error('Invalid V2 registry');
 const ids=new Set();
 for(const g of groups){if(!/^C[0-9a-f]{32}$/i.test(g.id)||!['Farm 2','Farm 4','Ryokusan'].includes(g.farm)||g.module!=='farm'||typeof g.enabled!=='boolean'||ids.has(g.id))throw new Error('Invalid group mapping');ids.add(g.id);}
 const actors=new Set();for(const r of reviewers){if(!/^[a-f0-9]{64}$/.test(r.tokenHash)||typeof r.actor!=='string'||!r.actor||actors.has(r.actor)||!Array.isArray(r.groups)||!r.groups.length||r.groups.some(g=>!ids.has(g)))throw new Error('Invalid reviewer');actors.add(r.actor);}
 const aiLimit=Number(e.V2_AI_CALLS_PER_DAY||20);if(!Number.isInteger(aiLimit)||aiLimit<0||aiLimit>1000)throw new Error('Invalid AI limit');
 return {port:Number(e.PORT||3000),database:e.V2_DATABASE_URL,groups,reviewers,enabled:e.V2_INTAKE_ENABLED==='true',secret:e.V2_LINE_CHANNEL_SECRET||'',lineToken:e.V2_LINE_CHANNEL_ACCESS_TOKEN||'',aiKey:e.V2_OPENAI_API_KEY||'',model:e.V2_OPENAI_MODEL||'',aiEnabled:e.V2_AI_ENABLED==='true',aiLimit,bucket:e.V2_S3_BUCKET||'',endpoint:e.V2_S3_ENDPOINT||'',region:e.V2_S3_REGION||'auto',accessKeyId:e.V2_S3_ACCESS_KEY_ID||'',secretAccessKey:e.V2_S3_SECRET_ACCESS_KEY||''};
}
export function reviewer(c,authorization){
 const token=typeof authorization==='string'&&authorization.match(/^Bearer ([A-Za-z0-9_-]{32,200})$/)?.[1];
 return token?c.reviewers.find(r=>equal(r.tokenHash,hash(token))):undefined;
}
export const recordFields=['kind','date','cow_id','session','group_name','feed_name','pregnancy_result','milk_kg','cows_milked','leftover_kg','delivered_kg','notes'];
export function validateRecords(records){
 const errors=[];
 if(!Array.isArray(records)||records.length<1||records.length>40)return ['records_required_1_to_40'];
 records.forEach((r,i)=>{
  const error=s=>errors.push(`${i}:${s}`);
  if(!r||typeof r!=='object'||Array.isArray(r)){error('record_object_required');return;}
  if(Object.keys(r).some(k=>!recordFields.includes(k)))error('unknown_field');
  if(!['pregnancy','milk','feed_leftover'].includes(r.kind))error('invalid_kind');
  if(typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date)error('explicit_valid_date_required');
  for(const k of ['cow_id','session','group_name','feed_name','notes'])if(r[k]!=null&&(typeof r[k]!=='string'||!r[k].trim()||r[k].length>(k==='notes'?1000:100)))error(`invalid_${k}`);
  for(const k of ['milk_kg','cows_milked','leftover_kg','delivered_kg'])if(r[k]!=null&&(typeof r[k]!=='number'||!Number.isFinite(r[k])||r[k]<0))error(`invalid_${k}`);
  if(r.cows_milked!=null&&!Number.isInteger(r.cows_milked))error('cow_count_integer_required');
  if(r.kind==='pregnancy'&&(!r.cow_id||!['pregnant','open','uncertain'].includes(r.pregnancy_result)))error('cow_and_pregnancy_result_required');
  if(r.kind==='milk'&&(r.milk_kg==null||!r.session))error('milk_kg_and_session_required');
  if(r.kind==='feed_leftover'&&(r.leftover_kg==null||!r.session||!r.group_name||!r.feed_name))error('leftover_kg_session_group_feed_required');
  const allowed={pregnancy:['pregnancy_result'],milk:['milk_kg','cows_milked'],feed_leftover:['leftover_kg','delivered_kg']}[r.kind]||[];
  for(const k of ['pregnancy_result','milk_kg','cows_milked','leftover_kg','delivered_kg'])if(r[k]!=null&&!allowed.includes(k))error(`incompatible_${k}`);
  if(r.leftover_kg!=null&&r.delivered_kg!=null&&r.leftover_kg>r.delivered_kg)error('leftover_exceeds_delivered');
 });return errors;
}
export function identity(group,farm,r){return hash(JSON.stringify([farm,r.kind,r.date,r.cow_id||'',(r.session||'').trim().toLowerCase(),(r.group_name||'').trim().toLowerCase(),(r.feed_name||'').trim().toLowerCase()]));}
const labels={type:'kind',record_type:'kind','အမျိုးအစား':'kind','ประเภท':'kind','ရက်စွဲ':'date','วันที่':'date','နွားနံပါတ်':'cow_id','รหัสโค':'cow_id','အချိန်ပိုင်း':'session','รอบ':'session','အုပ်စု':'group_name','กลุ่ม':'group_name','အစာ':'feed_name','อาหาร':'feed_name','ကိုယ်ဝန်ရလဒ်':'pregnancy_result','ผลตรวจท้อง':'pregnancy_result','နို့_kg':'milk_kg','น้ำนม_kg':'milk_kg','အစာကျန်_kg':'leftover_kg','อาหารเหลือ_kg':'leftover_kg','အစာပေး_kg':'delivered_kg','อาหารให้_kg':'delivered_kg'};
const kinds={'pregnancy':'pregnancy','ကိုယ်ဝန်':'pregnancy','ตรวจท้อง':'pregnancy','milk':'milk','နို့':'milk','น้ำนม':'milk','feed_leftover':'feed_leftover','အစာကျန်':'feed_leftover','อาหารเหลือ':'feed_leftover'};
const results={'pregnant':'pregnant','ကိုယ်ဝန်ရှိ':'pregnant','ท้อง':'pregnant','open':'open','ကိုယ်ဝန်မရှိ':'open','ไม่ท้อง':'open','uncertain':'uncertain','မသေချာ':'uncertain','ไม่แน่ใจ':'uncertain'};
export function structuredText(text){
 const records=[];let recognized=false,unknown=false;
 for(const block of text.trim().split(/\n\s*\n/)){
  const r={};let found=false;
  for(const part of block.split(/[;\n]/)){const m=part.trim().match(/^([^:=]+)\s*[:=]\s*(.+)$/);if(!m){if(part.trim())unknown=true;continue;}
   const raw=m[1].trim().toLowerCase(),key=labels[raw]||raw;if(!recordFields.includes(key)){unknown=true;continue;}if(Object.hasOwn(r,key)){unknown=true;continue;}
   found=true;let value=m[2].trim();value=value.replace(/[၀-၉]/g,c=>String(c.charCodeAt(0)-0x1040)).replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-0x0e50));
   if(['milk_kg','cows_milked','leftover_kg','delivered_kg'].includes(key)&&/^\d+(?:\.\d+)?$/.test(value))value=Number(value);
   r[key]=key==='kind'?kinds[value]||value:key==='pregnancy_result'?results[value]||value:value;
  }
  if(found){recognized=true;records.push(r);}
 }
 return {records,issues:[...(!recognized?['unstructured_text_requires_extraction']:[]),...(unknown?['unparsed_content_review_required']:[]),...validateRecords(records)],method:'structured-v1'};
}
export function normalizeEvent(e,c){
 const group=c.groups.find(g=>g.id===e?.source?.groupId);
 if(!group||e.source.type!=='group')return null;
 if(typeof e.webhookEventId!=='string'||!e.webhookEventId||e.webhookEventId.length>200||!Number.isFinite(e.timestamp)||e.timestamp>Date.now()+300000)throw new Problem(400,'invalid_event');
 if(e.type==='unsend'){if(typeof e.unsend?.messageId!=='string')throw new Problem(400,'invalid_unsend');return {id:e.webhookEventId,group:group.id,farm:group.farm,message:e.unsend.messageId,kind:'unsend',at:e.timestamp};}
 if(!group.enabled||e.type!=='message'||!['text','image'].includes(e.message?.type))return null;
 if(typeof e.message.id!=='string'||e.message.id.length>200)throw new Problem(400,'invalid_message');
 if(e.message.type==='text'&&(typeof e.message.text!=='string'||e.message.text.length>10000))throw new Problem(400,'invalid_text');
 return {id:e.webhookEventId,group:group.id,farm:group.farm,message:e.message.id,actor:e.source.userId||null,kind:e.message.type,text:e.message.text||null,at:e.timestamp};
}
