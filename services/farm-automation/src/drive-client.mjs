// Standalone development adapter; deliberately not imported by the live server.
import {createHash} from 'node:crypto';
import {archiveCategories} from './drive-archive.mjs';
const base='https://www.googleapis.com';
const folderMime='application/vnd.google-apps.folder';
const fields='id,name,mimeType,parents,trashed,appProperties,md5Checksum,size,capabilities(canAddChildren)';
const id=x=>{if(typeof x!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(x))throw Error('drive_invalid_id');return x;};
const md5=b=>createHash('md5').update(b).digest('hex');
const error=s=>Object.assign(Error(`drive_http_${s}`),{status:s});
export class DriveClient {
 constructor({rootFolderId,accessToken,fetchImpl=fetch}){this.root=id(rootFolderId);if(typeof accessToken!=='function')throw Error('drive_auth_required');this.token=accessToken;this.fetch=fetchImpl;}
 async request(path,{method='GET',body,headers={}}={}){
  // Never send a bearer token to a URL supplied by message content or redirects.
  const url=new URL(path,base);
  if(url.origin!==base||url.username||url.password||!/^\/(upload\/)?drive\/v3\/files(?:\/|\?|$)/.test(url.pathname+url.search))throw Error('drive_invalid_url');
  let token;try{token=await this.token();}catch{throw Error('drive_auth_required');}
  if(typeof token!=='string'||!token||/[\r\n]/.test(token))throw Error('drive_auth_required');
  let response;try{response=await this.fetch(url.href,{method,body,headers:{...headers,authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw Error('drive_unavailable');}
  if(!response.ok)throw error(response.status);return response;
 }
 async json(path,options){const r=await this.request(path,options);try{return await r.json();}catch{throw Error('drive_invalid_response');}}
 async metadata(fileId){return this.json(`/drive/v3/files/${id(fileId)}?supportsAllDrives=true&fields=${encodeURIComponent(fields)}`);}
 async writableFolder(parentId){
  let current=id(parentId);const seen=new Set();
  for(let depth=0;depth<8;depth++){
   if(seen.has(current))throw Error('drive_parent_cycle');seen.add(current);
   const r=await this.metadata(current);
   if(r.id!==current||r.trashed||r.mimeType!==folderMime||(depth===0&&r.capabilities?.canAddChildren!==true))throw Error('drive_folder_unavailable');
   if(current===this.root)return;
   if(r.parents?.length!==1)break;current=id(r.parents[0]);
  }
  throw Error('drive_outside_archive_root');
 }
 async reserveId(){const r=await this.json('/drive/v3/files/generateIds?count=1&space=drive&type=files');return id(r.ids?.[0]);}
 async existing(fileId){try{return await this.metadata(fileId);}catch(e){if(e.status===404)return null;throw e;}}
 matches(r,m,checksum){
  return r&&r.id===m.id&&!r.trashed&&r.name===m.name&&r.mimeType===m.mimeType&&r.parents?.length===1&&r.parents[0]===m.parents[0]&&Object.entries(m.appProperties).every(([k,v])=>r.appProperties?.[k]===v)&&(checksum===undefined||r.md5Checksum===checksum);
 }
 async createFolder({fileId,parentId,name,key}){
  if(typeof name!=='string'||!name||name.length>300||typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw Error('drive_invalid_folder');
  const m={id:id(fileId),name,mimeType:folderMime,parents:[id(parentId)],appProperties:{argo_folder:key}};
  await this.writableFolder(parentId);
  const old=await this.existing(fileId);if(old){if(!this.matches(old,m))throw Error('drive_identity_conflict');return old;}
  try{await this.json('/drive/v3/files?supportsAllDrives=true&fields=id',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(m)});}catch(e){if(e.status!==409)throw e;}
  const r=await this.metadata(fileId);if(!this.matches(r,m))throw Error('drive_identity_conflict');return r;
 }
 async upload({fileId,parentId,plan,bytes}){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>8*1024*1024)throw Error('drive_invalid_size');
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','text/plain':'txt','application/json':'json'}[plan?.mime];
  if(!ext||!Object.hasOwn(archiveCategories,plan?.category)||!/^[a-f0-9]{64}$/.test(plan?.groupKey)||!/^[a-f0-9]{64}$/.test(plan?.sourceKey)||typeof plan?.name!=='string'||!new RegExp(`^\\d{4}-\\d{2}-\\d{2}_${plan.sourceKey}\\.${ext}$`).test(plan.name))throw Error('drive_invalid_plan');
  const m={id:id(fileId),name:plan.name,mimeType:plan.mime,parents:[id(parentId)],appProperties:{argo_source:plan.sourceKey,argo_group:plan.groupKey,argo_category:plan.category}};
  const checksum=md5(bytes);await this.writableFolder(parentId);
  const old=await this.existing(fileId);if(old){if(!this.matches(old,m,checksum))throw Error('drive_identity_conflict');return old;}
  try{
   const start=await this.request('/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id',{method:'POST',headers:{'content-type':'application/json','x-upload-content-type':plan.mime,'x-upload-content-length':String(bytes.length)},body:JSON.stringify(m)});
   const location=start.headers.get('location');if(!location)throw Error('drive_missing_upload_location');
   const url=new URL(location);if(url.origin!==base||url.pathname!=='/upload/drive/v3/files'||url.searchParams.get('uploadType')!=='resumable'||!url.searchParams.get('upload_id'))throw Error('drive_invalid_upload_location');
   await this.request(url.href,{method:'PUT',headers:{'content-type':plan.mime,'content-length':String(bytes.length)},body:bytes});
  }catch(e){if(e.status!==409)throw e;}
  const r=await this.metadata(fileId);if(!this.matches(r,m,checksum)||Number(r.size)!==bytes.length)throw Error('drive_upload_not_verified');return r;
 }
}
