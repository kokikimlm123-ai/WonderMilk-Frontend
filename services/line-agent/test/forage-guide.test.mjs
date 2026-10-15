import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {forageGuideRequest,mastitisRequest,nutritionRequest,manualRequest,answerManual} from '../src/manual.mjs';
import {cvasRequest,answerCvas,validateIndex} from '../src/cvas.mjs';
import {Store} from '../src/core.mjs';
import {Worker} from '../src/worker.mjs';

const forage=JSON.parse(await readFile(new URL('../src/forage-analysis-guide.json',import.meta.url),'utf8'));
const nutrition=JSON.parse(await readFile(new URL('../src/nutrition-manual.json',import.meta.url),'utf8'));
const mastitis=JSON.parse(await readFile(new URL('../src/mastitis-manual.json',import.meta.url),'utf8'));
const cvas={id:'cvas-method',title:'CVAS Method Manual',pages:[{pdf_page:7,text:'Oven dry matter lab procedure.'}]};
const index={schema_version:1,reports:[],manuals:[cvas,nutrition,mastitis,forage]};

test('Forage guide stores complete two-page source-specific reference ranges',()=>{
 assert.equal(forage.pages.length,2);
 assert.deepEqual(forage.pages.map(p=>p.pdf_page),[1,2]);
 assert.equal(forage.source_filename,'How-to-Interpret-a-Forage-Analysis-report.pdf');
 const p1=forage.pages[0].text,p2=forage.pages[1].text;
 for(const fragment of ['33–35%','7–9%','38–44%','30 hours','300 ppm','As Fed','DM column','NDICP','ADICP']){
   assert(p1.includes(fragment),'Page 1 must include '+fragment);
 }
 for(const fragment of ['greater than 30%','>88%','79–87%','<78%','>0.70 Mcal/lb','lactic acid >3%','acetic acid <3%','VFA score >7.0','WSC','ESC']){
   assert(p2.includes(fragment),'Page 2 must include '+fragment);
 }
 assert.match(forage.provenance_note,/not universally/);
 assert.equal(new Set(index.manuals.map(m=>m.id)).size,4);
 validateIndex(index);
});

test('Forage guide routes normal questions and explicit commands, not CVAS measured sample lookups',()=>{
 for(const q of ['/forage Explain NDF and NDFD', '/feedanalysis What is NEL?', '/forageguide Explain starch',
   'How do I interpret a forage analysis report?', 'What is the corn silage NDF goal?',
   'What is the target DM for corn silage?', 'Explain starch digestibility classes.',
   'What is uNDFom?', 'What are the fermentation goals for corn silage?',
   'အစာဓာတ်ခွဲရလဒ်ဖတ်နည်း ရှင်းပြပါ', 'วิเคราะห์อาหารหยาบ ค่าเป้าหมาย NDF เท่าไร']) {
  assert.equal(forageGuideRequest(q),true,q);
  assert.equal(cvasRequest(q),true,q);
 }
 for(const q of ['/cvas Compare corn silage DM and starch',
   '/cvas Lab ID 39170011 NDF value', 'What is the best CVAS corn silage sample?',
   'Farm 2 corn silage sample results today','Ryokusan forage results yesterday',
   'How many kg milk did Farm 4 produce?', 'What is the CMT protocol?',
   '/nutrition Explain RDP and RUP', '/mastitis Explain udder hygiene']){
  assert.equal(forageGuideRequest(q),false,q);
 }
 assert.equal(mastitisRequest('What is the CMT protocol?'),true);
 assert.equal(nutritionRequest('/nutrition Explain RDP and RUP'),true);
 assert.equal(manualRequest('/manual Explain oven dry matter'),true);
});

test('Forage PDF guide answers use only original PDF pages, not CVAS/nutrition/mastitis',async()=>{
 const ai={call:async(prompt,input)=>{
  const source=JSON.parse(input[0].content[0].text);
  assert.equal(source.pages.length,2);
  assert(source.pages.every(p=>p.id.startsWith('forage-analysis-interpretation-precision-feed-manager:')));
  assert.match(prompt,/DM column/);
  return {answer:'For corn silage, the guide lists NDF 38–44% and starch above 30%.',cited_pages:[
   'forage-analysis-interpretation-precision-feed-manager:1',
   'forage-analysis-interpretation-precision-feed-manager:2']};
 }};
 const result=await answerCvas(index,'/forage What are the target NDF and starch levels for corn silage?',ai,'en');
 assert.match(result,/NDF 38–44%/);
 assert.match(result,/PDF p\. 1/);
 assert.match(result,/PDF p\. 2/);
 assert.doesNotMatch(result,/Slide 1|Slide 2/);
});
test('Original CVAS, nutrition and mastitis routes still have isolated evidence',async()=>{
 for(const [q,expectedId,count,reference] of [
  ['/manual Explain drying','cvas-method',1,7],
  ['/nutrition Explain feed bunk','dairy-nutrition-walter-chen',36,29],
  ['/mastitis What is CMT?','milk-quality-mastitis-todd-meyer',77,32]]) {
  const ai={call:async(_prompt,input)=>{
   const pages=JSON.parse(input[0].content[0].text).pages;
   assert.equal(pages.length,count);
   assert(pages.every(p=>p.id.startsWith(expectedId+':')));
   return {answer:'Reference-only explanation.',cited_pages:[expectedId+':'+reference]};
  }};
  const result=await answerCvas(index,q,ai,'en');
  assert.match(result,/Reference:/);
 }
});
test('Mentioned LINE Group question about forage standards reaches the Cornell PDF index',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'forage-line-')),store=new Store(dir);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 let lookups=0;
 const google={cvasIndex:async()=>{lookups++;return index}};
 const ai={call:async(_prompt,input)=>{
  const source=JSON.parse(input[0].content[0].text);
  assert.equal(source.pages.length,2);
  assert(source.pages.every(p=>p.id.startsWith('forage-analysis-interpretation-precision-feed-manager:')));
  return {answer:'Corn silage starch goal is >30% DM; the source explains digestibility too.',
    cited_pages:['forage-analysis-interpretation-precision-feed-manager:2']};
 }};
 const bot=new Worker({group:'Cgroup',cvasIndex:'configured'},store,google,ai,{});
 const mention='@ARGO–WM Farm AIRobot';
 const e={webhookEventId:'forage-e2e-1',type:'message',timestamp:Date.now(),
  source:{type:'group',groupId:'Cgroup',userId:'Uone'},
  message:{type:'text',text:mention+' What is the corn silage starch goal?',
   mention:{mentionees:[{index:0,length:mention.length,isSelf:true}]}}};
 store.enqueue([e]);await bot.process(store.next());
 const result=store.db.prepare('SELECT text FROM outgoing WHERE id=?').get(e.webhookEventId)?.text;
 assert.equal(lookups,1);
 assert.match(result,/>30% DM/);
 assert.match(result,/PDF p\. 2/);
});
