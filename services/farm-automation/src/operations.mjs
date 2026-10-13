// Warehouse/Corn Field pilot: deterministic drafts, no implicit cross-message joins.
export const operationKinds=['warehouse_activity','fuel','maintenance','harvest','warehouse_expense'];
const base=['kind','date','description','plot_id','location','notes'];
const fields={
 warehouse_expense:[...base,'amount','currency','payment_status'],
 warehouse_activity:[...base,'activity','material','quantity','unit','vehicle'],
 fuel:[...base,'vehicle','litres','amount','currency','payment_status'],
 maintenance:[...base,'vehicle','reported_problem','work_status','amount','currency'],
 harvest:[...base,'area_rai','area_basis','bags','bag_type','material','reported_weight_kg','weight_material_label','truckloads','drivers']
};
export function validateOperations(records){
 if(!Array.isArray(records)||!records.length||records.length>40)return ['records_required_1_to_40'];
 const errors=[];
 records.forEach((r,i)=>{
  const fail=s=>errors.push(`${i}:${s}`);
  if(!r||typeof r!=='object'||Array.isArray(r)||!fields[r.kind]){fail('invalid_operation_kind');return;}
  if(Object.keys(r).some(k=>!fields[r.kind].includes(k)))fail('unknown_operation_field');
  if(typeof r.description!=='string'||!r.description.trim())fail('description_required');
  if(r.date!=null&&(typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date))fail('invalid_date');
  for(const k of ['description','plot_id','location','notes','activity','material','unit','vehicle','reported_problem','bag_type','weight_material_label'])if(r[k]!=null&&(typeof r[k]!=='string'||!r[k].trim()||r[k].length>2000))fail(`invalid_${k}`);
  for(const k of ['quantity','litres','amount','area_rai','bags','reported_weight_kg','truckloads'])if(r[k]!=null&&(typeof r[k]!=='number'||!Number.isFinite(r[k])||r[k]<0))fail(`invalid_${k}`);
  for(const k of ['bags','truckloads'])if(r[k]!=null&&!Number.isInteger(r[k]))fail(`invalid_${k}`);
  if(r.amount!=null&&r.currency!=='THB')fail('explicit_THB_required');
  if(r.currency!=null&&r.currency!=='THB')fail('unsupported_currency');
  if(r.kind==='warehouse_expense'&&(r.amount==null||!['unknown','requested','paid'].includes(r.payment_status)))fail('expense_fields_required');
  if(r.kind==='fuel'&&(!r.vehicle||r.litres==null||r.amount==null||!['unknown','requested','paid'].includes(r.payment_status)))fail('fuel_fields_required');
  if(r.kind==='maintenance'&&(!r.vehicle||!['unknown','reported','requested','in_progress','completed'].includes(r.work_status)))fail('maintenance_fields_required');
  if(r.kind==='warehouse_activity'&&(!r.activity||(r.quantity!=null&&!r.unit)))fail('activity_and_quantity_unit_required');
  if(r.kind==='harvest'){
   if(!['unknown','plot_total','harvested'].includes(r.area_basis))fail('area_basis_required');
   if(r.reported_weight_kg!=null&&!r.weight_material_label)fail('weight_source_label_required');
   if(r.drivers!=null){
    if(!Array.isArray(r.drivers)||r.drivers.length>40)fail('invalid_drivers');
    else {for(const d of r.drivers)if(!d||typeof d.name!=='string'||!d.name.trim()||d.name.length>100||!Number.isInteger(d.truckloads)||d.truckloads<0||Object.keys(d).some(k=>!['name','truckloads'].includes(k)))fail('invalid_driver');
     if(r.truckloads!=null&&r.drivers.reduce((n,d)=>n+(d?.truckloads||0),0)!==r.truckloads)fail('truckload_total_mismatch');}
   }
  }
 });return errors;
}
const digits=s=>s.replace(/[၀-၉]/g,c=>String(c.charCodeAt(0)-0x1040)).replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-0xe50));
const n=s=>Number(s.replace(/,/g,''));
export function operationDraft(text){
 const t=digits(text.trim()), issues=[];let r;
 // Explicit JSON is also the trilingual review/editor interchange format.
 if(t.startsWith('{')||t.startsWith('[')){try{const p=JSON.parse(t);const records=Array.isArray(p)?p:[p];return {records,issues:validateOperations(records),method:'operations-json-v1'};}catch{return {records:[],issues:['invalid_operation_json'],method:'manual'};}}
 const date=t.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]||null;
 const amount=t.match(/([\d,]+(?:\.\d+)?)\s*บาท/),litres=t.match(/([\d,]+(?:\.\d+)?)\s*ลิตร/);
 if(/เติมน้ำมัน/.test(t)&&amount&&litres){const vehicle=t.match(/แทรกเตอร์เบอร์\s*(\d+)/)?'Tractor '+t.match(/แทรกเตอร์เบอร์\s*(\d+)/)[1]:/รถเก็บเกี่ยว/.test(t)?'Harvester':null;
  r={kind:'fuel',date,description:text,vehicle,litres:n(litres[1]),amount:n(amount[1]),currency:'THB',payment_status:'unknown'};
 }else if(/ค่าของงานโหลดตู้คอนเทนเนอร์/.test(t)&&amount)r={kind:'warehouse_expense',date,description:text,amount:n(amount[1]),currency:'THB',payment_status:'unknown'};
 else if(/Orkel Repairs ongoing\.?/i.test(t))r={kind:'maintenance',date,description:text,vehicle:'Orkel',work_status:'in_progress'};
 else if(/คลัชรถคันเหลืองพัง/.test(t))r={kind:'maintenance',date,description:text,vehicle:'Yellow vehicle',reported_problem:'Reported clutch failure',work_status:'requested'};
 else if(/ตักข้าวโพดขึ้นสิบล้อ/.test(t))r={kind:'warehouse_activity',date,description:text,activity:'Loading',material:'Corn',vehicle:'Ten-wheel truck'};
 else if(/corn silage|cornsilage/i.test(t)&&/Plot Name\s*=/i.test(t)){
  const area=t.match(/Rai\s*(\d+(?:\.\d+)?)/i),plot=t.match(/Plot Name\s*=\s*([^\n]+)/i),bags=t.match(/corn silage\s*\(([^)]+)\)\s*=\s*(\d+)\s*bag/i),weight=t.match(/Total quantity of ([^:\n]+):\s*([\d,]+)\s*kg/i);
  const drivers=[...t.matchAll(/Driver name\s*=\s*([^\n]+)\s*\nNumber of corn truckloads\s*=\s*(\d+)/gi)].map(m=>({name:m[1].trim(),truckloads:Number(m[2])}));
  const total=[...t.matchAll(/^Number of corn truckloads\s*=\s*(\d+)\s*$/gim)].at(-1);
  r={kind:'harvest',date,description:text,location:t.match(/^(.+?)\s+Rai/i)?.[1]||null,plot_id:plot?.[1].trim()||null,area_rai:area?Number(area[1]):null,area_basis:'unknown',material:'corn silage',bags:bags?Number(bags[2]):null,bag_type:bags?.[1]||null,reported_weight_kg:weight?n(weight[2]):null,weight_material_label:weight?.[1]||null,truckloads:total?Number(total[1]):null,drivers};
  if(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/.test(t))issues.push('numeric_date_order_requires_review');
  if(weight&&!/corn silage/i.test(weight[1]))issues.push('weight_material_differs_from_product');
  issues.push('area_basis_requires_review');
 }
 if(!r)return {records:[],issues:['unclassified_or_out_of_scope_manual_review'],method:'manual'};
 if(!r.date)issues.push('record_date_unknown');
 if(!r.plot_id)issues.push('plot_unassigned');
 issues.push('source_text_requires_human_verification');
 return {records:[r],issues:[...issues,...validateOperations([r])],method:'operations-pattern-v1'};
}
