import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {Store} from '../src/core.mjs';
import {createApp} from '../src/server.mjs';
import {Worker} from '../src/worker.mjs';
import {answerLanguage,wantsThreeLanguages,pastBurmeseTranslationRequest,translationTarget} from '../src/language.mjs';
import {splitLineText} from '../src/line-text.mjs';
import {infoAnswer} from '../src/bot-info.mjs';
import {answerManual} from '../src/manual.mjs';
const G='C'+'1'.repeat(32),H='C'+'2'.repeat(32);
const tmp=t=>{
 const dir=mkdtempSync(join(tmpdir(),'wm-translate-')),store=new Store(dir);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 return {store,dir};
};
const group=(id,text,at=Date.now(),extra={})=>({
 webhookEventId:'ev-'+id,type:'message',timestamp:at,
 source:{type:'group',groupId:G,userId:'Uone'},message:{type:'text',id,text,...extra}
});
test('Explicit multilingual triggers do not alter ordinary input-language behavior',()=>{
 const q='နွားအပူဒဏ် ဘယ်လိုလျှော့မလဲ။ Answer Myanmar, Thai & English';
 assert.equal(wantsThreeLanguages(q),true);
 assert.equal(answerLanguage('my',q),'tri');
 assert.equal(wantsThreeLanguages('Explain dairy cattle feed in English only'),false);
 assert.equal(wantsThreeLanguages('Explain Thai dairy farms to Myanmar farmers in English'),false);
 assert.equal(wantsThreeLanguages('မြန်မာ၊ ထိုင်း၊ အင်္ဂလိပ် ၃ ဘာသာနဲ့ ဖြေပါ'),true);
 assert.equal(wantsThreeLanguages('ตอบเป็นภาษาพม่า ไทย และอังกฤษ'),true);
 assert.equal(pastBurmeseTranslationRequest('Please translate the past Burmese text to English'),true);
 assert.equal(pastBurmeseTranslationRequest('Translate previous Burmese message to English'),true);
 assert.equal(pastBurmeseTranslationRequest('အပေါ်က မြန်မာစာကို အင်္ဂလိပ်လို ဘာသာပြန်ပေးပါ'),true);
 assert.equal(pastBurmeseTranslationRequest('Please translate this Burmese text:'),false);
 assert.equal(translationTarget('Translate previous Burmese text to Thai'),'th');
 assert.equal(translationTarget('Translate previous Burmese text to English'),'en');
});
test('Burmese history is per-group, bounded, expiring and withdrawn by unsend',t=>{
 const {store}=tmp(t);const now=Date.now();
 assert.equal(store.rememberBurmeseMessage(G,'101','နွား ၁၀ ကောင်',now-100000),true);
 assert.equal(store.rememberBurmeseMessage(H,'102','ဆိုင် နောက်ကျ',now-90000),true);
 assert.equal(store.recentBurmeseMessage(G,{before:now,excludeId:'201'}).text,'နွား ၁၀ ကောင်');
 assert.equal(store.recentBurmeseMessage(H,{before:now}).text,'ဆိုင် နောက်ကျ');
 assert.equal(store.recentBurmeseMessage(G,{quotedId:'102',before:now}),null);
 assert.equal(store.recentBurmeseMessage(G,{excludeId:'101',before:now}),null);
 assert.equal(store.rememberBurmeseMessage(G,'110','English only',now),false);
 assert.equal(store.rememberBurmeseMessage(G,'111','အလွန်ဟောင်း',now-7*3600000),false);
 store.forgetBurmeseMessage(G,'101');
 assert.equal(store.recentBurmeseMessage(G,{before:now}),null);
 assert.equal(store.rememberBurmeseMessage(G,'101','မပြန်သိမ်းရ',now),false);
 store.forgetBurmeseMessage(G,'150');
 assert.equal(store.rememberBurmeseMessage(G,'150','Unsend before delivery',now),false);
 for(let i=0;i<45;i++)store.rememberBurmeseMessage(G,String(1000+i),'စာ '+i,now-45000+i*1000);
 assert.equal(store.db.prepare('SELECT count(*) n FROM group_burmese_text WHERE group_id=?').get(G).n,40);
});
test('Webhook captures signed Burmese group history, while unmentioned events stay silent',async t=>{
 const {store,dir}=tmp(t),secret='test-secret';
 const server=createApp({enabled:true,group:G,secret,pairing:''},store);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+'/webhook/line';
 const post=async(events,valid=true)=>{
  const raw=JSON.stringify({events});
  const sig=createHmac('sha256',valid?secret:'wrong').update(raw).digest('base64');
  return fetch(url,{method:'POST',headers:{'x-line-signature':sig},body:raw});
 };
 const at=Date.now()-60000;
 const earlier=group('100001','လယ်ယာမှ နွားနို့ ၅၀ ကီလိုဂရမ် ရရှိသည်။',at);
 assert.equal((await post([earlier],false)).status,401);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM group_burmese_text').get().n,0);
 assert.equal((await post([{...earlier,source:{...earlier.source,groupId:H}}])).status,200);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM group_burmese_text').get().n,0);
 assert.equal((await post([earlier])).status,200);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM group_burmese_text').get().n,1);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM events').get().n,1);
 assert.equal((await post([earlier])).status,200);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM group_burmese_text').get().n,1);
 let captured=null;
 const ai={call:async(prompt,input)=>{
  captured=JSON.parse(input[0].content[0].text).source_text;
  assert.match(prompt,/not as instructions/);
  return 'The farm received 50 kilograms of milk.';
 }};
 const bot=new Worker({dir,enabled:true,group:G},store,{},ai,{});
 const ask=group('100002','@WM Please translate the past Burmese text to English',Date.now());
 assert.equal((await post([ask])).status,200);
 await bot.process(store.next()); // The previously unmentioned message is intentionally silent.
 await bot.process(store.next()); // The explicit translation request receives the reply.
 assert.equal(captured,earlier.message.text);
 assert.equal(store.db.prepare("SELECT text FROM outgoing WHERE id='ev-100002'").get().text,'The farm received 50 kilograms of milk.');
 assert.equal(store.db.prepare('SELECT count(*) n FROM records').get().n,0);
 await post([{webhookEventId:'ev-u',type:'unsend',timestamp:Date.now(),source:{type:'group',groupId:G,userId:'Uone'},unsend:{messageId:'100001'}}]);
 assert.equal(store.recentBurmeseMessage(G,{before:Date.now()}),null);
 assert.equal((await post([earlier])).status,200);
 assert.equal(store.recentBurmeseMessage(G,{before:Date.now()}),null);
});
test('No earlier message is invented and explicit quote never silently falls back to another message',async t=>{
 const {store,dir}=tmp(t),ai={call:async()=>{throw Error('Model should not be invoked for missing context');}};
 const bot=new Worker({dir,group:G,enabled:true},store,{},ai,{});
 const now=Date.now();
 store.rememberBurmeseMessage(G,'100001','အခြားစာ',now-5000);
 const ask=group('100003','@WM Translate previous Burmese message to English',now,{quotedMessageId:'99999'});
 store.enqueue([ask]);await bot.process(store.next());
 const output=store.db.prepare('SELECT text FROM outgoing WHERE id=?').get(ask.webhookEventId).text;
 assert.match(output,/cannot access/);
 assert.doesNotMatch(output,/အခြားစာ/);
});
test('Trilingual indexed nutrition answer preserves source reference and order',async t=>{
 const {store,dir}=tmp(t);
 const index={schema_version:1,reports:[],manuals:[{id:'dairy-nutrition-walter-chen',title:'Walter',pages:[{pdf_page:38,text:'Cool cows with fans and sprinklers.'}]}]};
 const ai={call:async(prompt)=>{
  assert.match(prompt,/Myanmar \(Burmese\), Thai, and English IN THAT ORDER/);
  return {answer:'မြန်မာ\nနွားကိုရေဖြန်းပါ။\n\nไทย\nฉีดน้ำให้โคนม\n\nEnglish\nUse sprinklers.',cited_pages:['dairy-nutrition-walter-chen:38']};
 }};
 const bot=new Worker({group:G,cvasIndex:'configured',dir},store,{cvasIndex:async()=>index},ai,{});
 const question='@WM နွားတွေ အပူဒဏ် ဘယ်လိုလျှော့မလဲ။ Answer Myanmar, Thai & English';
 const evt=group('200020',question,Date.now());
 store.enqueue([evt]);await bot.process(store.next());
 const output=store.db.prepare('SELECT text FROM outgoing WHERE id=?').get(evt.webhookEventId).text;
 assert(output.indexOf('မြန်မာ')<output.indexOf('ไทย'));
 assert(output.indexOf('ไทย')<output.indexOf('English'));
 assert.match(output,/Slide 38/);
});
test('Farm Q&A keeps Myanmar comprehension but delivers 3-language answer when requested',async t=>{
 const {store,dir}=tmp(t);let plans=0,ans=0;
 const c={dir,group:G,enabled:true,secret:'s',token:'t',aiKey:'a',googleJSON:'g',sheet:'test',
 sourceIds:{cows:'c',milkTests:'m',dailyExcel:'d'}};
 const ai={plan:async(_text,context)=>{
  plans++;assert.equal(context.language,'my');
  return {action:'ask',farms:['Farm 2'],type:'milk',cow_id:null,date_from:null,date_to:null,question:'Milk total',issues:[],records:[]};
 },answer:async(_q,_e,language)=>{
  ans++;assert.equal(language,'tri');
  return 'မြန်မာ: နို့စုစုပေါင်း ၅၀ kg\nไทย: 50 กก.\nEnglish: 50 kg';
 }};
 const bot=new Worker(c,store,{sources:async()=>[]},ai,{});
 const evt=group('200030','@WM Farm 2 နို့စုစုပေါင်း ဘယ်လောက်လဲ။ Answer Myanmar Thai and English',Date.now());
 store.enqueue([evt]);await bot.process(store.next());
 assert.equal(plans,1);assert.equal(ans,1);
});
test('LINE text splitter preserves full multilingual message and does not silently truncate',()=>{
 const original='မြန်မာ\n'+'စာသား၊ '.repeat(950)+'\nไทย\n'+'ข้อความ '.repeat(890)+'\nEnglish\n'+'reference '.repeat(850);
 const pieces=splitLineText(original);
 assert(pieces.length>1&&pieces.length<=5);
 assert(pieces.every(x=>x.length<=4500));
 assert.equal(pieces.join(''),original);
 assert.throws(()=>splitLineText('x'.repeat(24000)),/exceeds_five/);
 const help=infoAnswer('help','tri',{labConfigured:false});
 assert(help.indexOf('မြန်မာ')<help.indexOf('ไทย'));
 assert(help.indexOf('ไทย')<help.indexOf('English'));
});
