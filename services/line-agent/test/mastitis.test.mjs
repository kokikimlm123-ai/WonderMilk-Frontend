import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mastitisRequest,nutritionRequest,manualRequest,answerManual} from '../src/manual.mjs';
import {cvasRequest,answerCvas,validateIndex} from '../src/cvas.mjs';
import {Store} from '../src/core.mjs';
import {Worker} from '../src/worker.mjs';
const mastitis=JSON.parse(await readFile(new URL('../src/mastitis-manual.json',import.meta.url),'utf8'));
const nutrition=JSON.parse(await readFile(new URL('../src/nutrition-manual.json',import.meta.url),'utf8'));
const cvas={id:'cvas-method',title:'CVAS Manual',pages:[{pdf_page:7,text:'CVAS sample method reference.'}]};
const index={schema_version:1,reports:[],manuals:[cvas,nutrition,mastitis]};

test('77 slide visual-source summaries, original slide numbering, distinct reference title',()=>{
 assert.equal(mastitis.pages.length,77);
 assert.deepEqual(mastitis.pages.map(p=>p.pdf_page),Array.from({length:77},(_,i)=>i+1));
 assert.match(mastitis.pages[11].text,/30 seconds/);
 assert.match(mastitis.pages[31].text,/CMT|10 mL/);
 assert.match(mastitis.pages[32].text,/100,000/);
 assert.match(mastitis.pages[73].text,/0–11%/);
 assert.match(mastitis.provenance_note,/not a verbatim reproduction/);
 assert.equal(new Set(index.manuals.map(m=>m.id)).size,3);
 validateIndex(index);
});
test('Manual intent isolation: mastitis / CMT / Gram stain vs farm data, CVAS, nutrition',()=>{
 for(const q of ['/mastitis What are clinical grades?', '/milkquality Explain SCC', 'What is the CMT protocol?', 'What are signs of mastitis?',
  'How to do Gram stain?', 'How to interpret KOH and catalase?', 'What is the correct milking routine?',
  'နို့အုံရောင်ရမ်းရောဂါအဆင့်တွေ ရှင်းပြပါ', 'โคนมมีเต้านมอักเสบอย่างไร']) {
    assert.equal(mastitisRequest(q),true,q);assert.equal(cvasRequest(q),true,q);
 }
 for(const q of ['Farm 2 CMT results yesterday', 'Ryokusan mastitis records on 2026-09-12',
   'What was Farm 4 milk production today?', 'CVAS Lab ID 39170011 SCC', 'How should dairy cows be cooled using sprinklers and fans?']) {
    assert.equal(mastitisRequest(q),false,q);
 }
 assert.equal(nutritionRequest('How should dairy cows be cooled using sprinklers and fans?'),true);
 assert.equal(manualRequest('/manual Explain oven drying'),true);
 assert.equal(manualRequest('What is the CMT protocol?'),true);
});
test('CMT answers retrieve only Todd Meyer slide pages with validated citation',async()=>{
 const ai={call:async(prompt,input)=>{
  const e=JSON.parse(input[0].content[0].text);
  assert.equal(e.pages.length,77);
  assert(e.pages.every(p=>p.id.startsWith('milk-quality-mastitis-todd-meyer:')));
  assert.match(prompt,/veterinarian/);
  return {answer:'The lecture describes foremilk, reagent and swirl interpretation.',cited_pages:['milk-quality-mastitis-todd-meyer:32','milk-quality-mastitis-todd-meyer:33']};
 }};
 const result=await answerCvas(index,'/mastitis How do I use CMT?',ai,'en');
 assert.match(result,/Slide 32/);
 assert.match(result,/Slide 33/);
 assert.doesNotMatch(result,/https:\/\//);
});
test('Existing CVAS method and nutrition manual are still isolated',async()=>{
 for(const [q,prefix,count,citation] of [
  ['/nutrition Explain feed bunk', 'dairy-nutrition-walter-chen:',36,'dairy-nutrition-walter-chen:29'],
  ['/manual Explain oven drying','cvas-method:',1,'cvas-method:7']]) {
  const ai={call:async(prompt,input)=>{
    const pages=JSON.parse(input[0].content[0].text).pages;
    assert.equal(pages.length,count);
    assert(pages.every(p=>p.id.startsWith(prefix)));
    return {answer:'Source-specific response',cited_pages:[citation]};
  }};
  const r=await answerManual(index,q,ai,'en');
  assert.match(r,/Reference:/);
 }
});
test('LINE group mention routes natural CMT question and cites slides 32, 33',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'mastitis-line-'));
 const store=new Store(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 let lookups=0;
 const google={cvasIndex:async()=>{lookups++;return index;}};
 const ai={call:async(prompt,input)=>{
  const e=JSON.parse(input[0].content[0].text);
  assert(e.pages.every(p=>p.id.startsWith('milk-quality-mastitis-todd-meyer:')));
  return {answer:'Use the CMT paddle and reagent as described in the teaching slide.',cited_pages:['milk-quality-mastitis-todd-meyer:32']};
 }};
 const bot=new Worker({group:'Cgroup',cvasIndex:'configured'},store,google,ai,{});
 const mention='@ARGO–WM Farm AIRobot';
 const message=mention+' How do I perform the California Mastitis Test (CMT)?';
 store.enqueue([{webhookEventId:'mastitis-line-e2e',timestamp:Date.now(),type:'message',
  source:{type:'group',groupId:'Cgroup',userId:'Uone'},
  message:{type:'text',text:message,mention:{mentionees:[{index:0,length:mention.length,isSelf:true}]}}}]);
 await bot.process(store.next());
 const answer=store.db.prepare('SELECT text FROM outgoing WHERE id=?').get('mastitis-line-e2e')?.text;
 assert.equal(lookups,1);
 assert.match(answer,/CMT paddle/);
 assert.match(answer,/Slide 32/);
});
