import test from 'node:test';import assert from 'node:assert/strict';
import {manualRequest,answerManual} from '../src/manual.mjs';
import {answerCvas,cvasRequest} from '../src/cvas.mjs';
const index={schema_version:1,reports:[],manuals:[{id:'manual',title:'CVAS Manual',original_pdf_url:'https://drive.google.com/file/d/test/view',pages:[{pdf_page:7,text:'Example reference'}]}]};
test('manual routes procedures in three languages but preserves lab result lookups',()=>{
 for(const q of ['How to do DM?','DM ဘယ်လိုလုပ်ရမလဲ','วิธี DM','sampling process','/manual sample prep'])assert.equal(cvasRequest(q),true);
 for(const q of ['39170011 DM','best CS sample','Farm 2 milk'])assert.equal(manualRequest(q),false);
});
test('manual answers get validated page references, no ordinary URL',async()=>{
 const ai={call:async(p,input)=>{assert.match(p,/Burmese/);assert.equal(JSON.parse(input[0].content[0].text).pages[0].pdf_page,7);return {answer:'အဖြေ',cited_pages:['manual:7']};}};
 const r=await answerCvas(index,'DM ဘယ်လိုလုပ်ရမလဲ',ai,'my');assert.match(r,/PDF p. 7/);assert.doesNotMatch(r,/https/);
});
test('unknown page citations are rejected and missing manual has explicit result',async()=>{
 await assert.rejects(answerManual(index,'how DM',{call:async()=>({answer:'bad',cited_pages:['manual:999']})}),/Invalid manual citation/);
 assert.match(await answerManual({},'how DM',{}),/No manual/);
});
test('explicit manual download uses stored original only',async()=>{
 assert.match(await answerManual(index,'send manual PDF',{}),/test\/view/);
});
