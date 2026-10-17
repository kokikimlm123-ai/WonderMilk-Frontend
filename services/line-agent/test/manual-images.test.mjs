import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/core.mjs';
import {ManualImages,manualImageRequest,imageText,MANUAL_SHA,digest} from '../src/manual-images.mjs';
import {Worker} from '../src/worker.mjs';
import {createApp} from '../src/server.mjs';
const G='C'+'1'.repeat(32),U='U'+'2'.repeat(32);
function setup(t) {
 const dir=mkdtempSync(join(tmpdir(),'manual-image-')),store=new Store(dir);
 const c={dir,group:G,enabled:true,manualImageOrigin:'https://bot.example',labAllowedUsers:[U]};
 const google={manualPdf:async()=>{throw Error('No fixture');}},images=new ManualImages(c,store,google);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {dir,store,c,google,images};
}
test('printed 29 and 34 mapping; viewer explicit; multilingual digits',()=>{
 for(const q of ['/manual page 29','send me CVAS manual page 29 photo','CVAS လက်စွဲ စာမျက်နှာ ၂၉ ပုံပို့ပေးပါ','ขอรูปคู่มือ CVAS หน้า ๒๙'])assert.deepEqual(manualImageRequest(q),{printed:29,viewer:30,index:29},q);
 assert.deepEqual(manualImageRequest('/manual page 34'),{printed:34,viewer:35,index:34});
 assert.deepEqual(manualImageRequest('/manual pdf page 30'),{printed:29,viewer:30,index:29});
 assert.deepEqual(manualImageRequest('/manual page 36'),{printed:36,viewer:37,index:36});
});
test('invalid, multiple and out-of-range pages; text Q&A preserved',()=>{
 for(const q of ['/manual page','/manual page 0','/manual page -1','/manual page 37','/manual page 29.5','/manual page 29-34','/manual page 29 and 34','/manual page 29 / page 34','/manual page ../../etc/passwd','/manual pdf page 1'])assert.deepEqual(manualImageRequest(q),{error:true},q);
 for(const q of ['/cvas Lab ID 39170011','/manual explain drying','/photo Farm 2','send me photo 29','summarize manual page 29'])assert.equal(manualImageRequest(q),null,q);
 for(const lang of ['en','my','th'])assert.match(imageText('caption',lang,29),/29.*30/);
});
test('authorization before rendering, idempotence, rate limits and no farm writes',async t=>{
 const {images,store}=setup(t);let rendered=0;images.render=async()=>{rendered++;};
 await images.queue({id:'bad'},'Cwrong',U,{printed:29},'en');assert.equal(rendered,0);
 for(let n=0;n<6;n++)await images.queue({id:'ev'+n},G,U,{printed:29},'en');
 await images.queue({id:'ev0'},G,U,{printed:29},'en');
 assert.equal(rendered,5);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM manual_images_outbox').get().n,5);
 assert.match(store.db.prepare("SELECT text FROM outgoing WHERE id='ev5'").get().text,/limit reached/);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM records').get().n,0);
});
test('worker direct command and approved private user routing; other groups ignored',async t=>{
 const {c,store,google}=setup(t);const w=new Worker(c,store,google,{plan:()=>{throw Error('Unexpected AI');}},{});let count=0;
 w.manualImages.render=async()=>{count++;};
 async function event(id,source,text){const e={webhookEventId:id,type:'message',timestamp:Date.now(),source,message:{type:'text',id,text}};store.enqueue([e]);await w.process({id,payload:JSON.stringify(e)});}
 await event('g',{type:'group',groupId:G,userId:U},'/manual page 29');
 await event('u',{type:'user',userId:U},'send me CVAS manual page 34 photo');
 await event('bad',{type:'group',groupId:'Cwrong',userId:U},'/manual page 29');
 await event('unknown',{type:'user',userId:'U'+'3'.repeat(32)},'/manual page 29');
 assert.equal(count,2);
});
test('HTTPS image payload, stable retries and revoked recipient cancellation',async t=>{
 const {images,store}=setup(t);images.render=async()=>{};
 await images.queue({id:'a'},G,U,{printed:29},'en');const calls=[];
 const line={sendMessages:async(...args)=>{calls.push(args);if(calls.length===1)throw Error('timeout');}};
 await images.tick(line);store.db.prepare('UPDATE manual_images_outbox SET next_attempt=0').run();await images.tick(line);
 assert.deepEqual(calls[0],calls[1]);assert.equal(calls[1][1][1].type,'image');assert.match(calls[1][1][1].originalContentUrl,/^https:\/\/bot.example\/media\/manual\/[a-f0-9]{64}\/original.jpg$/);
 await images.queue({id:'b'},G,U,{printed:29},'en');store.set('group_paused','true');await images.tick(line);
 assert.equal(store.db.prepare("SELECT status FROM manual_images_outbox WHERE id='b'").get().status,'cancelled');
});
test('unavailable source and out-of-range requests have localized fallback',async t=>{
 const {images,store}=setup(t);
 await images.queue({id:'x'},G,U,{printed:29},'my');await images.queue({id:'y'},G,U,{error:true},'th');
 assert.match(store.db.prepare("SELECT text FROM outgoing WHERE id='x'").get().text,/မရနိုင်/);
 assert.match(store.db.prepare("SELECT text FROM outgoing WHERE id='y'").get().text,/1–36/);
});
test('actual PDF rendering and HTTP token security',{skip:!process.env.CVAS_TEST_PDF},async t=>{
 const {images,store,c,google}=setup(t);const bytes=readFileSync(process.env.CVAS_TEST_PDF);assert.equal(digest(bytes),MANUAL_SHA);google.manualPdf=async()=>bytes;
 const rendered=await images.render(29);assert.ok(rendered.original.length<10000000);assert.ok(rendered.preview.length<1000000);
 await images.queue({id:'live'},G,U,{printed:29},'en');const row=store.db.prepare('SELECT * FROM manual_images_outbox').get();
 const server=createApp(c,store,images);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port,path='/media/manual/'+row.ticket+'/original.jpg';
 let res=await fetch(base+path);assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'image/jpeg');assert.match(res.headers.get('x-robots-tag'),/noindex/);assert.match(res.headers.get('cache-control'),/no-store/);assert.deepEqual(Buffer.from(await res.arrayBuffer()),rendered.original);
 for(const p of ['/media/manual/29/original.jpg','/media/manual/'+ 'f'.repeat(64)+'/original.jpg','/media/manual/'+row.ticket+'/source.pdf'])assert.equal((await fetch(base+p)).status,404);
 store.db.prepare('UPDATE manual_images_outbox SET expires=0').run();assert.equal((await fetch(base+path)).status,404);
 store.db.prepare('UPDATE manual_images_outbox SET expires=?').run(Date.now()+10000);store.set('group_paused','true');assert.equal((await fetch(base+path)).status,404);
});
