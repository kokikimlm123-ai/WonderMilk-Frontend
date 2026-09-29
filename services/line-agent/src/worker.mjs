import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,unlink,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {FARMS,missingConfiguration} from './config.mjs';
import {UserError,validDate} from './core.mjs';
import {RemoteError} from './integrations.mjs';

export const HELP=`Wonder Milk Farm AI\nFarm 2 • Farm 4 • Ryokusan\nအဖွဲ့ဝင်အားလုံး မေး/သွင်း/ပြင်နိုင်ပါတယ်။\n\n/farm Farm 2 Cow 001 အချက်အလက်ပြပါ\n/farm Farm 4 2026-09-15 နေ့စုစုပေါင်းနို့ 850 kg စာရင်းသွင်းပါ\n/records Farm 4 — Bot စာရင်းနှင့် Record ID ရှာရန်\n/photo Farm 2 — နောက်ပို့မည့်ဖောင်၏ Farm သတ်မှတ်ရန်\nဖောင်ဓာတ်ပုံ ပို့နိုင်ပါတယ်။ မရှင်းလင်းသည့်အချက်ကို ပြန်မေးပါမယ်။\n/cancel — မပြီးသေးသောဖောင်ကို ရပ်ရန်\n\nမူလဖိုင်တွေကို ရှာဖတ်နိုင်ပြီး Bot ကသွင်းထားသောစာရင်းတွေကို ပြင်နိုင်ပါတယ်။ မူလဖိုင် row တွေကို တိုက်ရိုက်မပြင်သေးပါ။`;
const photoName=(g,m)=>createHash('sha256').update(g+':'+m).digest('hex')+'.image';
function farmIn(text){const t=text.trim().toLowerCase().replace(/\s+/g,' ');return FARMS.find(f=>t===f.toLowerCase()||t===(f==='Ryokusan'?'ryokusan farm':f.replace(' ', '').toLowerCase()));}
export class Worker {
  constructor(c,store,google,ai,line){Object.assign(this,{c,store,google,ai,line});this.running=false;this.lastSync=0;this.lastClean=0;}
  async process(job) {
    const e=JSON.parse(job.payload),group=e.source?.groupId,actor=`${group}:${e.source?.userId||''}`;
    if(e.source?.type!=='group'||!group){this.store.finish(job.id);return;}
    let bound=this.c.group||this.store.setting('group');
    const text=e.message?.type==='text'?e.message.text||'':'';
    if(!bound) {
      if(text.startsWith('/pair ')&&e.source.userId&&this.store.bind(group,text.slice(6).trim(),this.c.pairing)) {
        this.store.out(job.id,group,'Group ချိတ်ဆက်ပြီးပါပြီ။ Farm 2၊ Farm 4၊ Ryokusan ကို အသုံးပြုနိုင်ပါပြီ။ /help နဲ့ စမ်းပါ။');
      }
      this.store.finish(job.id);return;
    }
    if(group!==bound){this.store.finish(job.id);return;}
    if(e.type==='leave') {this.store.set('group_paused','true');this.store.finish(job.id);return;}
    if(e.type==='join'){this.store.set('group_paused','false');this.store.finish(job.id);return;}
    if(e.type==='unsend') {
      const message=e.unsend?.messageId;
      if(message) {
        await unlink(join(this.c.dir,'photos',photoName(group,message))).catch(()=>{});
        this.store.db.prepare("UPDATE events SET status='cancelled',payload=NULL,plan=NULL WHERE status='queued' AND json_extract(payload,'$.message.id')=? AND json_extract(payload,'$.source.groupId')=?").run(message,group);
        const drafts=this.store.db.prepare('SELECT * FROM drafts').all();
        for(const d of drafts){const v=JSON.parse(d.value);if(d.actor.startsWith(group+':')&&v.image_message_id===message)this.store.clearDraft(d.actor);}
      }
      this.store.finish(job.id);return;
    }
    if(e.type!=='message'||!e.source.userId||this.store.setting('group_paused')==='true'){this.store.finish(job.id);return;}
    if(!['text','image'].includes(e.message.type)){this.store.finish(job.id);return;}
    if(Date.now()-Number(e.timestamp)>15*60*1000){this.store.out(job.id,group,'စာပို့ပြီး အချိန်ကြာသွားလို့ အလိုအလျောက်မသိမ်းပါ။ ပြန်ပို့ပေးပါ။');this.store.finish(job.id);return;}
    if(text==='/help'||text==='/start'){this.store.out(job.id,group,HELP);this.store.finish(job.id);return;}
    if(text==='/cancel'){this.store.clearDraft(actor);this.store.out(job.id,group,'မပြီးသေးသောဖောင်ကို ရပ်ထားပါပြီ။');this.store.finish(job.id);return;}
    if(text.startsWith('/photo ')) {
      const farm=farmIn(text.slice(7));
      if(!farm)throw new UserError('/photo Farm 2၊ /photo Farm 4 သို့မဟုတ် /photo Ryokusan ကိုသုံးပါ။');
      this.store.saveDraft(actor,{mode:'photo',farm});
      this.store.out(job.id,group,`${farm} ဖောင်ဓာတ်ပုံကို 15 မိနစ်အတွင်း ပို့ပါ။`);this.store.finish(job.id);return;
    }
    if(text.startsWith('/records')) {
      const filter=text.slice(8).trim(),farm=filter?farmIn(filter):null;
      if(filter&&!farm)throw new UserError('/records Farm 2၊ /records Farm 4 သို့မဟုတ် /records Ryokusan ကိုသုံးပါ။');
      const all=this.store.records(farm?[farm]:FARMS);
      const output=all.slice(0,8).map(r=>`${r.farm} | ${r.type} | Cow ${r.cow_id||'farm/group'} | ${r.date||'profile'} | ${r.session||'daily/profile'}\nID: ${r.id} | v${r.version}\n${JSON.stringify(r.data)}`).join('\n\n');
      this.store.out(job.id,group,output?`${output}\n\nစုစုပေါင်း ${all.length} ခုထဲမှ ${Math.min(all.length,8)} ခု ပြထားပါတယ်။`:'Bot မှသွင်းထားသောစာရင်း မရှိသေးပါ။');this.store.finish(job.id);return;
    }
    const draft=/^\/(farm|ask|add|edit)\b/.test(text)?null:this.store.draft(actor);
    const mention=e.message.mention?.mentionees?.some(m=>m.isSelf===true);
    if(e.message.type==='text'&&!/^\/(farm|ask|add|edit)\b/.test(text)&&!mention&&draft?.mode!=='clarify'){this.store.finish(job.id);return;}
    if(missingConfiguration(this.c).length)throw new UserError('Bot ချိတ်ဆက်မှု မပြီးသေးပါ။ တာဝန်ရှိသူက configuration ကို စစ်ရန်လိုပါတယ်။');
    let image=null,nextDraft=draft||{};
    if(e.message.type==='image') {
      image=await this.line.image(e.message.id);
      const file=photoName(group,e.message.id),hash=createHash('sha256').update(image.bytes).digest('hex');
      if(this.store.setting(`photo:${hash}`))throw new UserError('ဒီဓာတ်ပုံကို သိမ်းပြီးသားပါ။ /records နဲ့ စစ်နိုင်ပါတယ်။');
      await mkdir(join(this.c.dir,'photos'),{recursive:true,mode:0o700});
      await writeFile(join(this.c.dir,'photos',file),image.bytes,{mode:0o600});
      nextDraft={mode:'clarify',farm:draft?.farm||null,image_file:file,image_mime:image.mime,image_hash:hash,image_message_id:e.message.id};
      this.store.saveDraft(actor,nextDraft);
    } else if(draft?.image_file) {
      if(!/^[a-f0-9]{64}\.image$/.test(draft.image_file))throw new Error('Invalid stored image path');
      try{image={bytes:await readFile(join(this.c.dir,'photos',draft.image_file)),mime:draft.image_mime};}
      catch{throw new UserError('ယခင်ဖောင်ဓာတ်ပုံ မရှိတော့ပါ။ ပုံကို ပြန်ပို့ပါ။');}
    }
    const context={original_message:nextDraft.original_message||null,farm:nextDraft.farm||null,previous_question:nextDraft.question||null,previous_extraction:nextDraft.plan||null};
    const p=job.plan?JSON.parse(job.plan):await this.ai.plan(text||'Read this farm form and save its legible records.',context,image,this.store.records(FARMS).slice(0,30));
    this.store.db.prepare('UPDATE events SET plan=? WHERE id=?').run(JSON.stringify(p),job.id);
    if(p.action==='ignore'){this.store.clearDraft(actor);this.store.finish(job.id);return;}
    if(!Array.isArray(p.farms)||p.farms.some(f=>!FARMS.includes(f)))throw new UserError('Farm ကို ပြန်စစ်ပါ။');
    if([p.date_from,p.date_to].some(d=>d!==null&&d!==undefined&&!validDate(d))||(p.date_from&&p.date_to&&p.date_from>p.date_to))throw new UserError('မေးမြန်းသည့် ရက်စွဲအပိုင်းကို YYYY-MM-DD ဖြင့် ပြန်ပေးပါ။');
    if(p.issues?.length||p.action==='clarify'||!p.farms.length) {
      const question=(p.issues?.length?p.issues.join('\n'):p.question)||'ဘယ် Farm အတွက်လဲ — Farm 2၊ Farm 4၊ Ryokusan?';
      this.store.saveDraft(actor,{...nextDraft,mode:'clarify',original_message:nextDraft.original_message||text,plan:p,question});
      this.store.out(job.id,group,question);this.store.finish(job.id);return;
    }
    if(p.action==='ask') {
      const evidence={historical_sources:await this.google.sources(p),agent_records:this.store.records(p.farms,p),note:'Agent records are a separate live intake register. Original historical sheets are not rewritten.'};
      const answer=await this.ai.answer(p.question||text,evidence);
      this.store.out(job.id,group,answer);this.store.clearDraft(actor);
    } else if(['create','update'].includes(p.action)) {
      if(image&&p.action==='update'&&!/\/(edit|farm)\b/.test(text))throw new UserError('ပုံထဲရှိညွှန်ကြားချက်ဖြင့် မူလစာရင်း မပြင်ပါ။ ပြင်လိုသောစာရင်းကို စာဖြင့် ပြောပါ။');
      let records;
      try{records=this.store.mutate(job.id,actor,p.action,p.records,nextDraft.image_hash||null);}
      catch(error){if(error instanceof UserError)this.store.saveDraft(actor,{...nextDraft,mode:'clarify',plan:p,question:error.message});throw error;}
      let synced=false;
      try {await this.google.sync(this.store);synced=this.store.db.prepare('SELECT COUNT(*) AS n FROM changes WHERE event=? AND synced=0').get(job.id).n===0;}catch{synced=false;}
      this.store.clearDraft(actor);
      const details=records.slice(0,10).map(r=>`${r.farm} | ${r.type} | Cow ${r.cow_id||'farm/group'} | ${r.date||'profile'}\nID: ${r.id} | v${r.version}`).join('\n');
      this.store.out(job.id,group,`${records.length} ခု ${p.action==='update'?'ပြင်ဆင်':'သိမ်းဆည်း'}ပြီးပါပြီ။\n${details}\n${synced?'Google Sheets ထဲ သိမ်းပြီးပါပြီ။':'Server မှာသိမ်းထားပြီး Google Sheets သို့ ပို့ရန် စောင့်နေပါတယ်။'}\nhttps://docs.google.com/spreadsheets/d/${this.c.sheet}/edit`);
    } else throw new UserError('လုပ်ဆောင်ချက်ကို ပြန်ရေးပေးပါ။');
    this.store.finish(job.id);
  }
  async tick() {
    if(this.running||!this.c.enabled)return;this.running=true;
    try {
      const job=this.store.next();
      if(job) {
        try{await this.process(job);}catch(e) {
          const event=JSON.parse(job.payload),bound=this.c.group||this.store.setting('group');
          if(event.source?.groupId===bound) {
            const message=e instanceof UserError?e.message:e instanceof RemoteError?`ချိတ်ဆက်မှု မအောင်မြင်ပါ (${e.service}, ${e.status})။ စာရင်းအခြေအနေကို /records နဲ့ စစ်နိုင်ပါတယ်။`:'လုပ်ဆောင်မှု မပြီးဆုံးပါ။ /records နဲ့ စစ်ပြီး ပြန်ပို့ပါ။';
            this.store.out(job.id,bound,message);
          }
          this.store.finish(job.id,'failed',e instanceof UserError?'validation':e instanceof RemoteError?`${e.service}:${e.status}`:'processing_error');
        }
      }
      if(Date.now()-this.lastSync>60000&&this.c.googleJSON) {
        this.lastSync=Date.now();
        if(this.store.db.prepare('SELECT 1 FROM changes WHERE synced=0 LIMIT 1').get())await this.google.sync(this.store).catch(()=>{});
      }
      const outgoing=this.store.db.prepare("SELECT * FROM outgoing WHERE status='queued' AND next_attempt<=? ORDER BY created LIMIT 1").get(Date.now());
      if(outgoing&&this.c.token) {
        const bound=this.c.group||this.store.setting('group');
        if(outgoing.group_id!==bound||this.store.setting('group_paused')==='true')this.store.db.prepare("UPDATE outgoing SET status='cancelled' WHERE id=?").run(outgoing.id);
        else {
          try{await this.line.send(outgoing.group_id,outgoing.text,outgoing.retry_key);this.store.db.prepare("UPDATE outgoing SET status='sent' WHERE id=?").run(outgoing.id);}
          catch(e){this.store.db.prepare("UPDATE outgoing SET attempts=attempts+1,next_attempt=?,status=CASE WHEN attempts>=9 OR created<? THEN 'failed' ELSE 'queued' END WHERE id=?").run(Date.now()+Math.min(300,2**outgoing.attempts)*1000,Date.now()-23*3600000,outgoing.id);}
        }
      }
      if(Date.now()-this.lastClean>600000){this.lastClean=Date.now();await this.clean();}
    }finally{this.running=false;}
  }
  async clean() {
    this.store.db.prepare('DELETE FROM drafts WHERE expires<?').run(Date.now());
    // Retain business records/audit. Drop delivered message text after seven days.
    this.store.db.prepare("UPDATE outgoing SET text='' WHERE status IN ('sent','cancelled') AND created<?").run(Date.now()-7*86400000);
    const dir=join(this.c.dir,'photos');
    for(const file of await readdir(dir).catch(()=>[]))if(/^[a-f0-9]{64}\.image$/.test(file)) {
      const path=join(dir,file),s=await stat(path);if(s.mtimeMs<Date.now()-30*86400000)await unlink(path);
    }
  }
}
