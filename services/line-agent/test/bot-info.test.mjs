import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {infoIntent,infoAnswer} from '../src/bot-info.mjs';
import {Store} from '../src/core.mjs';
import {Worker} from '../src/worker.mjs';

for(const [lang,help,updates,marker] of [
 ['en','What can you do?','What system updates were released October 7 to 12?','DEVELOPMENT ONLY'],
 ['my','ဘာတွေလုပ်နိုင်လဲ','စနစ် အသစ် ဘာတွေရှိလဲ','Development သာ'],
 ['th','คุณทำอะไรได้บ้าง','ระบบมีอัปเดตอะไรบ้าง','เฉพาะ development'],
])test(`${lang}: capability and update requests bypass AI and preserve pending records`,async t=>{
 const dir=mkdtempSync(join(tmpdir(),'argo-help-'));const store=new Store(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const forbidden=new Proxy({}, {get:()=>()=>{throw Error('Information request reached farm/lab API');}});
 const w=new Worker({group:'Cgroup',cvasIndex:'configured'},store,forbidden,forbidden,forbidden);
 store.saveDraft('Cgroup:Uone',{mode:'clarify',question:'pending cow record'});
 for(const [i,q] of [help,updates].entries()){
  const id=`${lang}-${i}`;store.enqueue([{webhookEventId:id,timestamp:Date.now(),type:'message',source:{type:'group',groupId:'Cgroup',userId:'Uone'},message:{type:'text',text:'@WM '+q}}]);
  await w.process(store.next());
  const out=store.db.prepare('SELECT text FROM outgoing ORDER BY rowid DESC LIMIT 1').get();
  assert.ok(out?.text); if(i===1)assert.ok(out.text.includes('8efe239'));
  if(i===1)assert.ok(out.text.includes(marker));
 }
 assert.equal(store.draft('Cgroup:Uone').question,'pending cow record');assert.equal(store.records(['Farm 2']).length,0);
});
test('help aliases and natural requests',()=>{
 for(const q of ['/help','/HELP','/start','/capabilities','help','How can you help me?','Who are you?','Show me your capabilities'])assert.equal(infoIntent(q),'help',q);
 for(const q of ['/updates','/version','/changelog','Recent system updates','What are your new features?'])assert.equal(infoIntent(q),'updates',q);
});
test('farm/laboratory requests retain existing routing',()=>{
 for(const q of ['/farm update cow 001','/ask bot system updates','/cvas Show CS PDFs','/records Farm 2','/photo Farm 4','/cancel','Update Farm 2 cow 001','Bot update cow 001 record','Compare all CS samples','Find Lab ID 39170011','Show recent farm records','How can you help cow 001?'])assert.equal(infoIntent(q),null,q);
});
test('release evidence remains explicitly dated and development-only even with V1.1 flag',()=>{
 const out=infoAnswer('updates','en',{labSearchV11:true});assert.match(out,/Verified feature baseline: 2026-10-12/);assert.match(out,/not a complete date-range history/);assert.match(out,/Not released to the production LINE bot/);assert.match(out,/No verified evidence here of newly approved knowledge/);
 assert.doesNotMatch(infoAnswer('help','en'),/Laboratory:/);
 assert.match(infoAnswer('help','en',{privateLab:true,labConfigured:true}),/restricted to approved laboratory access/);
 assert.doesNotMatch(infoAnswer('help','en',{privateLab:true}),/create records/);
});
test('help preserves group mention and private authorization boundaries',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'argo-access-')),store=new Store(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const owner='U'+'1'.repeat(32);store.set('lab_owner',owner);
 const w=new Worker({group:'Cgroup',cvasIndex:'configured'},store,{}, {}, {});
 for(const [id,source,text] of [
 ['silent',{type:'group',groupId:'Cgroup',userId:owner},'What can you do?'],
 ['wronggroup',{type:'group',groupId:'Cother',userId:owner},'@WM /help'],
 ['denied',{type:'user',userId:'U'+'2'.repeat(32)},'/help'],
 ['allowed',{type:'user',userId:owner},'What can you do?'],
 ]){store.enqueue([{webhookEventId:id,timestamp:Date.now(),type:'message',source,message:{type:'text',text}}]);await w.process(store.next());}
 const rows=store.db.prepare('SELECT * FROM outgoing').all();assert.equal(rows.length,1);assert.equal(rows[0].id,'allowed');assert.match(rows[0].text,/restricted to approved laboratory access/);
});

test('exact screenshot prompts with native LINE mention metadata reach information route',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'argo-screenshot-')),store=new Store(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const forbidden=new Proxy({}, {get:()=>()=>{throw Error('Screenshot prompt reached record planner');}});
 const w=new Worker({group:'Cgroup',cvasIndex:'configured'},store,forbidden,forbidden,forbidden);
 const mention='@ARGO–WM Farm AIRobot';
 const questions=[
 'what Can you do?',
 'summarize all new system updates, features, and knowledge added from October 7 to October 12, 2026, at 20:50 PM (Thailand time).\n\nInclude new Farm and Lab knowledge, database updates, AI improvements, and current system capabilities.\n\nClearly separate completed updates, development-only features, and pending tasks. Report only verified information.'
 ];
 for(const [i,q] of questions.entries()){
 const id='screenshot-'+i;
 store.enqueue([{webhookEventId:id,timestamp:Date.now(),type:'message',source:{type:'group',groupId:'Cgroup',userId:'Uone'},message:{type:'text',text:mention+'\n'+q,mention:{mentionees:[{index:0,length:mention.length,isSelf:true}]}}}]);
 await w.process(store.next());
 const out=store.db.prepare('SELECT text FROM outgoing WHERE id=?').get(id)?.text;
 assert.ok(out);assert.doesNotMatch(out,/Out of scope|No farm, record type/);
 if(i===0)assert.match(out,/Help \/ Capabilities/);
 else {assert.match(out,/DEPLOYED — 2026-10-08/);assert.match(out,/DEVELOPMENT ONLY/);assert.match(out,/not a complete date-range history/);assert.match(out,/No verified evidence here of newly approved knowledge/);}
 }
 assert.equal(store.draft('Cgroup:Uone'),null);
 assert.equal(store.records(['Farm 2']).length,0);
});

 test('capabilities omit release metadata in every language and chat scope',()=>{
 for(const lang of ['en','my','th'])for(const privateLab of [false,true]){
 const help=infoAnswer('help',lang,{privateLab,labConfigured:true});
 assert.doesNotMatch(help,/2026-10|8efe239|3f59ef1|snapshot|development|V1\.1|\/updates/i);
 assert.ok(help.includes('CVAS'));
 const updates=infoAnswer('updates',lang);assert.match(updates,/2026-10-08/);assert.match(updates,/3f59ef1/);
 }
 });
