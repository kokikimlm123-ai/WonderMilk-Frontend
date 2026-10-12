import {createHash} from 'node:crypto';
import {qualityMetrics} from './lab-metrics.mjs';

export const METRICS=Object.freeze({
 DM_percent:{label:'DM',basis:'as_received',unit:'%',sourceLabel:'Dry Matter'},
 starch_percent_DM:{label:'Starch',basis:'DM',unit:'%',sourceLabel:'Starch'},
 CP_percent_DM:{label:'CP',basis:'DM',unit:'%',sourceLabel:'Crude Protein'},
 ADF_percent_DM:{label:'ADF',basis:'DM',unit:'%',sourceLabel:'ADF'},
 NDF_percent_DM:{label:'NDF',basis:'DM',unit:'%',sourceLabel:'aNDF'},
 lignin_percent_DM:{label:'Lignin',basis:'DM',unit:'%',sourceLabel:'Lignin'},
 ...Object.fromEntries([12,24,30,48,72,120,240].map(h=>[`NDFD${h}_percent_NDF`,{label:`NDFD${h}`,basis:'NDF',unit:'%',sourceLabel:`NDF Digestibility (${h} hr)`}])),
 lactic_percent_DM:{label:'Lactic',basis:'DM',unit:'%',sourceLabel:'Lactic Acid (%DM)'},
 acetic_percent_DM:{label:'Acetic',basis:'DM',unit:'%',sourceLabel:'Acetic Acid (%DM)'},
 butyric_percent_DM:{label:'Butyric',basis:'DM',unit:'%',sourceLabel:'Butyric Acid (%DM)'},
 pH:{label:'pH',basis:null,unit:null,sourceLabel:'pH'},
});
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function filenameParts(filename) {
 const stem=filename.replace(/\.pdf$/i,'').replace(/\s+\(\d+\)$/,'').trim();
 const tokens=stem.toUpperCase().split(/[-_\s]+/).filter(Boolean);
 const types=[...new Set(tokens.filter(t=>['CS','TMR','CBG'].includes(t)))];
 return {original:filename,stem,tokens,date_code:/^\d{6}$/.test(tokens[0])?tokens[0]:null,
  sample_type:types.length===1?types[0]:null,unresolved_tokens:tokens.filter(t=>!['CS','TMR','CBG'].includes(t))};
}
// Normalization is read-only. Imported/extracted evidence is NEVER auto-approved.
export function normalizeCatalog(index,projectId='wonder-milk') {
 if(typeof projectId!=='string'||!projectId.trim())throw Error('Project scope required');
 if(!Array.isArray(index.reports))throw Error('Reports required');
 const sourceIds=new Set();
 const reports=index.reports.map(r=>{
  if(!/^[a-f0-9]{64}$/.test(r.sha256)||sourceIds.has(r.sha256)||!Array.isArray(r.filenames)||!r.filenames.length||r.filenames.some(n=>typeof n!=='string')||typeof r.text!=='string')throw Error('Invalid source identity');
  sourceIds.add(r.sha256);
  const names=r.filenames.map(filenameParts),types=[...new Set(names.map(n=>n.sample_type).filter(Boolean))];
  const sampleType=types.length===1?types[0]:null;
  const labId=typeof r.lab_id==='string'&&/^\d{8}$/.test(r.lab_id)?r.lab_id:null;
  const measured=qualityMetrics(r),lines=r.text.split('\n');
  const column=lines.find(l=>l.includes('SAMPLE INFORMATION')&&l.includes('MINERALS'))?.indexOf('MINERALS');
  const results=Object.fromEntries(Object.entries(METRICS).map(([key,def])=>{
   const value=Number.isFinite(measured[key])?measured[key]:null;
   const valid=value===null||value>=0&&(key!=='pH'||value<=14)&&(def.unit!=='%'||value<=100);
   const onRight=/^(lactic|acetic|butyric|pH)/.test(key);
   const line=lines.findIndex(l=>{const part=(column>0?(onRight?l.slice(column):l.slice(0,column)):l).trimStart();return part.startsWith(def.sourceLabel)&&/^(?:\s|$)/.test(part.slice(def.sourceLabel.length));});
   return [key,{value:valid?value:null,unit:def.unit,basis:def.basis,method:null,
    status:!valid?'invalid':value===null?'missing':'extracted',
    missing_reason:!valid?'out_of_range':value===null?(measured.layout?'unrecognized_layout':'not_available_in_extracted_text'):null,
    locator:line<0?null:{kind:'extracted_text_line',line:line+1,source_sha256:r.sha256}}];
  }));
  return {project_id:projectId,source_version_id:r.sha256,source_filename:r.filenames[0],filenames:[...r.filenames],names,
   lab_id:labId,sample_key:labId?`${projectId}:CVAS:${labId}`:null,sample_type:sampleType,
   collection_date:null,farm_id:null,verification_status:'imported',source_updated_at:null,indexed_on:index.indexed_on??null,
   original_pdf_url:/^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+\/view$/.test(r.original_pdf_url||'')?r.original_pdf_url:null,
   extracted_text_sha256:hash(r.text),extraction_version:'cvas-two-column-v1',results,warnings:[...(!labId?['missing_lab_id']:[]),...(types.length>1?['conflicting_sample_types']:[]),...(measured.layout?['unrecognized_layout']:[])]};
 });
 const versions=new Map();
 for(const r of reports)if(r.sample_key)versions.set(r.sample_key,(versions.get(r.sample_key)||0)+1);
 for(const r of reports)r.report_versions_for_lab_id=r.sample_key?versions.get(r.sample_key):0;
 return {schema_version:2,project_id:projectId,snapshot_id:hash(reports.map(r=>({id:r.source_version_id,filenames:r.filenames,text:r.extracted_text_sha256,extractor:r.extraction_version}))),reports};
}
export function matchTerm(report,term) {
 const t=term.trim().toUpperCase();
 return report.lab_id===t||report.names.some(n=>n.original.toUpperCase()===t||n.stem.toUpperCase()===t||n.tokens.includes(t));
}
export function csScreen(report) {
 if(report.sample_type!=='CS')return 'not_applicable';
 const dm=report.results.DM_percent.value,starch=report.results.starch_percent_DM.value;
 if(dm===null||starch===null)return 'missing';
 return dm>32&&starch>30?'pass':'fail';
}
