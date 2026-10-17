import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/core.mjs';
import {Worker,replyLanguage} from '../src/worker.mjs';
import {wantsFourLanguages,wantsThreeLanguages,answerLanguage,languageInstruction,directTranslationRequest} from '../src/language.mjs';
import {nutritionRequest,mastitisRequest,forageGuideRequest,answerManual} from '../src/manual.mjs';
import {cvasRequest} from '../src/cvas.mjs';
import {infoAnswer} from '../src/bot-info.mjs';

const G='C'+'1'.repeat(32);
const fx=t=>{const dir=mkdtempSync(join(tmpdir(),'v1-chinese-'));const store=new Store(dir);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 return {store,dir};
};
const event=(id,body)=>({webhookEventId:id,type:'message',timestamp:Date.now(),
 source:{type:'group',groupId:G,userId:'Uone'},
 message:{type:'text',id:'100'+id,text:'@WM '+body,mention:{mentionees:[{isSelf:true,index:0,length:3}]}}});
test('Automatic language detection returns Simplified Chinese without affecting old three languages',()=>{
 assert.equal(replyLanguage('奶牛热应激怎么处理？'),'zh');
 assert.equal(replyLanguage('牛只编号: 007'),'zh');
 assert.equal(replyLanguage('နွားနို့'),'my');
 assert.equal(replyLanguage('รีดนม'),'th');
 assert.equal(replyLanguage('Milk quality'),'en');
 assert.equal(languageInstruction('zh'),'Simplified Chinese (简体中文)');
 assert.equal(answerLanguage('en','Answer in Chinese'),'zh');
 assert.equal(answerLanguage('zh','奶牛热应激'),'zh');
});
test('Backward compatibility keeps /translate all at three languages; new four-language mode is explicit',()=>{
 assert.equal(wantsThreeLanguages('Answer Myanmar, Thai & English'),true);
 assert.equal(wantsFourLanguages('Answer Myanmar, Thai & English'),false);
 assert.equal(answerLanguage('my','Answer Myanmar, Thai & English'),'tri');
 assert.equal(wantsFourLanguages('Answer Myanmar, Thai, English and Chinese'),true);
 assert.equal(wantsFourLanguages('Answer in four languages'),true);
 assert.equal(answerLanguage('my','请用缅甸语、泰语、英语和中文回答'),'quad');
 assert.match(languageInstruction('quad'),/Simplified Chinese IN THAT ORDER/);
 const help=infoAnswer('help','quad');
 assert(help.startsWith('မြန်မာ\n'));
 assert(help.includes('\n\nไทย\n'));
 assert(help.includes('\n\nEnglish\n'));
 assert(help.includes('\n\n简体中文\n'));
});
test('Direct translation supports Chinese as source and destination without interrupting old commands',()=>{
 const cases=[
  ['/translate zh: မင်္ဂလာပါ','zh','မင်္ဂလာပါ'],
  ['/translate Chinese: Milk 50 kg','zh','Milk 50 kg'],
  ['/translate en: 你好，牛奶质量很好。','en','你好，牛奶质量很好。'],
  ['/translate all: Good morning','tri','Good morning'],
  ['/translate all4: 今天有50公斤牛奶','quad','今天有50公斤牛奶'],
  ['/translate four: Hello','quad','Hello'],
  ['Can you translate this all to Chinese:\nနွားနို့ ၅၀ kg','zh','နွားနို့ ၅၀ kg'],
  ['翻译成中文：Hello World','zh','Hello World']
 ];
 for(const [q,target,source] of cases)assert.deepEqual(directTranslationRequest(q),{target,source},q);
 assert.equal(directTranslationRequest('Explain cow health in Chinese'),null);
});
test('Chinese milk-quality, nutrition, forage and CVAS terms choose correct knowledge path',()=>{
 for(const [fn,q] of [
  [nutritionRequest,'奶牛热应激怎么降温？'],
  [nutritionRequest,'奶牛营养如何管理？'],
  [mastitisRequest,'乳房炎有哪些临床症状？'],
  [forageGuideRequest,'玉米青贮的淀粉消化率目标是多少？'],
  [cvasRequest,'CVAS 实验室报告有什么数据？']]){
   assert(fn(q),q);
 }
 assert.equal(nutritionRequest('Farm 2 奶量记录'),false);
});
test('Chinese LINE user receives a source-grounded answer with original slide reference',async t=>{
 const {store,dir}=fx(t);
 const index={schema_version:1,reports:[],manuals:[{id:'dairy-nutrition-walter-chen',
  title:'Dr Walter Dairy Nutrition',pages:[{pdf_page:38,text:'Install sprinklers and fans and provide shade, water.'}]}]};
 let call=0;
 const ai={call:async(prompt,input)=>{
  call++;
  assert.match(prompt,/Simplified Chinese \(简体中文\)/);
  assert.equal(JSON.parse(input[0].content[0].text).pages.length,1);
  return {answer:'应在待挤奶区设置风扇和喷淋，并提供遮阴与饮水。',cited_pages:['dairy-nutrition-walter-chen:38']};
 }};
 const bot=new Worker({group:G,cvasIndex:'configured',dir},store,{cvasIndex:async()=>index},ai,{});
 const e=event('v1zh1','奶牛热应激怎么降温？');store.enqueue([e]);await bot.process(store.next());
 const output=store.db.prepare('SELECT text FROM outgoing WHERE id=?').get(e.webhookEventId).text;
 assert.match(output,/风扇和喷淋/);
 assert.match(output,/Slide 38/);
 assert.equal(call,1);
});
test('Chinese translation in LINE is read-only and no CVAS report lookup is called',async t=>{
 const {store,dir}=fx(t);let lookedUp=0;
 const ai={call:async(prompt,input)=>{
  assert.match(prompt,/Simplified Chinese/);
  assert.equal(JSON.parse(input[0].content[0].text).source_text,'The cows need clean water.');
  return '奶牛需要清洁的饮用水。';
 }};
 const bot=new Worker({group:G,cvasIndex:'configured',dir},store,{cvasIndex:async()=>{lookedUp++;return null;}},ai,{});
 const e=event('v1zh2','/translate zh: The cows need clean water.');
 store.enqueue([e]);await bot.process(store.next());
 const output=store.db.prepare('SELECT text FROM outgoing WHERE id=?').get(e.webhookEventId).text;
 assert.equal(output,'奶牛需要清洁的饮用水。');
 assert.equal(lookedUp,0);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM records').get().n,0);
});
test('Explicit four-language instruction reaches evidence-grounded nutrition model with citations',async t=>{
 const {store,dir}=fx(t);
 const index={schema_version:1,reports:[],manuals:[{id:'dairy-nutrition-walter-chen',
  title:'Dr Walter Dairy Nutrition',pages:[{pdf_page:38,text:'Provide shade and fans.'}]}]};
 const ai={call:async(prompt)=>{
  assert.match(prompt,/Myanmar \(Burmese\), Thai, English, and Simplified Chinese IN THAT ORDER/);
  return {answer:'မြန်မာ\nပန်ကာ\n\nไทย\nพัดลม\n\nEnglish\nFan\n\n简体中文\n风扇',cited_pages:['dairy-nutrition-walter-chen:38']};
 }};
 const bot=new Worker({group:G,cvasIndex:'configured',dir},store,{cvasIndex:async()=>index},ai,{});
 const e=event('v1zh3','奶牛热应激如何降温？ Answer Myanmar, Thai, English and Chinese');
 store.enqueue([e]);await bot.process(store.next());
 const output=store.db.prepare('SELECT text FROM outgoing WHERE id=?').get(e.webhookEventId).text;
 assert(output.indexOf('English')<output.indexOf('简体中文'));
 assert.match(output,/Slide 38/);
});
