import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/core.mjs';
import {Worker} from '../src/worker.mjs';
import {privateLabEvent,labAllowed,canPairLab} from '../src/lab-access.mjs';
const owner='U'+'1'.repeat(32),other='U'+'2'.repeat(32),code='test-only-one-time-code-123456789';
function fx(t){const dir=mkdtempSync(join(tmpdir(),'lab-test-')),store=new Store(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {store,c:{dir,enabled:true,group:'Cgroup',labPairHash:createHash('sha256').update(code).digest('hex'),labPairExpires:Date.now()+60000,labAllowedUsers:[]}};}
const ev=(id,text,type='user')=>({type:'message',source:{type,userId:id,groupId:'Cgroup'},timestamp:Date.now(),message:{type:'text',text}});
test('only valid private one-time pairing is admitted',t=>{const {store,c}=fx(t);assert.equal(privateLabEvent(c,store,ev(other,'/cvas report')),false);assert.equal(canPairLab(c,store,ev(owner,'/lab-pair '+code,'group')),false);assert.equal(canPairLab(c,store,ev(owner,'/lab-pair wrong')),false);assert.equal(canPairLab({...c,labPairExpires:0},store,ev(owner,'/lab-pair '+code)),false);assert.equal(canPairLab(c,store,ev(owner,'/lab-pair '+code)),true);store.set('lab_owner',owner);assert.equal(canPairLab(c,store,ev(other,'/lab-pair '+code)),false);assert.equal(labAllowed(c,store,other),false);});
test('private pairing registers owner and keeps confirmation out of group',async t=>{const {store,c}=fx(t);const w=new Worker(c,store,{}, {},{});await w.process({id:'pair',payload:JSON.stringify(ev(owner,'/lab-pair '+code))});assert.equal(store.setting('lab_owner'),owner);const out=store.db.prepare('SELECT * FROM outgoing').get();assert.equal(out.group_id,owner);assert.match(out.text,/private access is ready/);});
test('all connected group members can request CVAS; other groups and unmentioned requests cannot',async t=>{
 const {store,c}=fx(t);let fetched=0;
 const index={schema_version:1,reports:[{sha256:'a'.repeat(64),lab_id:'12345678',filenames:['test.pdf'],text:'DM 40'}]};
 const w=new Worker(c,store,{cvasIndex:async()=>{fetched++;return index;}},{answer:async()=> 'DM 40'},{});
 await w.process({id:'allowed',payload:JSON.stringify(ev(other,'@WM /cvas 12345678 DM','group'))});
 assert.equal(fetched,1);assert.match(store.db.prepare('SELECT text FROM outgoing').get().text,/^DM 40/);
 const wrong=ev(other,'@WM /cvas 12345678 DM','group');wrong.source.groupId='Cother';
 await w.process({id:'wrong',payload:JSON.stringify(wrong)});
 await w.process({id:'silent',payload:JSON.stringify(ev(other,'/cvas 12345678 DM','group'))});
 assert.equal(fetched,1);
});
test('unauthorized direct event is denied before any data retrieval',async t=>{const {store,c}=fx(t);store.set('lab_owner',owner);let fetched=false;const w=new Worker(c,store,{cvasIndex:async()=>{fetched=true;}},{},{});await w.process({id:'bad',payload:JSON.stringify(ev(other,'/cvas all reports'))});assert.equal(fetched,false);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outgoing').get().n,0);});
test('queued private report is cancelled if permission was removed',async t=>{const {store,c}=fx(t);c.token='test';store.out('old',other,'private report');let sent=false;const w=new Worker(c,store,{}, {},{send:async()=>{sent=true;}});await w.tick();assert.equal(sent,false);assert.equal(store.db.prepare('SELECT status FROM outgoing').get().status,'cancelled');});
