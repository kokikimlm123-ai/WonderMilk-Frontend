import test from 'node:test';
import assert from 'node:assert/strict';
import {archivePlan,archiveCategories} from '../src/drive-archive.mjs';
const groups=[{id:'group-A',enabled:true,farm:'Warehouse & Corn Field Test'},{id:'group-B',enabled:true,farm:'Warehouse & Corn Field Test'}];
const input={groupId:'group-A',messageId:'message-1',receivedAt:Date.parse('2026-10-13T18:00:00Z'),mime:'image/jpeg'};
test('Drive routes four explicit categories and ambiguous images to Needs Review',()=>{
 for(const category of Object.keys(archiveCategories))assert.equal(archivePlan({...input,category},groups).folders[1],archiveCategories[category]);
 assert.equal(archivePlan(input,groups).category,'needs_review');
 assert.equal(archivePlan(input,[{...groups[0],archiveCategory:'corn_field'}]).category,'corn_field');
 assert.equal(archivePlan({...input,category:'cleaning'},[{...groups[0],archiveCategory:'corn_field'}]).category,'cleaning');
});
test('Drive isolates groups with identical labels and produces stable retry identities',()=>{
 const a=archivePlan(input,groups),b=archivePlan({...input,groupId:'group-B'},groups);
 assert.notEqual(a.folders[0],b.folders[0]);assert.notEqual(a.sourceKey,b.sourceKey);
 assert.deepEqual(a,archivePlan(input,groups));
 assert.equal(archivePlan({...input,category:'cleaning'},groups).sourceKey,a.sourceKey);
 assert.notEqual(archivePlan({...input,messageId:'message-2'},groups).sourceKey,a.sourceKey);
});
test('Drive month uses Bangkok receipt time, without inferring record date',()=>{
 const p=archivePlan({...input,receivedAt:Date.parse('2026-10-31T18:00:00Z')},groups);
 assert.equal(p.folders[2],'2026-11');assert.match(p.name,/^2026-11-01_/);assert.equal(p.dateBasis,'message_received_at_Asia_Bangkok');
});
test('Drive routing rejects unauthorized groups and invalid metadata',()=>{
 assert.throws(()=>archivePlan(input,[]),/group_not_allowed/);
 assert.throws(()=>archivePlan(input,[{...groups[0],enabled:false}]),/group_not_allowed/);
 for(const patch of [{category:'../private'},{category:'toString'},{mime:'text/html'},{mime:'constructor'},{receivedAt:NaN},{receivedAt:undefined},{messageId:''}])assert.throws(()=>archivePlan({...input,...patch},groups));
});
test('Drive preserves Myanmar and Thai labels while removing path/control characters',()=>{
 const p=archivePlan(input,[{...groups[0],archiveLabel:'လယ် / คลัง\n'}]);
 assert.ok(p.folders[0].includes('လယ်'));assert.ok(p.folders[0].includes('คลัง'));assert.ok(!/[\/\n]/.test(p.folders[0]));
 assert.throws(()=>archivePlan(input,[{...groups[0],archiveLabel:''}]),/invalid_group_label/);
});
