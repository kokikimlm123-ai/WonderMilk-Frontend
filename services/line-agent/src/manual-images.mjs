import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {labAllowed} from './lab-access.mjs';
const run=promisify(execFile);
export const MANUAL_SHA='b7e674e1bbce9af057406c36b982591f81e73f6e9c5a05ffce8e1a1b3934da71';
export const digest=b=>createHash('sha256').update(b).digest('hex');
export function manualImageRequest(text) {
 const q=String(text??'').normalize('NFKC').replace(/[၀-၉๐-๙]/g,c=>String(c.charCodeAt(0)-(c>='၀'&&c<='၉'?0x1040:0x0e50))).trim();
 const command=/^\/manual(?:\s|$)/i.test(q);
 const pageWord=/\bpages?\b|စာမျက်နှာ|หน้า/i.test(q);
 const imageWord=/\b(?:photos?|images?|pictures?|screenshots?)\b|ပုံ|ဓာတ်ပုံ|รูป|ภาพ/i.test(q);
 const manual=/\b(?:CVAS|manual)\b|လက်စွဲ|คู่มือ/i.test(q);
 if(!(command&&pageWord)&&!(manual&&pageWord&&imageWord))return null;
 const matches=[...q.matchAll(/(?:\bpages?\b|စာမျက်နှာ|หน้า)\s*(?:နံပါတ်|ที่|number|no\.?|#)?\s*[:#]?\s*([+-]?\d+(?:\.\d+)?)/gi)];
 const raw=matches[0]?.[1];
 // Only one explicit page; never silently select the first of a range/list.
 const tail=matches[0]?q.slice(matches[0].index+matches[0][0].length):'';
 const ambiguous=matches.length!==1||/^\s*(?:[-–—/,]|and\b|to\b|နှင့်|နဲ့|မှ|ถึง|และ)\s*\d/i.test(tail);
 const viewer=/\b(?:viewer|pdf)\s+(?:page|စာမျက်နှာ|หน้า)|\b(?:page|စာမျက်နှာ|หน้า)\s*\d+\s*\(?\s*(?:viewer|pdf)/i.test(q);
 const n=Number(raw),printed=viewer?n-1:n;
 if(q.length>1000||ambiguous||!raw||!Number.isInteger(n)||printed<1||printed>36)return {error:true};
 return {printed,viewer:printed+1,index:printed};
}
export function imageText(kind,lang='en',p=0) {
 const texts={
 help:[ 'Use /manual page 29 for one PRINTED page (1–36). Printed 29 = PDF viewer 30. For viewer numbering use /manual pdf page 30.',
 'စာအုပ်ပေါ်က စာမျက်နှာ ၁–၃၆ ကို /manual page 29 လို တစ်မျက်နှာစီ တောင်းပါ။ Printed 29 = PDF viewer 30 ဖြစ်ပါတယ်။ PDF နံပါတ်ဆို /manual pdf page 30 သုံးပါ။',
 'ใช้ /manual page 29 เพื่อขอหน้าที่พิมพ์ในคู่มือทีละหน้า (1–36) หน้าที่พิมพ์ 29 = หน้า PDF viewer 30 หากใช้เลข PDF ให้ใช้ /manual pdf page 30'],
 limit:['Manual image limit reached. Please try again later (5 per 10 minutes; 30 per person per day).','Manual ပုံတောင်းဆိုမှု ကန့်သတ်ချက်ပြည့်ပါပြီ။ နောက်မှ ပြန်တောင်းပါ (၁၀ မိနစ်လျှင် ၅ ပုံ၊ လူတစ်ဦး တစ်ရက် ၃၀ ပုံ)။','ถึงขีดจำกัดรูปคู่มือแล้ว กรุณาลองภายหลัง (5 รูปต่อ 10 นาที และ 30 รูปต่อคนต่อวัน)'],
 unavailable:['The original manual image is temporarily unavailable. Please try again later. /cvas text questions still work.','မူရင်း Manual ပုံကို ယခု မရနိုင်သေးပါ။ နောက်မှ ပြန်တောင်းပါ။ /cvas ဖြင့် စာသားမေးခွန်း မေးနိုင်ပါတယ်။','รูปคู่มือต้นฉบับยังไม่พร้อม กรุณาลองภายหลัง ยังถามข้อความด้วย /cvas ได้'],
 caption:[`CVAS Manual 1.6 — printed Page ${p} · PDF viewer Page ${p+1} (index ${p}). Original page image. Internal use only; do not redistribute. Image link expires in 2 hours.`,
 `CVAS Manual 1.6 — စာအုပ်ပေါ်က Page ${p} · PDF viewer Page ${p+1} (index ${p})။ မူရင်းစာမျက်နှာပုံ ဖြစ်ပါတယ်။ အတွင်းသုံးအတွက်သာ၊ ပြန်မဖြန့်ဝေပါနှင့်။ ပုံလင့်ခ်သက်တမ်း ၂ နာရီပါ။`,
 `CVAS Manual 1.6 — หน้าที่พิมพ์ ${p} · หน้า PDF viewer ${p+1} (index ${p}) ภาพจากต้นฉบับ ใช้ภายในเท่านั้น ห้ามเผยแพร่ต่อ ลิงก์ภาพหมดอายุใน 2 ชั่วโมง`]
 };return texts[kind][lang==='my'?1:lang==='th'?2:0];
}
export function permitted(c,store,target) {
 return target?.startsWith('U')?labAllowed(c,store,target):!!target&&target===(c.group||store.setting('group'))&&store.setting('group_paused')!=='true';
}
export class ManualImages {
 constructor(c,store,google) {
  Object.assign(this,{c,store,google});this.cache=join(c.dir,'manual-images-v1');this.rendering=new Map();
  store.db.exec(`CREATE TABLE IF NOT EXISTS manual_images_outbox(
   id TEXT PRIMARY KEY,target TEXT NOT NULL,actor TEXT NOT NULL,page INTEGER NOT NULL,caption TEXT NOT NULL,
   ticket TEXT NOT NULL UNIQUE,retry_key TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,
   status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,fetches INTEGER NOT NULL DEFAULT 0);
   CREATE INDEX IF NOT EXISTS manual_image_limits ON manual_images_outbox(actor,created);`);
 }
 origin() {
  const url=new URL(this.c.manualImageOrigin||'');
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('HTTPS image origin required');
  return url.origin;
 }
 async pdf() {
  if(this.pdfReady)return this.pdfReady;
  this.pdfReady=(async()=>{
   await mkdir(this.cache,{recursive:true,mode:0o700});const path=join(this.cache,'source.pdf');
   try{if(digest(await readFile(path))===MANUAL_SHA)return path;}catch{}
   const bytes=await this.google.manualPdf();
   if(digest(bytes)!==MANUAL_SHA)throw Error('Manual version mismatch');
   await writeFile(path+'.tmp',bytes,{mode:0o600});await rename(path+'.tmp',path);return path;
  })().catch(e=>{this.pdfReady=null;throw e;});return this.pdfReady;
 }
 async render(page) {
  if(!Number.isInteger(page)||page<1||page>36)throw Error('Invalid printed page');
  if(this.rendering.has(page))return this.rendering.get(page);
  const promise=(async()=>{
   const pdf=await this.pdf();const result={};
   for(const [kind,width,quality,max] of [['original',2400,92,10000000],['preview',800,80,1000000]]) {
    const prefix=join(this.cache,`${page}-${kind}`),file=prefix+'.jpg';let bytes;
    try{bytes=await readFile(file);}catch {
     await run('/usr/bin/pdftoppm',['-f',String(page+1),'-l',String(page+1),'-singlefile','-scale-to-x',String(width),'-scale-to-y','-1','-jpeg','-jpegopt',`quality=${quality}`,pdf,prefix+'.tmp'],{timeout:30000,maxBuffer:1024*1024});
     await rename(prefix+'.tmp.jpg',file);bytes=await readFile(file);
    }
    if(bytes.length>max||bytes[0]!==255||bytes[1]!==216)throw Error('Invalid rendered image');
    result[kind]=bytes;
   }return result;
  })().finally(()=>this.rendering.delete(page));this.rendering.set(page,promise);return promise;
 }
 async queue(job,target,actor,request,language) {
  if(!permitted(this.c,this.store,target))return;
  const db=this.store.db,now=Date.now();
  if(db.prepare('SELECT 1 FROM manual_images_outbox WHERE id=?').get(job.id))return;
  if(request.error){this.store.out(job.id,target,imageText('help',language));return;}
  const counts=db.prepare('SELECT COUNT(*) AS total,SUM(actor=?) AS person,SUM(actor=? AND created>?) AS recent FROM manual_images_outbox WHERE created>?').get(actor,actor,now-600000,now-86400000);
  if(counts.total>=100||counts.person>=30||counts.recent>=5){this.store.out(job.id,target,imageText('limit',language));return;}
  try {
   this.origin();await this.render(request.printed);
   db.prepare('INSERT OR IGNORE INTO manual_images_outbox(id,target,actor,page,caption,ticket,retry_key,created,expires) VALUES(?,?,?,?,?,?,?,?,?)').run(job.id,target,actor,request.printed,imageText('caption',language,request.printed),randomBytes(32).toString('hex'),randomUUID(),now,now+7200000);
  }catch{console.error('manual_image_source_unavailable');this.store.out(job.id,target,imageText('unavailable',language));}
 }
 messages(row) {
  const base=this.origin()+'/media/manual/'+row.ticket;
  return [{type:'text',text:row.caption},{type:'image',originalContentUrl:base+'/original.jpg',previewImageUrl:base+'/preview.jpg'}];
 }
 async tick(line) {
  const now=Date.now(),db=this.store.db;
  db.prepare("UPDATE manual_images_outbox SET status='failed' WHERE status='queued' AND created<?").run(now-900000);
  db.prepare('DELETE FROM manual_images_outbox WHERE created<?').run(now-86400000);
  const row=db.prepare("SELECT * FROM manual_images_outbox WHERE status='queued' AND next_attempt<=? ORDER BY created LIMIT 1").get(now);
  if(!row)return;
  if(!permitted(this.c,this.store,row.target)){db.prepare("UPDATE manual_images_outbox SET status='cancelled' WHERE id=?").run(row.id);return;}
  try{await line.sendMessages(row.target,this.messages(row),row.retry_key);db.prepare("UPDATE manual_images_outbox SET status='sent' WHERE id=?").run(row.id);}
  catch{db.prepare("UPDATE manual_images_outbox SET attempts=attempts+1,next_attempt=?,status=CASE WHEN attempts>=9 THEN 'failed' ELSE 'queued' END WHERE id=?").run(now+Math.min(300,2**row.attempts)*1000,row.id);}
 }
 async serve(req,res,path) {
  const headers={'cache-control':'private, no-store','x-robots-tag':'noindex, nofollow, noarchive','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
  const deny=()=>{res.writeHead(404,headers);res.end();};
  const match=path.match(/^\/media\/manual\/([a-f0-9]{64})\/(original|preview)\.jpg$/);
  if(!match||!['GET','HEAD'].includes(req.method))return deny();
  const row=this.store.db.prepare("SELECT * FROM manual_images_outbox WHERE ticket=? AND expires>? AND fetches<100 AND status IN ('queued','sent')").get(match[1],Date.now());
  if(!row||!this.c.enabled||!permitted(this.c,this.store,row.target))return deny();
  this.store.db.prepare('UPDATE manual_images_outbox SET fetches=fetches+1 WHERE id=?').run(row.id);
  try {
   // Only pre-rendered files are served; HTTP callers cannot trigger PDF work.
   const bytes=await readFile(join(this.cache,`${row.page}-${match[2]}.jpg`));
   res.writeHead(200,{...headers,'content-type':'image/jpeg','content-length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);
  }catch{deny();}
 }
}
