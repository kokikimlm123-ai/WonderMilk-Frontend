import test from 'node:test';
import assert from 'node:assert/strict';
import {cvasRequest,validateIndex,answerCvas} from '../src/cvas.mjs';
const id='a'.repeat(64),index={schema_version:1,reports:[{sha256:id,lab_id:'12345678',filenames:['sample.pdf'],text:'Dry Matter 35.0'}]};
test('PDF requests use exact private catalog links without AI calls',async()=>{
 const url='https://drive.google.com/file/d/test_file/view';
 const data={...index,reports:[{...index.reports[0],original_pdf_url:url}]};
 assert.match(await answerCvas(data,'/cvas pdf 12345678',{},'en'),/test_file\/view/);
 assert.match(await answerCvas(data,'send original PDF',{call:async()=>({groups:[],all:false,clarification:'Please specify a Lab ID or sample code'})},'en'),/specify a Lab ID/);
 assert.match(await answerCvas(data,'pdf 99999999',{},'en'),/not found/);
 assert.match(await answerCvas(index,'pdf 12345678',{},'en'),/not connected yet/);
 data.reports[0].original_pdf_url='https://drive.google.com.evil.example/file/d/test/view';
 assert.doesNotMatch(await answerCvas(data,'pdf 12345678',{},'en'),/evil/);
});
test('ordinary answers do not receive original PDF URLs',async()=>{
 const data={...index,reports:[{...index.reports[0],original_pdf_url:'https://drive.google.com/file/d/test_file/view'}]};
 const result=await answerCvas(data,'12345678 dry matter',{answer:async(q,e)=>{assert.equal(e.reports[0].original_pdf_url,undefined);return 'ok';}},'en');assert.match(result,/https:\/\/drive\.google\.com\/file\/d\/test_file\/view/);
});
test('CVAS routing does not capture normal farm questions',()=>{assert.equal(cvasRequest('/farm Farm 2 milk'),false);assert.equal(cvasRequest('/cvas Lab 12345678'),true);assert.equal(cvasRequest('CVAS report'),true);});
test('Invalid index or duplicate report identity is rejected',()=>{assert.throws(()=>validateIndex({}));assert.throws(()=>validateIndex({...index,reports:[...index.reports,...index.reports]}));});
test('Unknown AI-selected report cannot become evidence',async()=>{await assert.rejects(answerCvas(index,'show report',{call:async()=>({ids:['unknown']})},'en'),/Unknown/);});
test('Only selected source evidence reaches answer and limits remain explicit',async()=>{let evidence;const ai={call:async()=>({ids:['0'],clarification:''}),answer:async(q,e)=>{evidence=e;return 'answer';}};assert.match(await answerCvas(index,'show',ai,'en'),/^answer/);assert.equal(evidence.reports.length,1);assert.match(evidence.scope,/Blank values are missing/);});

test('explicit Lab ID bypasses the selection model and never substitutes missing IDs',async()=>{let calls=0;const ai={call:async()=>{throw Error('must not select');},answer:async(q,e)=>{calls++;assert.equal(e.reports[0].lab_id,'12345678');return 'ok';}};assert.match(await answerCvas(index,'Show 12345678 DM',ai,'en'),/^ok/);assert.match(await answerCvas(index,'Show 99999999',ai,'en'),/not found/);assert.equal(calls,1);});

import {findReports,qualityMetrics} from '../src/cvas.mjs';
const reports=Array.from({length:40},(_,i)=>({sha256:i.toString(16).padStart(64,'0'),lab_id:String(39170000+i),filenames:[`260723-TH-RKS-${i===39?'TMR':'CS'}-BAG${i}.pdf`],text:'',original_pdf_url:`https://drive.google.com/file/d/file_${i}/view`}));
test('all CS PDF search returns every matching version, excluding TMR',async()=>{
 const ai={call:async()=>({groups:[['CS']],all:false,clarification:''})};
 const result=await answerCvas({schema_version:1,reports},'All CS samples pdf',ai,'en');
 assert.equal((result.match(/https:\/\/drive/g)||[]).length,39);assert.doesNotMatch(result,/file_39/);
 assert.equal(cvasRequest('All CS samples pdf'),true);
});
test('filename filters intersect farm, country and material; unknown codes match nothing',async()=>{
 let result=await findReports({reports},'TH RKS CS',{call:async()=>({groups:[['TH'],['RKS'],['CS']],all:false,clarification:''})},'en');assert.equal(result.reports.length,39);
 result=await findReports({reports},'XYZ CS',{call:async()=>({groups:[['XYZ'],['CS']],all:false,clarification:''})},'en');assert.equal(result.reports.length,0);
});
test('CVAS column extraction uses percent DM and leaves missing acids unknown',()=>{
 const row=(a,b='')=>a.padEnd(68)+b;
 const text=[row('SAMPLE INFORMATION','MINERALS'),row('Dry Matter          35.0','Sodium (%DM)  0.3'),row('Starch       67.1   32.0','NSC (%DM)  42'),row('Crude Protein       7.2','Iron (PPM)'),row('ADF   50.9  21.0'),row('','Lactic Acid (%DM)'),row('','Acetic Acid (%DM)     2.80')].join('\n');
 const m=qualityMetrics({text});assert.equal(m.starch_percent_DM,32);assert.equal(m.ADF_percent_DM,21);assert.equal(m.CP_percent_DM,7.2);assert.equal(m.lactic_percent_DM,null);assert.equal(m.acetic_percent_DM,2.8);
 assert.equal(qualityMetrics({text:'unrecognized'}).layout,'unrecognized');
});
test('best sample comparison includes all matches, not four chosen reports',async()=>{
 const ai={call:async()=>({groups:[['CS']],all:false,clarification:''}),answer:async(q,e)=>{assert.equal(e.matched_report_versions,39);assert.equal(e.reports.length,39);assert.ok(e.reports.every(r=>r.passes_CS_screen===null));return 'insufficient metrics';}};
 assert.equal(await answerCvas({schema_version:1,reports},'best CS sample',ai,'en'),'insufficient metrics');
});
