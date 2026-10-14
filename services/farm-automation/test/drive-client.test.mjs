import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DriveClient} from '../src/drive-client.mjs';
import {archivePlan} from '../src/drive-archive.mjs';
const plan=archivePlan({groupId:'C-test',messageId:'M-test',receivedAt:Date.parse('2026-10-14T00:00:00Z'),mime:'image/jpeg'},[{id:'C-test',farm:'Test',enabled:true}]);
function fixture(){
 const folder=(id,parents=[])=>({id,name:id,mimeType:'application/vnd.google-apps.folder',parents,capabilities:{canAddChildren:true}});
 const files=new Map([['root',folder('root')],['month',folder('month',['root'])],['unrelated',folder('unrelated')]]);
 const state={calls:[],files,uploads:0,starts:0,folders:0,loseResponse:false,location:null,pending:null};
 const fetchImpl=async(url,o)=>{
  state.calls.push({url,method:o.method});assert.equal(o.redirect,'error');assert.equal(o.headers.authorization,'Bearer synthetic-token');
  const u=new URL(url),fileId=u.pathname.split('/').at(-1);
  if(o.method==='GET'){
   if(fileId==='generateIds')return Response.json({ids:['reserved']});
   return files.has(fileId)?Response.json(files.get(fileId)):new Response('',{status:404});
  }
  if(u.pathname==='/drive/v3/files'&&o.method==='POST'){
   const m=JSON.parse(o.body);if(files.has(m.id))return new Response('',{status:409});
   state.folders++;files.set(m.id,m);return Response.json({id:m.id});
  }
  if(o.method==='POST'){
   state.starts++;state.pending=JSON.parse(o.body);
   return new Response(null,{status:200,headers:{location:state.location??'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=synthetic'}});
  }
  if(o.method==='PUT'){
   state.uploads++;files.set(state.pending.id,{...state.pending,size:String(o.body.length),md5Checksum:createHash('md5').update(o.body).digest('hex')});
   if(state.loseResponse){state.loseResponse=false;throw Error('synthetic lost response');}
   return Response.json({id:state.pending.id});
  }
  throw Error('unexpected request');
 };
 return {state,client:new DriveClient({rootFolderId:'root',accessToken:async()=>'synthetic-token',fetchImpl})};
}
const bytes=Buffer.from([255,216,0,1,2,3]);
const job={fileId:'reserved',parentId:'month',plan,bytes};
test('Drive upload verifies checksum and retries a lost response without creating another file',async()=>{
 const {client,state}=fixture();assert.equal(await client.reserveId(),'reserved');state.loseResponse=true;
 await assert.rejects(client.upload(job),/drive_unavailable/);
 assert.equal((await client.upload(job)).id,'reserved');
 assert.equal(state.starts,1);assert.equal(state.uploads,1);assert.equal(state.files.size,4);
 await assert.rejects(client.upload({...job,bytes:Buffer.from('changed')}),/drive_identity_conflict/);
});
test('Drive refuses writes outside configured root and rejects inaccessible root',async()=>{
 const {client,state}=fixture();await assert.rejects(client.upload({...job,parentId:'unrelated'}),/drive_outside_archive_root/);assert.equal(state.starts,0);
 state.files.get('root').trashed=true;await assert.rejects(client.upload(job),/drive_folder_unavailable/);assert.equal(state.starts,0);
});
test('Drive never forwards credentials to external or unrelated upload locations',async()=>{
 for(const location of ['https://evil.example/upload','https://www.googleapis.com/other?upload_id=x','https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable']){
  const {client,state}=fixture();state.location=location;await assert.rejects(client.upload(job),/drive_invalid_upload_location/);assert.equal(state.uploads,0);assert.ok(state.calls.every(c=>new URL(c.url).hostname==='www.googleapis.com'));
 }
});
test('Drive folder retries reuse reserved identity; conflicting names are not adopted',async()=>{
 const {client,state}=fixture();const data={fileId:'child',parentId:'root',name:'Petty Cash',key:'a'.repeat(64)};
 await client.createFolder(data);await client.createFolder(data);assert.equal(state.folders,1);
 await assert.rejects(client.createFolder({...data,name:'Cleaning'}),/drive_identity_conflict/);
});
test('Drive uploads full 8 MiB evidence with resumable transport and rejects larger files',async()=>{
 const {client,state}=fixture();await client.upload({...job,bytes:Buffer.alloc(8*1024*1024,1)});assert.equal(state.uploads,1);
 await assert.rejects(client.upload({...job,bytes:Buffer.alloc(8*1024*1024+1)}),/drive_invalid_size/);
});
test('Drive failures expose only safe codes and require authentication',async()=>{
 const c=new DriveClient({rootFolderId:'root',accessToken:async()=>{throw Error('private credentials');}});
 await assert.rejects(c.reserveId(),/^Error: drive_auth_required$/);
 const c2=new DriveClient({rootFolderId:'root',accessToken:async()=>'fake',fetchImpl:async()=>new Response('private provider detail',{status:403})});
 await assert.rejects(c2.reserveId(),/^Error: drive_http_403$/);
});
