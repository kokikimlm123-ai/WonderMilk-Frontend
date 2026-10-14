import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {Problem} from './domain.mjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
export const GOOGLE_CALLBACK='https://argo-wm-v2-farm-development.up.railway.app/oauth/google/callback';
export function googleConfiguration(e=process.env){
 const c={clientId:e.V2_GOOGLE_CLIENT_ID||'',clientSecret:e.V2_GOOGLE_CLIENT_SECRET||'',key:e.V2_GOOGLE_TOKEN_KEY||'',owner:e.V2_GOOGLE_ADMIN_ACTOR||'',redirect:GOOGLE_CALLBACK};
 c.configured=!!(c.clientId&&c.clientSecret&&/^[a-f0-9]{64}$/.test(c.key)&&c.owner);return c;
}
export class GoogleOAuth {
 constructor(c,pool,fetchImpl=fetch){Object.assign(this,{c,pool,fetch:fetchImpl});}
 assertOwner(actor){if(!this.c.configured)throw new Problem(503,'google_setup_required');if(actor?.actor!==this.c.owner)throw new Problem(403,'google_admin_required');}
 seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(this.c.key,'hex'),iv);cipher.setAAD(Buffer.from('argo-wm-v2-google'));const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(b=>b.toString('base64url')).join('.');}
 open(value){try{const [iv,tag,bytes]=value.split('.').map(b=>Buffer.from(b,'base64url'));const decipher=createDecipheriv('aes-256-gcm',Buffer.from(this.c.key,'hex'),iv);decipher.setAAD(Buffer.from('argo-wm-v2-google'));decipher.setAuthTag(tag);return Buffer.concat([decipher.update(bytes),decipher.final()]).toString('utf8');}catch{throw new Problem(503,'google_token_unavailable');}}
 async status(actor){if(!this.c.configured)return {configured:false,connected:false,uploadsEnabled:false};this.assertOwner(actor);const r=await this.pool.query('SELECT connected_at FROM v2_google_connection WHERE id=1');return {configured:true,connected:!!r.rows.length,uploadsEnabled:false,folderAuthorizationRequired:true};}
 async begin(actor){
  this.assertOwner(actor);
  if((await this.pool.query('SELECT id FROM v2_google_connection WHERE id=1')).rows.length)throw new Problem(409,'google_already_connected');
  const state=random(),cookie=random(),verifier=random();
  await this.pool.query('DELETE FROM v2_google_states WHERE expires_at<now()');
  // One outstanding attempt per administrator, including across restarts.
  await this.pool.query("INSERT INTO v2_google_states(actor,state_hash,cookie_hash,verifier,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes') ON CONFLICT(actor) DO UPDATE SET state_hash=excluded.state_hash,cookie_hash=excluded.cookie_hash,verifier=excluded.verifier,expires_at=excluded.expires_at",[actor.actor,digest(state),digest(cookie),this.seal(verifier)]);
  const params=new URLSearchParams({client_id:this.c.clientId,redirect_uri:this.c.redirect,response_type:'code',scope:DRIVE_SCOPE,access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
  return {url:'https://accounts.google.com/o/oauth2/v2/auth?'+params,cookie:`__Host-v2-google=${cookie}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`};
 }
 async complete(params,cookieHeader){
  if(!this.c.configured)throw new Problem(503,'google_setup_required');
  const state=params.get('state'),cookie=String(cookieHeader||'').match(/(?:^|;\s*)__Host-v2-google=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
  if(!state||!/^[A-Za-z0-9_-]{43}$/.test(state)||!cookie||params.getAll('state').length!==1)throw new Problem(400,'google_invalid_state');
  const result=await this.pool.query('DELETE FROM v2_google_states WHERE state_hash=$1 AND cookie_hash=$2 AND actor=$3 AND expires_at>now() RETURNING verifier',[digest(state),digest(cookie),this.c.owner]);
  if(!result.rows.length)throw new Problem(400,'google_expired_or_used_state');
  if(params.has('error'))throw new Problem(400,'google_consent_not_granted');
  const code=params.get('code');if(!code||code.length>4096||params.getAll('code').length!==1)throw new Problem(400,'google_code_required');
  let response,data;
  try{
   response=await this.fetch('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:this.c.clientId,client_secret:this.c.clientSecret,redirect_uri:this.c.redirect,grant_type:'authorization_code',code_verifier:this.open(result.rows[0].verifier)})});
   if(!response.ok)throw Error();
   let size=0;const parts=[];for await(const p of response.body){size+=p.length;if(size>65536)throw Error();parts.push(Buffer.from(p));}data=JSON.parse(Buffer.concat(parts).toString());
  }catch{throw new Problem(503,'google_authorization_failed');}
  if(typeof data.refresh_token!=='string'||!data.refresh_token||data.refresh_token.length>8192||!String(data.scope||'').split(' ').includes(DRIVE_SCOPE))throw new Problem(400,'google_offline_file_access_required');
  const saved=await this.pool.query('INSERT INTO v2_google_connection(id,actor,refresh_token,scope) VALUES(1,$1,$2,$3) ON CONFLICT(id) DO NOTHING RETURNING id',[this.c.owner,this.seal(data.refresh_token),DRIVE_SCOPE]);
  if(!saved.rows.length)throw new Problem(409,'google_already_connected');
  return {connected:true,uploadsEnabled:false,folderAuthorizationRequired:true};
 }
}
