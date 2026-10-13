import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {configuration,normalizeEvent,Problem,reviewer,verify} from './domain.mjs';
import {bounded,Media,Extractor} from './integrations.mjs';
import {Store} from './store.mjs';
import {Worker} from './worker.mjs';
import {selftest} from './selftest.mjs';
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
export function readiness(c){return {environment:'development',intakeEnabled:c.enabled,groups:c.groups.filter(g=>g.enabled).length,lineConfigured:!!(c.secret&&c.lineToken),reviewConfigured:c.reviewers.length>0,aiConfigured:!!(c.aiEnabled&&c.aiKey&&c.model),mediaConfigured:!!(c.bucket&&c.endpoint&&c.accessKeyId&&c.secretAccessKey),sheetsSyncEnabled:false};}
export function createApp(c,store,media){return createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&['/','/review','/review.js'].includes(path)){const script=path==='/review.js';const file=await readFile(new URL(script?'../public/review.js':'../public/review.html',import.meta.url));res.writeHead(200,{'content-type':script?'text/javascript; charset=utf-8':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});return res.end(file);}
  if(req.method==='GET'&&path==='/healthz'){await store.pool.query('SELECT 1');return send(res,200,{status:'running',environment:'development',version:'2.0.0-dev.1'});}
  if(req.method==='GET'&&path==='/readyz'){const r=readiness(c);return send(res,r.intakeEnabled&&r.groups&&r.lineConfigured&&r.reviewConfigured&&r.mediaConfigured?200:503,r);}
  if(req.method==='POST'&&path==='/webhook/line'){
   if(!c.secret)throw new Problem(503,'development_line_not_configured');
   if(Number(req.headers['content-length'])>1024*1024)throw new Problem(413,'too_large');
   let raw;try{raw=await bounded(req,1024*1024);}catch{throw new Problem(413,'too_large');}
   if(!verify(raw,req.headers['x-line-signature'],c.secret))throw new Problem(401,'invalid_signature');
   let body;try{body=JSON.parse(raw);}catch{throw new Problem(400,'invalid_json');}
   if(!Array.isArray(body?.events)||body.events.length>100)throw new Problem(400,'invalid_events');
   if(!body.events.length)return send(res,200,{ok:true});
   const events=body.events.map(e=>normalizeEvent(e,c)).filter(Boolean);
   // Honour deletion even while capture is paused. Do not acknowledge dropped intake.
   const withdrawals=events.filter(e=>e.kind==='unsend');if(withdrawals.length)await store.ingest(withdrawals);
   if(!c.enabled&&events.some(e=>e.kind!=='unsend'))throw new Problem(503,'intake_paused');
   const accepted=await store.ingest(events.filter(e=>e.kind!=='unsend'));return send(res,200,{ok:true,accepted});
  }
  if(!path.startsWith('/v2/'))throw new Problem(404,'not_found');
  const actor=reviewer(c,req.headers.authorization);if(!actor)throw new Problem(401,'reviewer_authorization_required');
  if(req.method==='GET'&&path==='/v2/drafts')return send(res,200,{drafts:await store.list(actor)});
  if(req.method==='GET'&&path==='/v2/records')return send(res,200,{records:await store.records(actor)});
  if(req.method==='GET'&&path==='/v2/events')return send(res,200,{events:await store.status(actor)});
  const m=path.match(/^\/v2\/(drafts|events)\/([^/]{1,200})\/(review|retry|evidence)$/);
  if(m){const [,kind,id,action]=m;
   if(req.method==='GET'&&kind==='drafts'&&action==='evidence'){const key=await store.evidence(id,actor);if(!key||!media)throw new Problem(404,'not_found');const image=await media.get(key);res.writeHead(200,{'content-type':image.mime,'cache-control':'no-store','x-content-type-options':'nosniff'});return res.end(image.bytes);}
   if(req.method==='POST'&&kind==='events'&&action==='retry')return send(res,200,await store.retry(id,actor));
   if(req.method==='POST'&&kind==='drafts'&&action==='review'){let body;try{body=JSON.parse(await bounded(req,128*1024));}catch{throw new Problem(400,'invalid_review_body');}return send(res,200,await store.review(id,actor,body));}
  }
  throw new Problem(404,'not_found');
 }catch(e){return send(res,e instanceof Problem?e.status:503,{error:e instanceof Problem?e.message:'service_unavailable'});}
 });}
export async function start(){
 const c=configuration();if(!c.database)throw new Error('V2_DATABASE_URL required');
 const pool=new pg.Pool({connectionString:c.database,max:4,connectionTimeoutMillis:10000,statement_timeout:15000});pool.on('error',()=>console.error('database_connection_error'));
 const store=new Store(pool);await store.init();
 const media=c.bucket&&c.endpoint&&c.accessKeyId&&c.secretAccessKey?new Media(c):null;
 if(process.env.V2_SELFTEST_ON_START==='true')await selftest(pool,media);
 const worker=new Worker(c,store,new Extractor(c,store),media),server=createApp(c,store,media);
 server.requestTimeout=15000;server.headersTimeout=10000;
 const timer=setInterval(()=>worker.tick().catch(()=>console.error('worker_tick_failed')),1000);
 await new Promise(resolve=>server.listen(c.port,'0.0.0.0',resolve));console.log(JSON.stringify({status:'listening',...readiness(c)}));
 const stop=()=>{clearInterval(timer);server.close(async()=>{while(worker.running)await new Promise(r=>setTimeout(r,100));await pool.end();process.exit(0);});setTimeout(()=>process.exit(1),55000).unref();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)start().catch(()=>{console.error('v2_startup_failed_check_configuration_and_database');process.exit(1);});
