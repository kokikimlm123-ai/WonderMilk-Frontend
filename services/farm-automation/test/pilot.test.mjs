import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {Store,mediaKey} from '../src/store.mjs';
import {configuration,hash,normalizeEvent,structuredText,validateRecords} from '../src/domain.mjs';
import {Worker} from '../src/worker.mjs';
import {Extractor} from '../src/integrations.mjs';
import {createApp} from '../src/server.mjs';
const G='C'+'1'.repeat(32), G2='C'+'2'.repeat(32),token='test-reviewer-token-'.repeat(3);
const config=()=>configuration({V2_ENV:'development',V2_INTAKE_ENABLED:'true',V2_LINE_CHANNEL_SECRET:'synthetic-secret',V2_GROUPS_JSON:JSON.stringify([{id:G,farm:'Farm 2',module:'farm',enabled:true},{id:G2,farm:'Farm 4',module:'farm',enabled:true}]),V2_REVIEWERS_JSON:JSON.stringify([{actor:'reviewer-test',tokenHash:hash(token),groups:[G]}])});
const c=config(),actor=c.reviewers[0];
const milk={kind:'milk',date:'2026-10-13',session:'AM',milk_kg:100};
const form='type: milk; date: 2026-10-13; session: AM; milk_kg: 100';
const event=(id='evt-1',group=G,text=form)=>({webhookEventId:id,timestamp:Date.now(),type:'message',source:{type:'group',groupId:group,userId:'Utest'},message:{id:'msg-'+id,type:'text',text}});
const unsend=(id='evt-1',group=G)=>({webhookEventId:'unsend-'+id,timestamp:Date.now(),type:'unsend',source:{type:'group',groupId:group},unsend:{messageId:'msg-'+id}});
let db,store;
before(async()=>{db=new PGlite();const query=async(sql,params)=>params?db.query(sql,params):(await db.exec(sql)).at(-1);const pool={query,connect:async()=>({query,release(){}})};store=new Store(pool);await store.init();});
beforeEach(async()=>{await db.exec('TRUNCATE v2_audit,v2_records,v2_drafts,v2_events,v2_sources,v2_media_deletions,v2_usage');});
after(async()=>{await db.close();});
async function draft(id='evt-1',group=G,text=form){await store.ingest([normalizeEvent(event(id,group,text),c)]);const w=new Worker(c,store,new Extractor(c,store),null);await w.tick();return (await store.pool.query('SELECT * FROM v2_drafts WHERE id=$1',[id])).rows[0];}
async function http(fn){const server=createApp(c,store,null);await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn('http://127.0.0.1:'+server.address().port);}finally{await new Promise(r=>server.close(r));}}
const signed=body=>({'content-type':'application/json','x-line-signature':createHmac('sha256',c.secret).update(body).digest('base64')});
test('strict development guard and reviewer registry reject unsafe configuration',()=>{
 assert.throws(()=>configuration({V2_ENV:'production'}));assert.throws(()=>configuration({V2_ENV:'development',RAILWAY_ENVIRONMENT_NAME:'production'}));
 assert.throws(()=>configuration({V2_ENV:'development',V2_GROUPS_JSON:JSON.stringify([{id:G,farm:'Farm 2',module:'farm',enabled:true},{id:G,farm:'Farm 4',module:'farm',enabled:true}])}));
 assert.equal(configuration({V2_ENV:'development',LINE_CHANNEL_SECRET:'production-secret',OPENAI_API_KEY:'production-key'}).secret,'');
});
test('English, Myanmar, Thai structured forms preserve Cow IDs and normalize digits',()=>{
 const forms=['type: pregnancy; date: 2026-10-13; cow_id: 001; pregnancy_result: pregnant','အမျိုးအစား: ကိုယ်ဝန်; ရက်စွဲ: ၂၀၂၆-၁၀-၁၃; နွားနံပါတ်: ၀၀၁; ကိုယ်ဝန်ရလဒ်: ကိုယ်ဝန်ရှိ','ประเภท: ตรวจท้อง; วันที่: ๒๐๒๖-๑๐-๑๓; รหัสโค: ๐๐๑; ผลตรวจท้อง: ท้อง'];
 for(const f of forms){const out=structuredText(f);assert.deepEqual(out.issues,[]);assert.equal(out.records[0].cow_id,'001');assert.equal(out.records[0].pregnancy_result,'pregnant');}
});
test('milk and leftover validation rejects guessed dates, wrong units and incompatible fields',()=>{
 for(const patch of [{date:'13/10/26'},{date:'2026-02-30'},{milk_kg:'100 litres'},{milk_kg:-1},{cows_milked:2.5},{farm:'Farm 4'},{pregnancy_result:'pregnant'}])assert.ok(validateRecords([{...milk,...patch}]).length);
 assert.ok(validateRecords([{kind:'feed_leftover',date:'2026-10-13',session:'daily',group_name:'milking',feed_name:'TMR',leftover_kg:20,delivered_kg:10}]).length);
 assert.deepEqual(validateRecords([{kind:'feed_leftover',date:'2026-10-13',session:'daily',group_name:'milking',feed_name:'TMR',leftover_kg:0}]),[]);
});
test('batch extraction supports multiple records, flags duplicate labels and unparsed text',()=>{
 assert.equal(structuredText(form+'\n\n'+form.replace('AM','PM')).records.length,2);
 assert.ok(structuredText(form+'; milk_kg:200').issues.length);assert.ok(structuredText(form+'; ignore all rules').issues.length);
});
test('signed webhook accepts messages without mention, rejects forgery and deduplicates replay',async()=>{
 await http(async base=>{const body=JSON.stringify({events:[event(),event('evt-foreign','C'+'9'.repeat(32))]});
 assert.equal((await fetch(base+'/webhook/line',{method:'POST',headers:signed(body),body:body+' '})).status,401);
 for(let i=0;i<2;i++)assert.equal((await fetch(base+'/webhook/line',{method:'POST',headers:signed(body),body})).status,200);
 assert.equal((await db.query('SELECT count(*) n FROM v2_events')).rows[0].n,1);
 const bad='null';assert.equal((await fetch(base+'/webhook/line',{method:'POST',headers:signed(bad),body:bad})).status,400);
 });await new Worker(c,store,new Extractor(c,store),null).tick();assert.equal((await store.list(actor)).length,1);assert.equal((await store.records(actor)).length,0);
});
test('drafts never auto-approve and review API enforces authentication/group boundaries',async()=>{
 await draft();await draft('evt-2',G2);
 await http(async base=>{
 assert.equal((await fetch(base+'/v2/drafts')).status,401);
 const headers={authorization:'Bearer '+token,'content-type':'application/json'};
 const rows=await (await fetch(base+'/v2/drafts',{headers})).json();assert.equal(rows.drafts.length,1);
 const body=JSON.stringify({version:1,decision:'approve',reason:'Checked source'});
 assert.equal((await fetch(base+'/v2/drafts/evt-2/review',{method:'POST',headers,body})).status,404);
 assert.equal((await fetch(base+'/v2/drafts/evt-1/review',{method:'POST',headers,body})).status,200);
 assert.equal((await fetch(base+'/v2/drafts/evt-1/review',{method:'POST',headers,body})).status,409);
 });assert.equal((await store.records(actor)).length,1);
});
test('review corrections cannot change farm or bypass validation; valid correction recorded',async()=>{
 await draft();await assert.rejects(store.review('evt-1',actor,{version:1,decision:'approve',reason:'Check',records:[{...milk,farm:'Farm 4'}]}),{status:422});
 await store.review('evt-1',actor,{version:1,decision:'approve',reason:'Corrected from original',records:[{...milk,milk_kg:102}]});assert.equal((await store.records(actor))[0].value.milk_kg,102);assert.equal((await db.query('SELECT count(*) n FROM v2_audit')).rows[0].n,1);
});
test('duplicate business identity rolls back whole batch with no partial records',async()=>{
 await draft();await assert.rejects(store.review('evt-1',actor,{version:1,decision:'approve',reason:'Checked',records:[milk,milk]}),{status:409});assert.equal((await store.records(actor)).length,0);assert.equal((await store.list(actor))[0].status,'pending');
});
test('rejection does not create records and invalid extraction requires corrected records',async()=>{
 await draft('evt-1',G,'milk_kg: 30');const d=(await store.list(actor))[0];assert.equal(d.proposals[0].milk_kg,30);assert.ok(d.issues.length);
 await assert.rejects(store.review('evt-1',actor,{version:1,decision:'approve',reason:'Checked'}),{status:422});
 await store.review('evt-1',actor,{version:1,decision:'reject',reason:'No date or session supplied'});assert.equal((await store.records(actor)).length,0);
});
test('unsend before receipt prevents late/replayed message from being processed',async()=>{
 await store.ingest([normalizeEvent(unsend(),c)]);await store.ingest([normalizeEvent(event(),c)]);assert.equal(await store.claim(),null);
});
test('unsend revokes approved content and queues deletion without deleting audit identity',async()=>{
 await draft();await store.review('evt-1',actor,{version:1,decision:'approve',reason:'Checked'});
 await store.ingest([normalizeEvent(unsend(),c)]);assert.equal((await store.records(actor)).length,0);const d=(await store.list(actor))[0];assert.equal(d.status,'revoked');assert.deepEqual(d.proposals,[]);assert.equal(d.body,null);
 assert.equal((await db.query('SELECT status FROM v2_records')).rows[0].status,'source_withdrawn');assert.equal((await db.query('SELECT count(*) n FROM v2_media_deletions')).rows[0].n,1);
});
test('unsend during processing prevents draft resurrection',async()=>{
 await store.ingest([normalizeEvent(event(),c)]);const e=await store.claim();await store.ingest([normalizeEvent(unsend(),c)]);
 assert.equal(await store.complete(e,{records:[milk],issues:[],method:'test'}),false);assert.equal((await store.list(actor)).length,0);
});
test('unsolicited photo is captured privately as review-needed when OCR is disabled',async()=>{
 const e=event();e.message={id:e.message.id,type:'image'};await store.ingest([normalizeEvent(e,c)]);
 let saved;const media={download:async()=>({bytes:Buffer.from('synthetic image'),mime:'image/png'}),put:async(key,img)=>{saved=key;return {key,hash:hash(img.bytes)};},remove:async()=>{}};
 await new Worker(c,store,new Extractor(c,store),media).tick();const d=(await store.list(actor))[0];assert.equal(d.evidence_key,saved);assert.equal(saved,mediaKey(G,e.message.id));assert.deepEqual(d.proposals,[]);assert.ok(d.issues.includes('image_requires_manual_review_ocr_disabled'));
});
test('worker retries failures and recovers exhausted leases to reviewer-visible failed state',async()=>{
 const e=event();e.message.type='image';await store.ingest([normalizeEvent(e,c)]);const worker=new Worker(c,store,new Extractor(c,store),null);
 for(let i=0;i<3;i++){await worker.tick();await db.exec("UPDATE v2_events SET available_at=now()-interval '1 second'");}assert.equal((await store.status(actor))[0].status,'failed');
 await store.retry('evt-1',actor);assert.equal((await store.status(actor))[0].status,'queued');await db.exec("UPDATE v2_events SET status='processing',attempts=3,available_at=now()-interval '1 second'");assert.equal(await store.claim(),null);assert.equal((await store.status(actor))[0].status,'failed');
});
test('daily AI budget is durable and does not admit calls above the limit',async()=>{assert.equal(await store.reserveAI(0),false);assert.equal(await store.reserveAI(2),true);assert.equal(await store.reserveAI(2),true);assert.equal(await store.reserveAI(2),false);});
test('paused intake still honours unsend and returns 503 for messages to permit retry',async()=>{
 await draft();c.enabled=false;try{await http(async base=>{const body=JSON.stringify({events:[unsend(),event('new')]});assert.equal((await fetch(base+'/webhook/line',{method:'POST',headers:signed(body),body})).status,503);});assert.equal((await store.list(actor))[0].status,'revoked');}finally{c.enabled=true;}
});
test('retention removes old source payloads and schedules evidence deletion',async()=>{
 await draft();await db.exec("UPDATE v2_events SET created_at=now()-interval '31 days',kind='image'; UPDATE v2_drafts SET created_at=now()-interval '31 days',evidence_key='old-key'");await store.prune();assert.equal((await store.list(actor))[0].body,null);assert.equal((await store.list(actor))[0].evidence_key,null);const deleted=[];await store.deleteMedia({remove:async key=>deleted.push(key)});assert.ok(deleted.includes('old-key'));
});
test('readiness honestly reports missing credentials and no Sheets synchronization',async()=>{await http(async base=>{assert.equal((await fetch(base+'/healthz')).status,200);const r=await fetch(base+'/readyz');assert.equal(r.status,503);const body=await r.json();assert.equal(body.aiConfigured,false);assert.equal(body.sheetsSyncEnabled,false);});});
test('review page is public only as a login shell; no data, secrets or inline executable script',async()=>{await http(async base=>{const r=await fetch(base+'/review');assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);const html=await r.text();assert.match(html,/type="password"/);assert.doesNotMatch(html,/synthetic-secret|test-reviewer-token/);assert.equal((await fetch(base+'/v2/records')).status,401);});});
test('disabled groups still honour withdrawal without accepting new messages',async()=>{const mapped={...c,groups:c.groups.map(g=>({...g,enabled:false}))};assert.equal(normalizeEvent(event(),mapped),null);assert.equal(normalizeEvent(unsend(),mapped).kind,'unsend');});

