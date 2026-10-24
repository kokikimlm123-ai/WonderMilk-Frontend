import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rm,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {permitted,ManualImages} from './manual-images.mjs';
const run=promisify(execFile);
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().trim();
const idFromUrl=s=>String(s||'').match(/^https:\/\/(?:drive\.google\.com\/file|docs\.google\.com\/(?:spreadsheets|presentation|document))\/d\/([\w-]+)(?:\/|$)/)?.[1];
export function fileImageRequest(text){
 const q=String(text||'').normalize('NFKC').replace(/[၀-၉๐-๙]/g,c=>String(c.charCodeAt(0)-(c>='၀'&&c<='၉'?0x1040:0x0e50))).trim();
 const command=/^\/(?:image|fileimage)(?:\s|$)/i.test(q);
 if(!command&&!(/\b(?:image|photo|picture|screenshot)s?\b|ပုံ|ဓာတ်ပုံ|รูป|ภาพ/i.test(q)&&/\b(?:lab|report|file|pdf|sheet|slide|nutrition|mastitis|forage)\b|ဖိုင်|အစီရင်ခံ|รายงาน|ไฟล์|\d{8}/i.test(q)))return null;
 const matches=[...q.matchAll(/(?:\b(?:page|slide)\b|စာမျက်နှာ|หน้า|สไลด์)\s*[:#]?\s*([+-]?\d+(?:\.\d+)?)/gi)];
 if(matches.length>1)return {error:true};
 const m=matches[0],page=m?Number(m[1]):1;
 if(q.length>1000||!Number.isInteger(page)||page<1||page>500||m&&/^\s*(?:[-–—,\/]|and\b|to\b|နှင့်|နဲ့|ถึง|และ)\s*\d/i.test(q.slice(m.index+m[0].length)))return {error:true};
 let query=q.replace(/^\/(?:image|fileimage)\s*/i,'');if(m)query=query.replace(m[0],'');
 query=query.replace(/\b(?:send|me|please|show|an?|the|as|original|images?|photos?|pictures?|screenshots?|of|for|lab|id|report)\b/gi,' ').replace(/ပို့ပေးပါ|ပြပေးပါ|ဓာတ်ပုံ|ပုံ|ส่ง|ขอ|รูป|ภาพ/g,' ').replace(/["“”]/g,'').trim();
 return {query,page,list:/^(?:list|files)$/i.test(query),error:!query};
}
export function fileCatalog(index,c,privateLab=false){
 const files=[];
 for(const r of index?.reports||[])files.push({id:idFromUrl(r.original_pdf_url),name:r.filenames?.[0]||r.lab_id,aliases:[r.lab_id,...(r.filenames||[])],scope:'lab'});
 for(const m of index?.manuals||[])files.push({id:m.source_drive_id||idFromUrl(m.original_pdf_url),name:m.source_filename||m.title,aliases:[m.id,m.title,m.source_filename],scope:'lab'});
 if(!privateLab)for(const farm of ['Farm 2','Farm 4','Ryokusan'])for(const type of ['cow','milk_test','milk','feed'])files.push({id:'farm-snapshot',name:`${farm} ${type} data`,aliases:[`${farm} ${type}`,`${farm} ${type} data`],scope:'farm',farm,type});
 return files;
}
export function selectFile(files,query){
 const q=norm(query),ids=[...q.matchAll(/\b\d{8}\b/g)].map(m=>m[0]);
 if(ids.length>1)return [];
 if(ids.length)return files.filter(f=>f.aliases.includes(ids[0]));
 const exact=files.filter(f=>[f.name,...f.aliases].some(a=>a&&norm(a)===q));
 return exact.length?exact:files.filter(f=>[f.name,...f.aliases].some(a=>a&&norm(a).includes(q)));
}
const text=(lang,en,my,th)=>lang==='my'?my:lang==='th'?th:en;
export class FileImages {
 constructor(c,store,google){Object.assign(this,{c,store,google});this.cache=join(c.dir,'file-images-v1');
 store.db.exec(`CREATE TABLE IF NOT EXISTS file_images_outbox(id TEXT PRIMARY KEY,target TEXT NOT NULL,actor TEXT NOT NULL,scope TEXT NOT NULL,caption TEXT NOT NULL,ticket TEXT UNIQUE NOT NULL,retry_key TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,fetches INTEGER NOT NULL DEFAULT 0);CREATE INDEX IF NOT EXISTS file_image_limits ON file_images_outbox(actor,created);`);}
 origin(){return ManualImages.prototype.origin.call(this);}
 allowed(target,scope){return permitted(this.c,this.store,target)&&!(scope==='farm'&&target.startsWith('U'));}
 async render(source,page,ticket){
  const dir=join(this.cache,ticket);await mkdir(dir,{recursive:true,mode:0o700});
  try{
   const data=source.scope==='farm'?{ext:'snapshot',name:source.name}:await this.google.imageSource(source.id),ext=data.ext;
   let pdf=join(dir,'source.pdf');
   if(ext==='snapshot'){
    const evidence=await this.google.sources({farms:[source.farm],type:source.type,date_from:null,date_to:null});
    const input=join(dir,'evidence.json');await writeFile(input,JSON.stringify(evidence),{mode:0o600});
    await run(this.c.python,[new URL('../scripts/render_data_snapshot.py',import.meta.url).pathname,input,pdf,source.name],{timeout:30000,maxBuffer:1024*1024});
   }else if(ext==='pdf')await writeFile(pdf,data.bytes,{mode:0o600});
   else if(['xlsx','xls','pptx','ppt','docx','doc','ods','odp','odt'].includes(ext)){
    const input=join(dir,'source.'+ext);await writeFile(input,data.bytes,{mode:0o600});
    await run('/usr/bin/libreoffice',['-env:UserInstallation=file://'+join(dir,'profile'),'--headless','--convert-to','pdf','--outdir',dir,input],{timeout:90000,maxBuffer:1024*1024});
   }else if(['jpg','png'].includes(ext)){
    if(page!==1)throw Error('page_out_of_range');
    const input=join(dir,'source.'+ext);await writeFile(input,data.bytes,{mode:0o600});
    await run(this.c.python,[new URL('../scripts/render_source_image.py',import.meta.url).pathname,input,dir],{timeout:30000,maxBuffer:1024*1024});
   }else throw Error('unsupported_type');
   let pages=1;
   if(!['jpg','png'].includes(ext)){
    const {stdout}=await run('/usr/bin/pdfinfo',[pdf],{timeout:15000,maxBuffer:1024*1024});pages=Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
    if(!pages||page>pages)throw Error('page_out_of_range');
    for(const [kind,width,quality] of [['original',2400,90],['preview',800,80]])await run('/usr/bin/pdftoppm',['-f',String(page),'-l',String(page),'-singlefile','-scale-to',String(width),'-jpeg','-jpegopt',`quality=${quality}`,pdf,join(dir,kind)],{timeout:30000,maxBuffer:1024*1024});
   }
   for(const [kind,max] of [['original',10000000],['preview',1000000]]){const b=await readFile(join(dir,kind+'.jpg'));if(b.length>max||b[0]!==255||b[1]!==216)throw Error('invalid_image');}
   for(const name of await readdir(dir))if(!['original.jpg','preview.jpg'].includes(name))await rm(join(dir,name),{recursive:true,force:true});
   return {pages,name:data.name||source.name,converted:ext!=='pdf'&&!['jpg','png'].includes(ext)};
  }catch(e){await rm(dir,{recursive:true,force:true});throw e;}
 }
 async queue(job,target,actor,request,lang){
  if(!permitted(this.c,this.store,target))return;
  const out=s=>this.store.out(job.id,target,s),db=this.store.db,now=Date.now();
  if(db.prepare('SELECT 1 FROM file_images_outbox WHERE id=?').get(job.id))return;
  if(request.error)return out(text(lang,'Use /image <Lab ID or filename> page 1. One file and page at a time. /image list lists sources.','/image <Lab ID သို့မဟုတ် ဖိုင်အမည်> page 1 သုံးပါ။ တစ်ကြိမ် ဖိုင်တစ်ခု၊ စာမျက်နှာတစ်ခုပါ။ /image list ဖြင့် ဖိုင်စာရင်းကြည့်ပါ။','ใช้ /image <Lab ID หรือชื่อไฟล์> page 1 ครั้งละหนึ่งไฟล์และหนึ่งหน้า ดูรายการด้วย /image list'));
  try{
   const index=this.c.cvasIndex?await this.google.cvasIndex():{reports:[],manuals:[]};const files=fileCatalog(index,this.c,target.startsWith('U'));
   if(request.list)return out(files.slice(0,60).map(f=>f.name+(f.id?'':' [original not linked]')).join('\n')+`\nShowing ${Math.min(60,files.length)} / ${files.length}. /image <filename> page 1`);
   const found=selectFile(files,request.query);
   if(found.length!==1)return out(text(lang,'Please specify one exact filename or Lab ID.','ဖိုင်အမည်အတိအကျ သို့မဟုတ် Lab ID တစ်ခု သတ်မှတ်ပေးပါ။','กรุณาระบุชื่อไฟล์หรือ Lab ID ให้ตรงหนึ่งรายการ')+'\n'+found.slice(0,8).map(f=>f.name).join('\n'));
   const source=found[0];if(!this.allowed(target,source.scope))return;
   if(!source.id)return out(text(lang,'The original file is not linked yet; its text index cannot reproduce the original image.','မူရင်းဖိုင် link မချိတ်ထားသေးပါ။ စာသားအညွှန်းမှ မူရင်းပုံကို ထုတ်မပေးနိုင်ပါ။','ยังไม่ได้เชื่อมโยงไฟล์ต้นฉบับ ดัชนีข้อความไม่สามารถสร้างภาพต้นฉบับได้'));
   const counts=db.prepare('SELECT COUNT(*) total,SUM(actor=?) person,SUM(actor=? AND created>?) recent FROM file_images_outbox WHERE created>?').get(actor,actor,now-600000,now-86400000);
   if(counts.total>=100||counts.person>=30||counts.recent>=5)return out(text(lang,'Image limit reached; try later.','ပုံတောင်းဆိုမှု ကန့်သတ်ချက်ပြည့်ပါပြီ။ နောက်မှပြန်တောင်းပါ။','ถึงขีดจำกัดรูปแล้ว กรุณาลองภายหลัง'));
   this.origin();const ticket=randomBytes(32).toString('hex');
   // Reserve the request before conversion so failed requests also count towards limits.
   db.prepare('INSERT INTO file_images_outbox(id,target,actor,scope,caption,ticket,retry_key,created,expires,status) VALUES(?,?,?,?,?,?,?,?,?,?)').run(job.id,target,actor,source.scope,'',ticket,randomUUID(),now,now+7200000,'rendering');
   try{const result=await this.render(source,request.page,ticket);
    const caption=`${result.name}\n${source.scope==='farm'?'Source-data snapshot (not original workbook layout) page':result.converted?'Converted document / print page':'PDF viewer / image page'} ${request.page} / ${result.pages}. Original source content; link expires in 2 hours.`;
    db.prepare("UPDATE file_images_outbox SET caption=?,status='queued',expires=? WHERE id=?").run(caption,Date.now()+7200000,job.id);
   }catch(e){db.prepare("UPDATE file_images_outbox SET status='failed' WHERE id=?").run(job.id);throw e;}
  }catch(e){console.error(JSON.stringify({file_image_error:e.message==='page_out_of_range'?'page_out_of_range':'source_or_renderer',status:e.status}));out(text(lang,e.message==='page_out_of_range'?'That page does not exist. Request a lower page number.':'The original file could not be rendered. It may need bot read access or a supported PDF/Office/image source.','မူရင်းပုံထုတ်မရပါ။ စာမျက်နှာနံပါတ်၊ မူရင်းဖိုင်နှင့် bot ဖတ်ခွင့်ကို စစ်ရန်လိုပါတယ်။','ไม่สามารถสร้างภาพได้ โปรดตรวจสอบเลขหน้า ไฟล์ต้นฉบับ และสิทธิ์อ่านของบอท'));}
 }
 async tick(line){
  const db=this.store.db,now=Date.now();db.prepare("UPDATE file_images_outbox SET status='failed' WHERE status IN ('queued','rendering') AND created<?").run(now-900000);
  const row=db.prepare("SELECT * FROM file_images_outbox WHERE status='queued' AND next_attempt<=? ORDER BY created LIMIT 1").get(now);if(!row)return;
  if(!this.allowed(row.target,row.scope)){db.prepare("UPDATE file_images_outbox SET status='cancelled' WHERE id=?").run(row.id);return;}
  const base=this.origin()+'/media/files/'+row.ticket;
  try{await line.sendMessages(row.target,[{type:'text',text:row.caption},{type:'image',originalContentUrl:base+'/original.jpg',previewImageUrl:base+'/preview.jpg'}],row.retry_key);db.prepare("UPDATE file_images_outbox SET status='sent' WHERE id=?").run(row.id);}
  catch{db.prepare("UPDATE file_images_outbox SET attempts=attempts+1,next_attempt=?,status=CASE WHEN attempts>=9 THEN 'failed' ELSE 'queued' END WHERE id=?").run(now+Math.min(300,2**row.attempts)*1000,row.id);}
 }
 async serve(req,res,path){
  const headers={'cache-control':'private, no-store','x-robots-tag':'noindex, nofollow, noarchive','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};const deny=()=>{res.writeHead(404,headers);res.end();};
  const m=path.match(/^\/media\/files\/([a-f0-9]{64})\/(original|preview)\.jpg$/);if(!m||!['GET','HEAD'].includes(req.method))return deny();
  const row=this.store.db.prepare("SELECT * FROM file_images_outbox WHERE ticket=? AND expires>? AND fetches<100 AND status IN ('queued','sent')").get(m[1],Date.now());
  if(!row||!this.c.enabled||!this.allowed(row.target,row.scope))return deny();
  this.store.db.prepare('UPDATE file_images_outbox SET fetches=fetches+1 WHERE id=?').run(row.id);
  try{const b=await readFile(join(this.cache,row.ticket,m[2]+'.jpg'));res.writeHead(200,{...headers,'content-type':'image/jpeg','content-length':b.length});res.end(req.method==='HEAD'?undefined:b);}catch{deny();}
 }
 async clean(){
  for(const ticket of await readdir(this.cache).catch(()=>[]))if(/^[a-f0-9]{64}$/.test(ticket)){const path=join(this.cache,ticket);if((await stat(path)).mtimeMs<Date.now()-3*3600000)await rm(path,{recursive:true,force:true});}
  this.store.db.prepare('DELETE FROM file_images_outbox WHERE created<?').run(Date.now()-86400000);
 }
}
