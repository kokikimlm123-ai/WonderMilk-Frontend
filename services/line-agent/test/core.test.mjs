import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {Store,verifySignature,validateRecord} from '../src/core.mjs';
import {createApp} from '../src/server.mjs';
import {Worker} from '../src/worker.mjs';
import {Google} from '../src/integrations.mjs';
const example=(extra={})=>({id:null,version:null,farm:'Farm 2',type:'milk',cow_id:'001',date:'2026-09-15',session:'AM',group_name:null,data:{milk_kg:12.5},...extra});
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'wm-test-')),store=new Store(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {store,dir};}

test('HMAC authenticates the exact raw bytes including Burmese, spacing, and newlines',()=>{
 const body=Buffer.from('{"စာ":"နို့"}\n'),secret='test-only-secret';
 const signature=createHmac('sha256',secret).update(body).digest('base64');
 assert.equal(verifySignature(body,signature,secret),true);
 assert.equal(verifySignature(Buffer.from('{"စာ":"နို့"}'),signature,secret),false);
 assert.equal(verifySignature(body,signature,'wrong'),false);
 assert.equal(verifySignature(body,'',''),false);
});
test('farm scope, ID strings, dates, units, and incomplete milk records are enforced',()=>{
 assert.equal(validateRecord(example()).cow_id,'001');
 for(const patch of [{farm:'Farm 1'},{farm:'Farm 5'},{cow_id:1},{date:'2026-02-30'},{data:{milk_kg:-1}},{data:{milk_kg:'12'}},{data:{notes:'no volume'}}])assert.throws(()=>validateRecord(example(patch)));
 assert.throws(()=>validateRecord(example({type:'milk_test',data:{scc:59}})));
 assert.throws(()=>validateRecord(example({type:'feed',data:{delivered_kg:100,leftover_kg:101}})));
});
test('event replay, natural-key duplicates, photo duplicates, and cross-farm IDs',t=>{
 const {store}=fixture(t);
 const a=store.mutate('event-1','Cgroup:Uone','create',[example()],'photo-sha');
 assert.equal(store.mutate('event-1','Cgroup:Uone','create',[example()],'photo-sha')[0].id,a[0].id);
 assert.throws(()=>store.mutate('event-2','Cgroup:Uone','create',[example()]));
 assert.throws(()=>store.mutate('event-3','Cgroup:Utwo','create',[example({date:'2026-09-16'})],'photo-sha'));
 store.mutate('event-4','Cgroup:Utwo','create',[example({farm:'Farm 4'})]);
 assert.equal(store.records(['Farm 2','Farm 4']).length,2);
 assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM changes').get().n,2);
});
test('batch writes roll back fully and edits record old/new values with optimistic versions',t=>{
 const {store}=fixture(t);
 assert.throws(()=>store.mutate('bad-batch','Cgroup:Uone','create',[example(),example({farm:'Farm 1'})]));
 assert.equal(store.records(['Farm 2']).length,0);
 const old=store.mutate('create','Cgroup:Uone','create',[example()])[0];
 const updated=store.mutate('edit','Cgroup:Utwo','update',[{...old,data:{milk_kg:14}}])[0];
 assert.equal(updated.version,2);assert.equal(updated.data.milk_kg,14);
 assert.throws(()=>store.mutate('stale','Cgroup:Uone','update',[{...old,data:{milk_kg:99}}]));
 assert.throws(()=>store.mutate('wrong-farm','Cgroup:Uone','update',[{...updated,farm:'Farm 4'}]));
 const audit=store.db.prepare("SELECT * FROM changes WHERE event='edit'").get();
 assert.equal(JSON.parse(audit.old_value).data.milk_kg,12.5);assert.equal(audit.actor,'Cgroup:Utwo');
});
test('only a one-time secret can bind the group; drafts are isolated by group and member',t=>{
 const {store}=fixture(t),code='test-code-12345678901234567890';
 assert.equal(store.bind('Cfirst','wrong',code),false);
 assert.equal(store.bind('Cfirst',code,code),true);
 assert.equal(store.bind('Csecond',code,code),false);
 store.saveDraft('Cfirst:Ua',{farm:'Farm 2'});
 assert.equal(store.draft('Cfirst:Ub'),null);assert.equal(store.draft('Csecond:Ua'),null);
});
test('real HTTP webhook verifies signatures, ignores other groups, and deduplicates durable events',async t=>{
 const {store}=fixture(t),secret='test-only-secret',c={secret,enabled:true,group:'Callowed',pairing:''};
 const server=createApp(c,store);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}/webhook/line`;
 const post=async(events,bad=false)=>{const body=JSON.stringify({events});return fetch(url,{method:'POST',headers:{'x-line-signature':bad?'bad':createHmac('sha256',secret).update(body).digest('base64')},body});};
 assert.equal((await post([],true)).status,401);assert.equal((await post([])).status,200);
 const e={webhookEventId:'evt',type:'message',source:{type:'group',groupId:'Callowed',userId:'Uone'},message:{type:'text',text:'/help'},timestamp:Date.now()};
 assert.equal((await post([e])).status,200);assert.equal((await post([e])).status,200);
 await post([{...e,webhookEventId:'other',source:{...e.source,groupId:'Cother'}}]);
 assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM events').get().n,1);
});
test('worker clarifies uncertain OCR without writing, then accepts only the same member continuation',async t=>{
 const {store,dir}=fixture(t),c={dir,group:'Cg',enabled:true,secret:'x',token:'x',aiKey:'x',googleJSON:'x',pairing:'',sheet:'test',sourceIds:{cows:'test-cows',milkTests:'test-milk',dailyExcel:'test-daily'}};
 const plans=[{action:'clarify',farms:['Farm 2'],question:'milk?',issues:['နို့ kg ပြောပါ'],records:[]},{action:'create',farms:['Farm 2'],question:'',issues:[],records:[example()]}];
 const ai={plan:async()=>plans.shift()},google={sync:async()=>store.db.prepare('UPDATE changes SET synced=1').run()},line={send:async()=>{}};
 const w=new Worker(c,store,google,ai,line);
 const evt=(id,user,text)=>({webhookEventId:id,type:'message',timestamp:Date.now(),source:{type:'group',groupId:'Cg',userId:user},message:{type:'text',text,mention:{mentionees:[{isSelf:true}]}}});
 store.enqueue([evt('a','Uone','/add milk')]);await w.tick();assert.equal(store.records(['Farm 2']).length,0);
 const unrelated=evt('b','Utwo','12.5 kg');delete unrelated.message.mention;store.enqueue([unrelated]);await w.tick();assert.equal(plans.length,1);
 store.enqueue([evt('c','Uone','12.5 kg')]);await w.tick();assert.equal(store.records(['Farm 2']).length,1);
 assert.equal(store.draft('Cg:Uone'),null);
});
test('Sheets sync uses RAW strings and refuses duplicate row IDs or stale overwrites',async()=>{
 const g=new Google({sheet:'test'});let calls=[];
 g.grid=async()=>({rowCount:1000});
 g.values=async()=>[['ID'],['rec','','','','','','','','3']];
 g.request=async(...args)=>{calls.push(args);return {};};
 await g.upsertRow('Agent_Records','rec',['rec','','','','','','','=1+1',2],8);assert.equal(calls.length,0);
 await g.upsertRow('Agent_Records','rec',['rec','','','','','','','=1+1',4],8);
 assert.equal(calls[0][1].valueInputOption,'RAW');assert.equal(calls[0][1].data[0].values[0][7],'=1+1');
 g.values=async()=>[['ID'],['rec'],['rec']];await assert.rejects(()=>g.upsertRow('Agent_Records','rec',['rec']));
});
test('read clarification retains original query, retrieves evidence without writes, and fresh commands reset context',async t=>{
 const {store,dir}=fixture(t),c={dir,group:'Cg',enabled:true,secret:'x',token:'x',aiKey:'x',googleJSON:'x',sheet:'test',sourceIds:{cows:'c',milkTests:'m',dailyExcel:'d'}};
 const query='/farm Farm 2 နို့စုစုပေါင်း kg ရှာပြပါ';
 let calls=0,reads=0;
 const ai={plan:async(text,context)=>{
   calls++;
   if(calls===1)return {action:'clarify',farms:['Farm 2'],question:'ဘယ်ရက်လဲ?',issues:[],records:[]};
   if(calls===2)assert.equal(context.original_message,query);
   if(calls===3)assert.equal(context.original_message,null);
   return {action:'ask',farms:['Farm 2'],type:'milk',cow_id:null,date_from:'2026-08-12',date_to:'2026-08-12',question:'Farm 2 milk total on 2026-08-12',issues:[],records:[]};
 },answer:async(q,e)=>{assert.match(q,/2026-08-12/);assert.equal(e.historical_sources[0].total,123);return '123 kg';}};
 const w=new Worker(c,store,{sources:async p=>{reads++;assert.equal(p.type,'milk');return [{total:123}];}},ai,{send:async()=>{}});
 async function send(id,text){store.enqueue([{webhookEventId:id,type:'message',timestamp:Date.now(),source:{type:'group',groupId:'Cg',userId:'Uone'},message:{type:'text',text,mention:{mentionees:[{isSelf:true}]}}}]);await w.tick();}
 await send('read1',query);
 await send('read2','2026-08-12');
 assert.equal(reads,1);assert.equal(store.records(['Farm 2']).length,0);
 store.saveDraft('Cg:Uone',{mode:'clarify',original_message:'stale mutation'});
 await send('read3','/ask Farm 2 milk total on 2026-08-12');
 assert.equal(reads,2);assert.equal(store.records(['Farm 2']).length,0);
});
test('unmentioned commands, clarification replies and photos stay silent; real mentions route by language',async t=>{
 const {store,dir}=fixture(t),c={dir,group:'Cg',enabled:true,secret:'x',token:'x',aiKey:'x',googleJSON:'x',sheet:'test',sourceIds:{cows:'c',milkTests:'m',dailyExcel:'d'}};
 let plans=0,photos=0;
 const w=new Worker(c,store,{sources:async()=>[]},{plan:async(text,ctx)=>{
 plans++;assert.equal(text,'Farm 2 milk total');assert.equal(ctx.language,'en');
 return {action:'ask',farms:['Farm 2'],issues:[],records:[],question:text};
 },answer:async(q,e,lang)=>{assert.equal(lang,'en');return 'No records';}},{image:async()=>{photos++;},send:async()=>{}});
 async function send(id,message){store.enqueue([{webhookEventId:id,type:'message',timestamp:Date.now(),source:{type:'group',groupId:'Cg',userId:'Uone'},message}]);await w.tick();}
 store.saveDraft('Cg:Uone',{mode:'clarify'});
 await send('silent1',{type:'text',text:'/help'});
 await send('silent2',{type:'text',text:'/farm Farm 2 milk'});
 await send('silent3',{type:'text',text:'2026-08-12'});
 await send('silent4',{type:'image',id:'123'});
 assert.equal(plans,0);assert.equal(photos,0);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM outgoing').get().n,0);
 await send('mention',{type:'text',text:'@Bot Farm 2 milk total',mention:{mentionees:[{isSelf:true,index:0,length:4}]}});
 assert.equal(plans,1);
 await send('typed-long',{type:'text',text:'@Wonder Milk Farm AI Farm 2 milk total'});
 await send('typed-short',{type:'text',text:'@WM Farm 2 milk total'});
 assert.equal(plans,3);
 await send('not-prefix',{type:'text',text:'Tell @WM Farm 2 milk total'});
 await send('other-name',{type:'text',text:'@WMarket Farm 2 milk total'});
 assert.equal(plans,3);
});
test('language detection supports Burmese, Thai and English',async()=>{
 const {replyLanguage}=await import('../src/worker.mjs');
 assert.equal(replyLanguage('Farm 2 နို့စုစုပေါင်း'),'my');
 assert.equal(replyLanguage('Farm 2 น้ำนมทั้งหมด'),'th');
 assert.equal(replyLanguage('Farm 2 milk total'),'en');
 assert.equal(replyLanguage('2026-08-12','th'),'th');
});

test('long PDF lists queue every link once across LINE messages',t=>{
 const {store}=fixture(t);const text=Array.from({length:66},(_,i)=>`Lab ${i}\nhttps://drive.google.com/file/d/${'a'.repeat(80)}${i}/view\n`).join('\n');
 store.out('pdf-list','Cgroup',text);store.out('pdf-list','Cgroup',text);
 const rows=store.db.prepare('SELECT text FROM outgoing ORDER BY created').all();
 assert.ok(rows.length>1);assert.ok(rows.every(r=>r.text.length<=4900));assert.equal((rows.map(r=>r.text).join('\n').match(/https:\/\/drive/g)||[]).length,66);
});
