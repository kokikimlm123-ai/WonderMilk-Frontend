import test from 'node:test';
import assert from 'node:assert/strict';
import {cvasRequest,validateIndex,answerCvas} from '../src/cvas.mjs';
const id='a'.repeat(64),index={schema_version:1,reports:[{sha256:id,lab_id:'12345678',filenames:['sample.pdf'],text:'Dry Matter 35.0'}]};
test('PDF requests use exact private catalog links without AI calls',async()=>{
 const url='https://drive.google.com/file/d/test_file/view';
 const data={...index,reports:[{...index.reports[0],original_pdf_url:url}]};
 assert.match(await answerCvas(data,'/cvas pdf 12345678',{},'en'),/test_file\/view/);
 assert.match(await answerCvas(data,'send original PDF',{},'en'),/specify a Lab ID/);
 assert.match(await answerCvas(data,'pdf 99999999',{},'en'),/not found/);
 assert.match(await answerCvas(index,'pdf 12345678',{},'en'),/not connected yet/);
 data.reports[0].original_pdf_url='https://drive.google.com.evil.example/file/d/test/view';
 assert.doesNotMatch(await answerCvas(data,'pdf 12345678',{},'en'),/evil/);
});
test('ordinary answers do not receive original PDF URLs',async()=>{
 const data={...index,reports:[{...index.reports[0],original_pdf_url:'https://drive.google.com/file/d/test_file/view'}]};
 await answerCvas(data,'12345678 dry matter',{answer:async(q,e)=>{assert.equal(e.reports[0].original_pdf_url,undefined);return 'ok';}},'en');
});
test('CVAS routing does not capture normal farm questions',()=>{assert.equal(cvasRequest('/farm Farm 2 milk'),false);assert.equal(cvasRequest('/cvas Lab 12345678'),true);assert.equal(cvasRequest('CVAS report'),true);});
test('Invalid index or duplicate report identity is rejected',()=>{assert.throws(()=>validateIndex({}));assert.throws(()=>validateIndex({...index,reports:[...index.reports,...index.reports]}));});
test('Unknown AI-selected report cannot become evidence',async()=>{await assert.rejects(answerCvas(index,'show report',{call:async()=>({ids:['unknown']})},'en'),/Unknown/);});
test('Only selected source evidence reaches answer and limits remain explicit',async()=>{let evidence;const ai={call:async()=>({ids:['0'],clarification:''}),answer:async(q,e)=>{evidence=e;return 'answer';}};assert.equal(await answerCvas(index,'show',ai,'en'),'answer');assert.equal(evidence.reports.length,1);assert.match(evidence.scope,/Blank values are missing/);});

test('explicit Lab ID bypasses the selection model and never substitutes missing IDs',async()=>{let calls=0;const ai={call:async()=>{throw Error('must not select');},answer:async(q,e)=>{calls++;assert.equal(e.reports[0].lab_id,'12345678');return 'ok';}};assert.equal(await answerCvas(index,'Show 12345678 DM',ai,'en'),'ok');assert.match(await answerCvas(index,'Show 99999999',ai,'en'),/not found/);assert.equal(calls,1);});
