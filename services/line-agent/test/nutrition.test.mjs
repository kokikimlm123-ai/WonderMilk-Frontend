import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nutritionRequest,manualRequest,answerManual} from '../src/manual.mjs';
import {cvasRequest} from '../src/cvas.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/core.mjs';
import {Worker} from '../src/worker.mjs';
const nutrition=JSON.parse(await readFile(new URL('../src/nutrition-manual.json',import.meta.url),'utf8'));
const index={schema_version:1,reports:[],manuals:[
 {id:'cvas-method',title:'CVAS Manual',pages:[{pdf_page:7,text:'Use the correct method.'}]},nutrition]};
test('Nutrition presentation is indexed slide-by-slide without fabricated missing text',()=>{
 assert.equal(nutrition.pages.length,36);
 assert.deepEqual(nutrition.pages.map(p=>p.pdf_page),Array.from({length:38},(_,i)=>i+1).filter(n=>n!==24&&n!==34));
 assert.match(nutrition.pages.find(p=>p.pdf_page===10).text,/CP/);
 assert.match(nutrition.pages.find(p=>p.pdf_page===29).text,/Feed Bunk\s+Management/);
 assert.equal(nutrition.pages.some(p=>p.pdf_page===24||p.pdf_page===34),false);
});
test('V1 routes nutrition questions without changing CVAS lab report routes',()=>{
 for(const q of ['/nutrition DDGS','What is rumen degradable protein?','Dairy nutrition basics','နွားအာဟာရ','โภชนาการโคนม']) {
  assert.equal(nutritionRequest(q),true,q);assert.equal(cvasRequest(q),true,q);
 }
 for(const q of [
  'How should dairy cows be cooled using water sprinklers and fans?',
  'How should dairy cows be cooled using water sprinklers and fans? Where should cooling be provided, and how does heat stress affect milk production?',
  'Does heat stress reduce milk production?',
  'How does soaking and cooling work for dairy cows?',
  'နွားတွေကို ရေဖြန်းပြီး ပန်ကာနဲ့ ဘယ်လိုအအေးခံမလဲ',
  'โคนมควรใช้พัดลมลดความร้อนอย่างไร',
 ]) {
  assert.equal(nutritionRequest(q),true,q);
  assert.equal(cvasRequest(q),true,q);
 }
 for(const q of ['How to cool milk tank?', 'Farm 2 cow heat stress records yesterday', '39170011 Dry Matter result']) {
  assert.equal(nutritionRequest(q),false,q);
 }
 assert.equal(nutritionRequest('39170011 Dry Matter result'),false);
 assert.equal(manualRequest('39170011 Dry Matter result'),false);
});
test('Nutrition answers cite only the nutrition slides and leave CVAS method separate',async()=>{
 const ai={call:async(prompt,input)=>{
  const evidence=JSON.parse(input[0].content[0].text);
  assert.equal(evidence.pages.length,36);
  assert(evidence.pages.every(p=>p.id.startsWith('dairy-nutrition-walter-chen:')));
  assert(evidence.pages.every(p=>![24,34].includes(p.pdf_page)));
  assert.match(prompt,/veterinary treatment/);
  return {answer:'Feed management guidance',cited_pages:['dairy-nutrition-walter-chen:29']};
 }};
 const answer=await answerManual(index,'/nutrition feed bunk',ai,'en');
 assert.match(answer,/Slide 29/);
 assert.doesNotMatch(answer,/PDF p\\. 29/);
});

test('Actual LINE group @WM message reaches nutrition answer and cites original slide',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'nutrition-line-')),store=new Store(dir);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 let lookedUp=false;
 const google={cvasIndex:async()=>{lookedUp=true;return index;}};
 const ai={call:async(_prompt,input)=>{
  const e=JSON.parse(input[0].content[0].text);
  assert(e.pages.every(p=>![24,34].includes(p.pdf_page)));
  return {answer:'The source recommends adequate feed bunk access.',cited_pages:['dairy-nutrition-walter-chen:29']};
 }};
 const bot=new Worker({group:'Cgroup',cvasIndex:'configured'},store,google,ai,{});
 const message='@WM /nutrition Explain feed bunk management';
 store.enqueue([{webhookEventId:'nutrition-e2e-1',type:'message',timestamp:Date.now(),source:{type:'group',groupId:'Cgroup',userId:'Uone'},message:{type:'text',text:message}}]);
 await bot.process(store.next());
 const out=store.db.prepare('SELECT text FROM outgoing WHERE id=?').get('nutrition-e2e-1')?.text;
 assert.equal(lookedUp,true);
 assert.match(out,/Slide 29/);
 assert.match(out,/feed bunk access/);
});

test('LINE group natural cooling question without command is answered from slides 35 and 38',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'nutrition-cooling-')),store=new Store(dir);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 let lookupCount=0;
 const google={cvasIndex:async()=>{lookupCount++;return index;}};
 const ai={call:async(prompt,input)=>{
  const evidence=JSON.parse(input[0].content[0].text);
  assert.equal(evidence.pages.length,36);
  assert(evidence.pages.some(p=>p.pdf_page===35));
  assert(evidence.pages.some(p=>p.pdf_page===38));
  assert.match(prompt,/slide numbers/i);
  return {answer:'Provide shade, sprinklers, fans and clean water in holding pen, exit lane and feedline. Heat stress reduces milk yield.',cited_pages:['dairy-nutrition-walter-chen:35','dairy-nutrition-walter-chen:38']};
 }};
 const bot=new Worker({group:'Cgroup',cvasIndex:'configured'},store,google,ai,{});
 const q='How should dairy cows be cooled using water sprinklers and fans?';
 const mention='@ARGO–WM Farm AIRobot';
 const e={webhookEventId:'nutrition-natural-cooling',type:'message',timestamp:Date.now(),
  source:{type:'group',groupId:'Cgroup',userId:'Uone'},
  message:{type:'text',text:mention+'\n'+q,mention:{mentionees:[{index:0,length:mention.length,isSelf:true}]}}};
 store.enqueue([e]);await bot.process(store.next());
 const out=store.db.prepare('SELECT text FROM outgoing WHERE id=?').get(e.webhookEventId)?.text;
 assert.equal(lookupCount,1);
 assert.match(out,/holding pen/);
 assert.match(out,/Slide 35/);
 assert.match(out,/Slide 38/);
 assert.notEqual(out,q);
});
