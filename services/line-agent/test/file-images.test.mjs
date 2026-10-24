import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/core.mjs';
import {FileImages,fileImageRequest,fileCatalog,selectFile} from '../src/file-images.mjs';
import {manualImageRequest} from '../src/manual-images.mjs';
import {Worker} from '../src/worker.mjs';
const index={reports:[{lab_id:'39170011',filenames:['sample.pdf'],original_pdf_url:'https://drive.google.com/file/d/report-id/view'}],manuals:[]};
test('three-language image requests and page validation',()=>{
 for(const t of ['/image 39170011 page 2','send Lab ID 39170011 image page 2','39170011 ပုံ စာမျက်နှာ ၂ ပို့ပေးပါ','ขอรูป 39170011 หน้า ๒'])assert.deepEqual(fileImageRequest(t),{query:'39170011',page:2,list:false,error:false});
 for(const t of ['/image file page 0','/image file page 1-3','/image file page 1 page 2','/image file page 1.5'])assert.equal(fileImageRequest(t).error,true);
 assert.equal(fileImageRequest('show lab report 39170011 dry matter'),null);assert.equal(manualImageRequest('/image CVAS report page 1'),null);
});
test('catalog access and exact-ID lookup preserve ambiguity',()=>{
 const c={sourceIds:{cows:'cows'}};assert.equal(fileCatalog(index,c,true).length,1);assert.equal(fileCatalog(index,c).length,13);
 const files=fileCatalog(index,c);assert.equal(selectFile(files,'39170011').length,1);assert.equal(selectFile(files,'39170012').length,0);assert.equal(selectFile([...files,...files],'39170011').length,2);assert.equal(selectFile(files,'https://evil.test').length,0);
});
test('outbox deduplication, retries, expiry, revoked authorization and routing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'file-images-')),store=new Store(dir),c={dir,enabled:true,group:'G',manualImageOrigin:'https://example.com',cvasIndex:'index'};
 try{
 let reads=0,renders=0;const images=new FileImages(c,store,{cvasIndex:async()=>{reads++;return index;}});
 images.render=async(s,p,t)=>{renders++;await mkdir(join(images.cache,t),{recursive:true});await writeFile(join(images.cache,t,'original.jpg'),Buffer.from([255,216,255,217]));return {name:s.name,pages:1};};
 const request=fileImageRequest('/image 39170011');await images.queue({id:'bad'},'OTHER','U',request,'en');assert.equal(reads,0);
 await images.queue({id:'one'},'G','U',request,'en');await images.queue({id:'one'},'G','U',request,'en');assert.equal(renders,1);
 let keys=[];await images.tick({sendMessages:async(t,m,k)=>{keys.push(k);assert.equal(m[1].type,'image');throw Error('network');}});store.db.prepare('UPDATE file_images_outbox SET next_attempt=0').run();await images.tick({sendMessages:async(t,m,k)=>keys.push(k)});assert.equal(keys[0],keys[1]);
 const row=store.db.prepare('SELECT * FROM file_images_outbox').get(),path=`/media/files/${row.ticket}/original.jpg`;
 const res=()=>({writeHead(n){this.status=n;},end(){}});let r=res();await images.serve({method:'GET'},r,path);assert.equal(r.status,200);
 store.set('group_paused','true');r=res();await images.serve({method:'GET'},r,path);assert.equal(r.status,404);store.set('group_paused','false');store.db.prepare('UPDATE file_images_outbox SET expires=0').run();r=res();await images.serve({method:'GET'},r,path);assert.equal(r.status,404);
 const worker=new Worker(c,store,{}, {plan:()=>assert.fail('no AI')},{});let routed=false;worker._fileImages={queue:async()=>{routed=true;}};await worker.process({id:'route',payload:JSON.stringify({type:'message',timestamp:Date.now(),source:{type:'group',groupId:'G',userId:'U'},message:{type:'text',text:'/image 39170011 page 1'}})});assert.equal(routed,true);
 images.render=async()=>{throw Error('page_out_of_range');};await images.queue({id:'fail'},'G','U',request,'en');assert.equal(store.db.prepare('SELECT status FROM file_images_outbox WHERE id=?').get('fail').status,'failed');
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
test('real PDF rendering produces bounded JPEG and rejects missing page',async()=>{
 const {execFileSync}=await import('node:child_process');const {readFile}=await import('node:fs/promises');
 const dir=await mkdtemp(join(tmpdir(),'render-source-')),store=new Store(dir);
 try{
 const path=join(dir,'fixture.pdf');execFileSync('python3',['-c',"from reportlab.pdfgen.canvas import Canvas; import sys; c=Canvas(sys.argv[1]); c.drawString(60,700,'Lab ID 39170011 - DM 40.2%'); c.save()",path]);
 const images=new FileImages({dir,python:'python3'},store,{imageSource:async()=>({bytes:await readFile(path),ext:'pdf',name:'fixture.pdf'})});
 const result=await images.render({id:'fixture'},1,'a'.repeat(64));assert.equal(result.pages,1);const bytes=await readFile(join(images.cache,'a'.repeat(64),'original.jpg'));assert.equal(bytes[0],255);assert.ok(bytes.length<10000000);
 await assert.rejects(images.render({id:'fixture'},2,'b'.repeat(64)),/page_out_of_range/);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
