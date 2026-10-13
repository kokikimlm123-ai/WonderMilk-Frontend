import {structuredText} from './domain.mjs';
import {mediaKey} from './store.mjs';
export class Worker {
 constructor(c,store,extractor,media){Object.assign(this,{c,store,extractor,media});this.running=false;this.lastPrune=0;}
 async tick(){if(this.running)return;this.running=true;try{
  await this.store.deleteMedia(this.media);
  if(Date.now()-this.lastPrune>3600000){await this.store.prune();this.lastPrune=Date.now();}
  if(!this.c.enabled)return;
  const e=await this.store.claim();if(!e)return;
  try{
   if(!this.c.groups.some(g=>g.enabled&&g.id===e.group_id&&g.farm===e.farm))throw new Error('group_disabled');
   let result,evidence={},image=null;
   if(e.kind==='image'){
    if(!this.media)throw new Error('media_not_configured');
    image=await this.media.download(e.message_id);evidence=await this.media.put(mediaKey(e.group_id,e.message_id),image);
    result=await this.extractor.extract('',image,e.farm);
   }else{result=structuredText(e.body?.text||'');if(result.issues.length){const extracted=await this.extractor.extract(e.body?.text||'',null,e.farm);result=extracted.method==='manual'&&result.records.length?{...result,issues:[...result.issues,...extracted.issues]}:extracted;}}
   if(Number(e.source_at)<Date.now()-15*60*1000)result.issues.push('delayed_event_check_record_date');
   if(!await this.store.complete(e,result,evidence)&&evidence.key)await this.media.remove(evidence.key);
  }catch(err){const safe=new Set(['group_disabled','media_not_configured','line_media_unavailable','unsupported_image','content_too_large','extraction_service_unavailable','extraction_incomplete','invalid_extraction']);await this.store.fail(e,safe.has(err.message)?err.message:'processing_failed');}
 }finally{this.running=false;}}
}
