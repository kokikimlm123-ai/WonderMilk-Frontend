import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operationDraft,validateOperations} from '../src/operations.mjs';
import {configuration,pairingCandidate,hash} from '../src/domain.mjs';
test('Thai fuel and expense samples preserve amounts, units and unknown payment state',()=>{
 const a=operationDraft('แจ้งเติมน้ำมันรถเก็บเกี่ยวจำนวน 10,000 บาท 235 ลิตร').records[0];
 assert.equal(a.litres,235);assert.equal(a.amount,10000);assert.equal(a.payment_status,'unknown');
 const e=operationDraft('ค่าของงานโหลดตู้คอนเทนเนอร์ ยอด8246บาทครับ').records[0];assert.equal(e.amount,8246);assert.equal(e.kind,'warehouse_expense');assert.equal(e.date,null);
});
test('maintenance and activity samples do not invent completion, quantities or equipment IDs',()=>{
 assert.equal(operationDraft('Orkel Repairs ongoing.').records[0].work_status,'in_progress');
 assert.equal(operationDraft('คลัชรถคันเหลืองพังหาคนมาซ่อมให้หน่อยครับ').records[0].work_status,'requested');
 assert.equal(operationDraft('ตักข้าวโพดขึ้นสิบล้อ').records[0].quantity,undefined);
 assert.equal(operationDraft('SICK leave Reviewing').records.length,0);
});
test('harvest sample preserves bags, corncob weight, uncertain area basis and date order',()=>{
 const r=operationDraft('Lumsonthi Rai120 {cornsilage}2.10.2026\ncorn silage (small bag) =141bag\nPlot Name =9\nDriver name= Driver A\nNumber of corn truckloads=9{Driver A}\nDriver name=Driver B\nNumber of corn truckloads=3{Driver B}\nNumber of corn truckloads =12\nTotal quantity of corncobs:18071kg');
 const a=r.records[0];assert.equal(a.plot_id,'9');assert.equal(a.area_rai,120);assert.equal(a.area_basis,'unknown');assert.equal(a.bags,141);assert.equal(a.reported_weight_kg,18071);assert.equal(a.weight_material_label,'corncobs');assert.equal(a.truckloads,12);assert.equal(a.date,null);assert.equal(a.drivers.length,2);
 assert.ok(r.issues.includes('numeric_date_order_requires_review'));assert.ok(r.issues.includes('weight_material_differs_from_product'));assert.deepEqual(validateOperations([a]),[]);
 assert.ok(validateOperations([{...a,truckloads:13}]).includes('0:truckload_total_mismatch'));
});
test('operation validation rejects unknown fields, invalid dates, negative values and wrong units',()=>{
 const r={kind:'fuel',date:null,description:'Explicit fuel report',vehicle:'Tractor 26',litres:47,amount:3000,currency:'THB',payment_status:'unknown'};
 for(const patch of [{date:'2026-02-30'},{farm:'Farm 2'},{litres:-1},{amount:'3000'},{currency:'USD'},{payment_status:'approved'}])assert.ok(validateOperations([{...r,...patch}]).length);
 for(const description of ['ဆီဖြည့်မှတ်တမ်း','เติมน้ำมัน','Fuel record'])assert.deepEqual(operationDraft(JSON.stringify({...r,description})).issues,[]);
 assert.throws(()=>configuration({V2_ENV:'development',V2_GROUPS_JSON:JSON.stringify([{id:'C'+'1'.repeat(32),farm:'Farm 2',module:'warehouse',enabled:true}])}));
});
test('pairing rejects expired, wrong, old and nongroup requests',()=>{
 const code='WMV2-'+'b'.repeat(32),now=Date.now(),c={pairHash:hash(code),pairExpires:now+60000};
 const e={type:'message',webhookEventId:'e',timestamp:now,source:{type:'group',groupId:'C'+'1'.repeat(32)},message:{type:'text',text:'/pair '+code}};
 assert.ok(pairingCandidate(e,c,now));assert.equal(pairingCandidate(e,{...c,pairExpires:now-1},now),null);assert.equal(pairingCandidate({...e,timestamp:now-700000},c,now),null);assert.equal(pairingCandidate({...e,source:{type:'user'}},c,now),null);assert.equal(pairingCandidate({...e,message:{type:'text',text:'/pair bad'}},c,now),null);
});
