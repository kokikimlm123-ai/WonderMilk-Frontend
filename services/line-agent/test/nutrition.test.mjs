import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nutritionRequest,manualRequest,answerManual} from '../src/manual.mjs';
import {cvasRequest} from '../src/cvas.mjs';
const nutrition=JSON.parse(await readFile(new URL('../src/nutrition-manual.json',import.meta.url),'utf8'));
const index={schema_version:1,reports:[],manuals:[
 {id:'cvas-method',title:'CVAS Manual',pages:[{pdf_page:7,text:'Use the correct method.'}]},nutrition]};
test('Nutrition presentation is indexed slide-by-slide without fabricated missing text',()=>{
 assert.equal(nutrition.pages.length,38);
 assert.deepEqual(nutrition.pages.map(p=>p.pdf_page),Array.from({length:38},(_,i)=>i+1));
 assert.match(nutrition.pages[9].text,/CP/);
 assert.match(nutrition.pages[28].text,/Feed Bunk Management/);
 assert.match(nutrition.pages[23].text,/Visual-only slide/);
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
  assert.equal(evidence.pages.length,38);
  assert(evidence.pages.every(p=>p.id.startsWith('dairy-nutrition-walter-chen:')));
  assert.match(prompt,/veterinary treatment/);
  return {answer:'Feed management guidance',cited_pages:['dairy-nutrition-walter-chen:29']};
 }};
 const answer=await answerManual(index,'/nutrition feed bunk',ai,'en');
 assert.match(answer,/Slide 29/);
 assert.doesNotMatch(answer,/PDF p\\. 29/);
});
