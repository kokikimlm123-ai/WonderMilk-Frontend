import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/core.mjs';
import {Worker,replyLanguage} from '../src/worker.mjs';
import {answerLanguage,directTranslationRequest} from '../src/language.mjs';
import {manualRequest,answerManual} from '../src/manual.mjs';
import {cvasRequest} from '../src/cvas.mjs';
test('V1.1 Chinese detection and opt-in four-language output retain old modes',()=>{
 assert.equal(replyLanguage('奶牛产奶量'),'zh');
 assert.equal(replyLanguage('နို့'),'my');
 assert.equal(replyLanguage('น้ำนม'),'th');
 assert.equal(answerLanguage('zh','Please answer in four languages'),'quad');
 assert.equal(answerLanguage('en','Answer Myanmar, Thai & English'),'tri');
 assert.deepEqual(directTranslationRequest('/translate zh: Hello'),{target:'zh',source:'Hello'});
 assert.deepEqual(directTranslationRequest('/translate four: 乳房炎'),{target:'quad',source:'乳房炎'});
 assert.equal(manualRequest('实验手册：如何采样？'),true);
 assert.equal(cvasRequest('CVAS 实验室报告 39170011'),true);
});
test('V1.1 direct Chinese translation is read-only in connected LINE group',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'wm-v11zh-')),store=new Store(dir);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const group='C'+'1'.repeat(32),ai={call:async(prompt,input)=>{
  assert.match(prompt,/Simplified Chinese/);
  assert.equal(JSON.parse(input[0].content[0].text).source_text,'Farm 2 milk total 50 kg');
  return 'Farm 2 产奶总量 50 公斤';
 }};
 const bot=new Worker({group,dir},store,{},ai,{});
 const evt={webhookEventId:'v11zh-evt',timestamp:Date.now(),type:'message',source:{type:'group',groupId:group,userId:'Uone'},message:{type:'text',id:'12345',text:'@WM /translate zh: Farm 2 milk total 50 kg'}};
 store.enqueue([evt]);await bot.process(store.next());
 const text=store.db.prepare('SELECT text FROM outgoing WHERE id=?').get('v11zh-evt')?.text;
 assert.equal(text,'Farm 2 产奶总量 50 公斤');
 assert.equal(store.records(['Farm 2']).length,0);
});
test('V1.1 CVAS manual answer is grounded in the original source with Chinese language instruction',async()=>{
 const index={schema_version:1,reports:[],manuals:[{id:'cvas-method',title:'CVAS Lab Manual',pages:[{pdf_page:2,text:'Follow the laboratory SOP.'}]}]};
 const ai={call:async(prompt,input)=>{
  assert.match(prompt,/Simplified Chinese/);
  assert.equal(JSON.parse(input[0].content[0].text).pages.length,1);
  return {answer:'请遵循实验室操作规程。',cited_pages:['cvas-method:2']};
 }};
 const out=await answerManual(index,'/manual 用中文说明实验手册',ai,'zh');
 assert.match(out,/实验室/);
 assert.match(out,/PDF p. 2/);
});
