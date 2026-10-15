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
