import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('Excel adapter separates Farm 2 calf/discard columns, preserves missing totals, and excludes other farms and future templates',t=>{
 const dir=mkdtempSync(join(tmpdir(),'wm-xlsx-')),path=join(dir,'fixture.xlsx');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 execFileSync('python3',['-c',`from openpyxl import Workbook
from datetime import datetime
import sys
w=Workbook();f=w.active;f.title='Feed';m=w.create_sheet('Milk')
f.cell(1,25,'Farm 2');f.cell(1,47,'Farm 4');m.cell(1,9,'Farm 2');m.cell(1,17,'Farm 4')
for col,value in {25:datetime(2026,9,14),27:25,36:250,37:30,39:.35}.items(): f.cell(3,col,value)
f.cell(3,39).number_format='0.0%'
for col,value in {9:datetime(2026,9,14),10:25,11:100,12:2,13:3,14:105,15:4.2,17:datetime(2026,9,14),18:77,20:5,21:7,22:12}.items(): m.cell(3,col,value)
for col,value in {9:datetime(2027,1,1),10:25,11:999,12:2,13:3,14:1004}.items(): m.cell(4,col,value)
w.save(sys.argv[1])`,path]);
 const q={farms:['Farm 2','Farm 4'],type:null,today:'2026-09-15'};
 const data=JSON.parse(execFileSync('python3',['scripts/read_xlsx.py',path,JSON.stringify(q)],{encoding:'utf8'}));
 const feed=data.tables.find(t=>t.type==='feed'&&t.farm==='Farm 2');assert.equal(feed.presented_rows[0].dm_percent,35);
 const milk=data.tables.find(t=>t.type==='milk'&&t.farm==='Farm 2');assert.equal(milk.matched_rows,1);assert.equal(milk.presented_rows[0].calf_kg,3);assert.equal(milk.presented_rows[0].discard_kg,2);assert.equal(milk.presented_rows[0].calculated_complete_total_kg,105);
 const f4=data.tables.find(t=>t.type==='milk'&&t.farm==='Farm 4');assert.equal(f4.presented_rows[0].calculated_complete_total_kg,undefined);assert.ok(f4.presented_rows[0].issues[0].includes('Missing'));
 assert.equal(data.tables.some(t=>t.farm==='Farm 1'),false);
 // Some valid exporter-produced workbooks omit optional worksheet dimensions.
 execFileSync('python3',['-c',`import sys,re,zipfile,os
p=sys.argv[1]
with zipfile.ZipFile(p) as src, zipfile.ZipFile(p+'.tmp','w') as dst:
 for item in src.infolist():
  b=src.read(item.filename)
  if item.filename.startswith('xl/worksheets/'):
   b=re.sub(rb'<dimension\\b[^>]*/>',b'',b)
  dst.writestr(item,b)
os.replace(p+'.tmp',p)
`,path]);
 const withoutDimensions=JSON.parse(execFileSync('python3',['scripts/read_xlsx.py',path,JSON.stringify(q)],{encoding:'utf8'}));
 assert.deepEqual(withoutDimensions,data);
});