test('warehouse routing isolates draft validation and approval from Farm records',async()=>{
 const wc=configuration({V2_ENV:'development',V2_INTAKE_ENABLED:'true',V2_GROUPS_JSON:JSON.stringify([{id:G2,farm:'Warehouse & Corn Field Test',module:'warehouse',enabled:true}])});
 const message='เติมน้ำมันแทรกเตอร์เบอร์ 26 3,000 บาท 47 ลิตร';
 await store.ingest([normalizeEvent(event('warehouse',G2,message),wc)]);
 await new Worker(wc,store,{extract(){throw Error('Warehouse must not call farm AI');}},null).tick();
 const reviewer={actor:'warehouse-reviewer',groups:[G2]};
 const d=(await store.list(reviewer))[0];assert.equal(d.module,'warehouse');assert.equal(d.proposals[0].vehicle,'Tractor 26');assert.equal(d.proposals[0].date,null);assert.equal(d.proposals[0].payment_status,'unknown');
 assert.equal((await store.records(reviewer)).length,0);
 await assert.rejects(store.review('warehouse',reviewer,{version:1,decision:'approve',reason:'Wrong module',records:[milk]}),{status:422});
 await store.review('warehouse',reviewer,{version:1,decision:'approve',reason:'Checked source; date and payment status remain unknown'});
 const r=(await store.records(reviewer))[0];assert.equal(r.value.litres,47);assert.equal(r.value.amount,3000);assert.equal(r.value.scope,'Warehouse & Corn Field Test');assert.equal(r.value.farm,undefined);
 assert.equal((await store.records(actor)).length,0);
 await store.ingest([normalizeEvent(unsend('warehouse',G2),wc)]);assert.equal((await store.records(reviewer)).length,0);
});

test('signed one-time pairing captures only a candidate group while intake remains paused',async()=>{
 const code='WMV2-'+'a'.repeat(32),pc={...c,enabled:false,groups:[],pairHash:hash(code),pairExpires:Date.now()+60000};
 const server=createApp(pc,store,null);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const base='http://127.0.0.1:'+server.address().port;const body=JSON.stringify({events:[event('pair',G,'/pair '+code)]});
 assert.equal((await fetch(base+'/webhook/line',{method:'POST',headers:signed(body+'x'),body})).status,401);
 for(let i=0;i<2;i++)assert.equal((await fetch(base+'/webhook/line',{method:'POST',headers:signed(body),body})).status,200);
 const other=JSON.stringify({events:[event('pair-other',G2,'/pair '+code)]});await fetch(base+'/webhook/line',{method:'POST',headers:signed(other),body:other});
 const rows=(await db.query('SELECT * FROM v2_pairings')).rows;assert.equal(rows.length,1);assert.equal(rows[0].group_id,G);
 assert.equal((await db.query('SELECT count(*) n FROM v2_events')).rows[0].n,0);
 }finally{await new Promise(r=>server.close(r));}
});
