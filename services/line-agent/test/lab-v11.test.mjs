import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeCatalog,csScreen} from '../src/lab-catalog.mjs';
import {executeLabQuery,planLabQuery,validatePlan,renderLabResult,answerLabV11,labV11Request} from '../src/lab-search.mjs';
import {answerCvas} from '../src/cvas.mjs';
import {Store} from '../src/core.mjs';
import {configuration} from '../src/config.mjs';
import {Worker} from '../src/worker.mjs';

const row=(a,b='')=>a.padEnd(68)+b;
function report(i,{dm=35,starch=31,type='CS',farm='RKS',labId=String(39000000+i),suffix=''}={}) {
 return {sha256:i.toString(16).padStart(64,'0'),lab_id:labId,filenames:[`260723-TH-${farm}-${type}-BAG${i}-${labId}${suffix}.pdf`],original_pdf_url:`https://drive.google.com/file/d/report_${i}/view`,
 text:[row('SAMPLE INFORMATION','MINERALS'),row('Dry Matter '+(dm??'')),row('Starch '+(starch??'')),row('Crude Protein 7.2'),row('ADF 50.0 21.0'),row('aNDF 42.0'),row('','Lactic Acid (%DM)'),row('','Acetic Acid (%DM) 2.8')].join('\n')};
}
const index=reports=>({schema_version:1,indexed_on:'2026-10-12',reports});
const basePlan=extra=>({intent:'list',groups:[['CS']],lab_ids:[],filters:[],all:false,clarification:'',...extra});
const noAI={call:async()=>{throw Error('Unexpected AI call');}};

