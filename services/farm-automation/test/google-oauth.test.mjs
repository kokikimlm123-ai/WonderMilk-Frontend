import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {Store} from '../src/store.mjs';
import {GoogleOAuth,googleConfiguration,DRIVE_SCOPE,GOOGLE_CALLBACK} from '../src/google-oauth.mjs';
import {createApp} from '../src/server.mjs';
import {hash} from '../src/domain.mjs';
const actor={actor:'James',groups:[]},config=googleConfiguration({V2_GOOGLE_CLIENT_ID:'synthetic.apps.googleusercontent.com',V2_GOOGLE_CLIENT_SECRET:'synthetic-secret',V2_GOOGLE_TOKEN_KEY:'ab'.repeat(32),V2_GOOGLE_ADMIN_ACTOR:'James'});
let db,pool,store;
before(async()=>{db=new PGlite();const query=async(s,p)=>p?db.query(s,p):(await db.exec(s)).at(-1);pool={query,connect:async()=>({query,release(){}})};store=new Store(pool);await store.init();});
beforeEach(async()=>{await db.exec('TRUNCATE v2_google_states,v2_google_connection');});after(async()=>db.close());
const flow=(fn=async()=>Response.json({refresh_token:'synthetic-refresh',scope:DRIVE_SCOPE}))=>new GoogleOAuth(config,pool,fn);
const params=(s,extra={code:'synthetic-code'})=>new URLSearchParams({state:new URL(s.url).searchParams.get('state'),...extra});
const cookie=s=>s.cookie.split(';')[0];
test('Google optional setup and administrator authorization protect connection',async()=>{
 const empty=new GoogleOAuth(googleConfiguration({}),pool);assert.deepEqual(await empty.status(actor),{configured:false,connected:false,uploadsEnabled:false});await assert.rejects(empty.begin(actor),/google_setup_required/);await assert.rejects(flow().begin({actor:'Other'}),/google_admin_required/);
});
test('Google PKCE, browser-bound state and encrypted refresh token survive roundtrip without replay',async()=>{
 let start;
 const f=flow(async(url,o)=>{assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(o.redirect,'error');assert.equal(createHash('sha256').update(o.body.get('code_verifier')).digest('base64url'),new URL(start.url).searchParams.get('code_challenge'));return Response.json({access_token:'must-not-store',refresh_token:'synthetic-refresh',scope:DRIVE_SCOPE});});
 start=await f.begin(actor);const u=new URL(start.url);assert.equal(u.searchParams.get('scope'),DRIVE_SCOPE);assert.equal(u.searchParams.get('redirect_uri'),GOOGLE_CALLBACK);assert.match(start.cookie,/Secure; HttpOnly; SameSite=Lax/);
 await assert.rejects(f.complete(params(start),''),/google_invalid_state/);assert.equal((await f.complete(params(start),cookie(start))).connected,true);
 const saved=(await db.query('SELECT * FROM v2_google_connection')).rows[0];assert.ok(!JSON.stringify(saved).includes('synthetic-refresh'));assert.ok(!JSON.stringify(saved).includes('must-not-store'));assert.equal(f.open(saved.refresh_token),'synthetic-refresh');
 await assert.rejects(f.complete(params(start),cookie(start)),/google_expired_or_used_state/);await assert.rejects(f.begin(actor),/google_already_connected/);
});
test('Google expired, replaced and denied attempts never connect',async()=>{
 const f=flow(),old=await f.begin(actor),current=await f.begin(actor);await assert.rejects(f.complete(params(old),cookie(old)),/google_expired_or_used_state/);
 await db.query("UPDATE v2_google_states SET expires_at=now()-interval '1 second'");await assert.rejects(f.complete(params(current),cookie(current)),/google_expired_or_used_state/);
 const denied=await f.begin(actor);await assert.rejects(f.complete(params(denied,{error:'access_denied'}),cookie(denied)),/google_consent_not_granted/);
 assert.equal((await db.query('SELECT count(*) n FROM v2_google_connection')).rows[0].n,0);
});
test('Google insufficient scope or missing refresh token does not save a connection',async()=>{
 for(const response of [{refresh_token:'x',scope:'openid'},{scope:DRIVE_SCOPE}]){const f=flow(async()=>Response.json(response)),s=await f.begin(actor);await assert.rejects(f.complete(params(s),cookie(s)),/google_offline_file_access_required/);}
 assert.equal((await db.query('SELECT count(*) n FROM v2_google_connection')).rows[0].n,0);
});
test('Google provider errors and wrong encryption keys do not expose secrets',async()=>{
 const f=flow(async()=>{throw Error('private provider secret');}),s=await f.begin(actor);await assert.rejects(f.complete(params(s),cookie(s)),/^Error: google_authorization_failed$/);
 const other=new GoogleOAuth({...config,key:'cd'.repeat(32)},pool);assert.throws(()=>other.open(f.seal('secret')),/google_token_unavailable/);
});
test('Google HTTP routes require reviewer authorization and callback returns only safe redirect',async()=>{
 const token='synthetic-reviewer-token-'.repeat(2),server=createApp({reviewers:[{...actor,tokenHash:hash(token)}]},store,null,flow());await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{assert.equal((await fetch(base+'/v2/google/connect',{method:'POST'})).status,401);
 const r=await fetch(base+'/v2/google/connect',{method:'POST',headers:{authorization:'Bearer '+token}});assert.equal(r.status,200);const result=await r.json();
 const done=await fetch(base+'/oauth/google/callback?'+params(result),{redirect:'manual',headers:{cookie:r.headers.get('set-cookie').split(';')[0]}});assert.equal(done.status,303);assert.equal(done.headers.get('location'),'/review?google=connected');assert.equal(done.headers.get('referrer-policy'),'no-referrer');assert.equal(await done.text(),'');
 }finally{await new Promise(r=>server.close(r));}
});
