import test from 'node:test';
import assert from 'node:assert/strict';
import {cvasRequest,validateIndex,answerCvas} from '../src/cvas.mjs';
const id='a'.repeat(64),index={schema_version:1,reports:[{sha256:id,lab_id:'12345678',filenames:['sample.pdf'],text:'Dry Matter 35.0'}]};
test('CVAS routing does not capture normal farm questions',()=>{assert.equal(cvasRequest('/farm Farm 2 milk'),false);assert.equal(cvasRequest('/cvas Lab 12345678'),true);assert.equal(cvasRequest('CVAS report'),true);});
test('Invalid index or duplicate report identity is rejected',()=>{assert.throws(()=>validateIndex({}));assert.throws(()=>validateIndex({...index,reports:[...index.reports,...index.reports]}));});
test('Unknown AI-selected report cannot become evidence',async()=>{await assert.rejects(answerCvas(index,'show report',{call:async()=>({ids:['unknown']})},'en'),/Unknown/);});
test('Only selected source evidence reaches answer and limits remain explicit',async()=>{let evidence;const ai={call:async()=>({ids:[id],clarification:''}),answer:async(q,e)=>{evidence=e;return 'answer';}};assert.equal(await answerCvas(index,'show',ai,'en'),'answer');assert.equal(evidence.reports.length,1);assert.match(evidence.scope,/Blank values are missing/);});
