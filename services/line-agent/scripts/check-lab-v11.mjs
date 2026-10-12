// Read-only real-data acceptance check. No server, credentials, network or production writes.
// Usage: node scripts/check-lab-v11.mjs /absolute/path/to/cvas-index.json
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateIndex} from '../src/cvas.mjs';
import {normalizeCatalog} from '../src/lab-catalog.mjs';
import {planLabQuery,executeLabQuery,answerLabV11} from '../src/lab-search.mjs';
const path=process.argv[2];if(!path)throw Error('Provide a private local CVAS index path');
const bytes=readFileSync(path),index=validateIndex(JSON.parse(bytes)),catalog=normalizeCatalog(index);
const noAI={call:async()=>{throw Error('This acceptance check must not call an external API');}};
const queries=['Find all CS samples','Send me all CS sample PDF reports','Find the best corn silage sample','Compare all CS samples by nutritional quality','Find samples with DM above 32% and Starch above 30%','Compare TMR samples from different farms'];
const outcomes=[];
for(const question of queries){
 const plan=await planLabQuery(question,catalog,noAI),result=executeLabQuery(catalog,plan,'wonder-milk');
 const answer=await answerLabV11(index,question,noAI);
 assert.equal(plan.clarification,'');
 assert.equal(result.reports.length,result.evidence.sources.length);
 if(plan.intent==='pdf')assert.equal((answer.match(/https:\/\/drive\.google\.com\/file\/d\//g)||[]).length,result.reports.filter(r=>r.original_pdf_url).length);
 if(plan.filters.length)assert.ok(result.reports.every(r=>r.results.DM_percent.value>32&&r.results.starch_percent_DM.value>30));
 outcomes.push({question,matched_versions:result.matched_report_versions,distinct_lab_ids:result.distinct_lab_ids,version_conflicts:result.version_conflict_ids.length,answer_characters:answer.length});
}
assert.deepEqual(readFileSync(path),bytes,'Source file changed');
console.log(JSON.stringify({source_sha256:createHash('sha256').update(bytes).digest('hex'),snapshot_id:catalog.snapshot_id,source_modified:false,reports:catalog.reports.length,outcomes},null,2));
