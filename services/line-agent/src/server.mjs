import {validateIndex} from './cvas.mjs';
import {privateLabEvent} from './lab-access.mjs';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {configuration,missingConfiguration} from './config.mjs';
import {Store,verifySignature,sameSecret} from './core.mjs';
import {AI,Google,Line} from './integrations.mjs';
import {Worker} from './worker.mjs';

function send(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));}
export function createApp(c,store) {
  const server=createServer(async(req,res)=>{
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET'&&path==='/healthz')return send(res,200,{status:'running'});
      if(req.method==='GET'&&path==='/readyz') {
        const missing=missingConfiguration(c);
        return send(res,!missing.length&&c.enabled?200:503,{ready:!missing.length&&c.enabled,enabled:c.enabled,missing});
      }
      if(req.method!=='POST'||path!=='/webhook/line')return send(res,404,{error:'not_found'});
      if(!c.secret)return send(res,503,{error:'LINE configuration required'});
      if(Number(req.headers['content-length'])>1024*1024)return send(res,413,{error:'too_large'});
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>1024*1024)return send(res,413,{error:'too_large'});chunks.push(chunk);}
      const raw=Buffer.concat(chunks);
      if(!verifySignature(raw,req.headers['x-line-signature'],c.secret))return send(res,401,{error:'invalid_signature'});
      let body;try{body=JSON.parse(raw.toString('utf8'));}catch{return send(res,400,{error:'invalid_json'});}
      if(!Array.isArray(body.events)||body.events.length>100)return send(res,400,{error:'invalid_events'});
      // LINE verification sends an empty events array. It works while the bot is paused.
      if(!body.events.length)return send(res,200,{ok:true});
      if(!c.enabled)return send(res,503,{error:'bot_paused'});
      const bound=c.group||store.setting('group');
      const events=body.events.filter(e=>privateLabEvent(c,store,e)||(e?.source?.type==='group'&&(
        bound?e.source.groupId===bound:e.type==='message'&&e.source.userId&&e.message?.type==='text'&&e.message.text?.startsWith('/pair ')&&sameSecret(e.message.text.slice(6).trim(),c.pairing)
      )));
      const pending=store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE status IN ('queued','processing')").get().n;
      if(pending+events.length>200)return send(res,503,{error:'queue_full'});
      store.enqueue(events);return send(res,200,{ok:true});
    }catch{return send(res,500,{error:'temporary_error'});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  return server;
}
export function start() {
  process.umask(0o077);
  const c=configuration(),store=new Store(c.dir),google=new Google(c),worker=new Worker(c,store,google,new AI(c,store),new Line(c));
  if(c.cvasIndex)google.cvasIndex().then(validateIndex).then(d=>console.log(JSON.stringify({cvas_source:"ready",reports:d.reports.length,private_access:true}))).catch(()=>console.error("cvas_source_unavailable"));
  const server=createApp(c,store),timer=setInterval(()=>worker.tick().catch(()=>console.error('worker_error')),1000);
  server.listen(c.port,'0.0.0.0',()=>console.log(JSON.stringify({status:'listening',port:c.port,enabled:c.enabled,missing:missingConfiguration(c)})));
  const stop=()=>{clearInterval(timer);server.close();const end=setInterval(()=>{if(!worker.running){clearInterval(end);store.close();process.exit(0);}},100);setTimeout(()=>process.exit(1),55000).unref();};
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)start();