test('normalization preserves source identity, missing values, basis and original records',()=>{
 const original=index([report(1)]),before=JSON.stringify(original),c=normalizeCatalog(original),r=c.reports[0];
 assert.equal(JSON.stringify(original),before);assert.equal(r.verification_status,'imported');
 assert.equal(r.results.lactic_percent_DM.value,null);assert.equal(r.results.acetic_percent_DM.value,2.8);
 assert.equal(r.results.acetic_percent_DM.locator.line,8);assert.equal(r.results.starch_percent_DM.basis,'DM');
 assert.equal(r.results.ADF_percent_DM.value,21);assert.equal(r.collection_date,null);assert.equal(r.farm_id,null);
 assert.equal(r.names[0].date_code,'260723');assert.equal(r.results.DM_percent.locator.source_sha256,r.source_version_id);
 const revised=structuredClone(original);revised.reports[0].text+='\nCorrection';assert.notEqual(normalizeCatalog(revised).snapshot_id,c.snapshot_id);
});
test('all comparisons include every matching version, not four selected reports',async()=>{
 const data=index(Array.from({length:60},(_,i)=>report(i,{type:i===59?'TMR':'CS'})));
 const answer=await answerCvas(data,'Compare all CS samples by nutritional quality',noAI,'en',{v11:true});
 assert.match(answer,/Matched report versions: 59/);assert.equal((answer.match(/Source:/g)||[]).length,59);
 assert.doesNotMatch(answer,/39000059/);assert.doesNotMatch(answer,/https/);
});
test('all PDF matches are returned exactly once and malicious URLs are not emitted',async()=>{
 const data=index([report(1),report(2),report(3,{type:'TMR'})]);data.reports[1].original_pdf_url='https://drive.google.com.evil/file/d/x/view';
 const out=await answerLabV11(data,'Send me all CS sample PDF reports',noAI);
 assert.match(out,/Matched report versions: 2/);assert.equal((out.match(/https:/g)||[]).length,1);assert.doesNotMatch(out,/evil|report_3/);
});
test('numeric thresholds are strict, missing is not zero, and requested units stay explicit',async()=>{
 const catalog=normalizeCatalog(index([report(1),report(2,{dm:32}),report(3,{starch:30}),report(4,{dm:null}),report(5,{dm:33,starch:32})]));
 const plan=await planLabQuery('Find samples with DM above 32% and Starch above 30%',catalog,noAI);
 const result=executeLabQuery(catalog,plan,'wonder-milk');
 assert.deepEqual(result.reports.map(r=>r.lab_id),['39000001','39000005']);assert.equal(result.missing_filter_count,1);
 assert.match(renderLabResult(result,plan),/Excluded from numeric filters/);
});
test('ID plus farm/material/code constraints intersect, no ID shortcut broadens results',async()=>{
 const c=normalizeCatalog(index([report(1,{farm:'RKS'}),report(2,{farm:'WM'})]));
 const plan=await planLabQuery('CS WM 39000001',c,noAI);
 assert.equal(executeLabQuery(c,plan,'wonder-milk').reports.length,0);
 const unknown=basePlan({lab_ids:['39999999']});assert.deepEqual(executeLabQuery(c,unknown,'wonder-milk').missing_ids,['39999999']);
});
test('duplicate versions remain visible but are not silently selected as latest or ranked twice',async()=>{
 const c=normalizeCatalog(index([report(1),report(2,{labId:'39000001'}),report(3)]));
 const result=executeLabQuery(c,basePlan({intent:'rank'}),'wonder-milk');
 assert.equal(result.matched_report_versions,3);assert.equal(result.distinct_lab_ids,2);
 assert.deepEqual(result.version_conflict_ids,['39000001']);assert.deepEqual(result.screening_candidates.map(r=>r.lab_id),['39000003']);
 const out=renderLabResult(result,basePlan({intent:'rank'}));assert.match(out,/No definitive best\/worst/);assert.match(out,/no latest version inferred/);
});
test('TMR comparison never applies CS screen and includes all farms in requested scope',async()=>{
 const c=normalizeCatalog(index([report(1,{type:'TMR',farm:'RKS'}),report(2,{type:'TMR',farm:'WM'})]));
 const plan=await planLabQuery('Compare TMR samples from different farms',c,noAI);
 const result=executeLabQuery(c,plan,'wonder-milk');assert.equal(result.reports.length,2);assert.equal(result.pass_count,0);
 assert.ok(result.reports.every(r=>csScreen(r)==='not_applicable'));
});
test('three language simple CS ranking requests use deterministic scope with no AI call',async()=>{
 const c=normalizeCatalog(index([report(1)]));
 for(const q of ['Find the best corn silage sample','အကောင်းဆုံး CS sample ကိုရှာပေးပါ','หา CS sample ดีที่สุด']) {
  const p=await planLabQuery(q,c,noAI);assert.equal(p.intent,'rank');assert.equal(executeLabQuery(c,p,'wonder-milk').reports.length,1);
 }
});
test('unknown constraints use explicit clarification; dates are not guessed',async()=>{
 const c=normalizeCatalog(index([report(1)]));
 const ai={call:async()=>basePlan({clarification:'Please provide a literal date code.'})};
 const p=await planLabQuery('CS from August 2026',c,ai);assert.match(p.clarification,/date code/);
 assert.equal(executeLabQuery(c,basePlan({groups:[['CS'],['UNKNOWN']]}),'wonder-milk').reports.length,0);
});
test('query compiler rejects dropped explicit constraints and cross-project data',()=>{
 assert.throws(()=>validatePlan(basePlan(),'39000001'),/dropped/);
 assert.throws(()=>validatePlan(basePlan(),'DM >32'),/dropped/);
 assert.throws(()=>validatePlan(basePlan({filters:[{parameter:'unknown',operator:'gt',value:2}]})),/Invalid/);
 const c=normalizeCatalog(index([report(1)]),'farm-private');assert.throws(()=>executeLabQuery(c,basePlan(),'wonder-milk'),/scope/);
 assert.throws(()=>executeLabQuery(c,basePlan({clarification:'date needed'}),'farm-private'),/Unresolved/);
});
test('numeric sample lookup enters V1.1 but farm records retain their existing route',()=>{
 assert.equal(labV11Request('Find samples with DM above 32% and Starch above 30%'),true);
 assert.equal(labV11Request('/farm Farm 2 record TMR DM 35'),false);
 assert.equal(labV11Request('Record TMR samples for Farm 2'),false);
 assert.equal(labV11Request('Farm 2 daily milk'),false);
});
test('invalid measurements and unrecognized extraction layouts remain unavailable',()=>{
 const data=index([report(1,{dm:101}),{...report(2),text:'unsupported layout'}]);
 const c=normalizeCatalog(data);assert.equal(c.reports[0].results.DM_percent.value,null);
 assert.equal(c.reports[0].results.DM_percent.status,'invalid');assert.equal(c.reports[1].results.DM_percent.missing_reason,'unrecognized_layout');
});
test('analysis journal is lazy, draft-only, idempotent and separate from farm records',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'argo-v11-')),store=new Store(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 assert.equal(store.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='lab_analyses'").get().n,0);
 const options={onAnalysis:a=>store.recordLabAnalysis('test-event',a)};
 await answerLabV11(index([report(1)]),'all CS',noAI,'en',options);
 await answerLabV11(index([report(1)]),'all CS',noAI,'en',options);
 assert.equal(store.db.prepare('SELECT count(*) n FROM lab_analyses').get().n,1);
 const saved=store.db.prepare('SELECT * FROM lab_analyses').get();assert.equal(saved.status,'draft');assert.equal(JSON.parse(saved.value).sources.length,1);
 assert.throws(()=>store.recordLabAnalysis('bad',{status:'approved'}),/Invalid/);assert.equal(store.records(['Farm 2']).length,0);
});
test('V1.1 is opt-in and full worker routes TMR comparison without creating farm records',async t=>{
 assert.equal(configuration({}).labSearchV11,false);assert.equal(configuration({LAB_SEARCH_V11:'true'}).labSearchV11,true);
 const dir=mkdtempSync(join(tmpdir(),'argo-worker-')),store=new Store(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const c={group:'Cgroup',labSearchV11:true},google={cvasIndex:async()=>index([report(1,{type:'TMR'})])};
 const w=new Worker(c,store,google,noAI,{});
 const event={webhookEventId:'v11-event',timestamp:Date.now(),type:'message',source:{type:'group',groupId:'Cgroup',userId:'Utest'},message:{type:'text',text:'@WM Compare TMR samples from different farms'}};
 store.enqueue([event]);const job=store.next();await w.process(job);
 assert.equal(store.db.prepare('SELECT count(*) n FROM lab_analyses').get().n,1);
 assert.match(store.db.prepare('SELECT text FROM outgoing').get().text,/39000001/);assert.equal(store.records(['Farm 2']).length,0);
});
