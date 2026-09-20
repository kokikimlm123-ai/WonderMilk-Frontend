import test from 'node:test';
import assert from 'node:assert/strict';
import {configuration,missingConfiguration} from '../src/config.mjs';
import {Google} from '../src/integrations.mjs';

test('Railway activation requires persistent storage and private file configuration',()=>{
  const paused=configuration({RAILWAY_ENVIRONMENT_ID:'test',DATA_DIR:'/data'});
  assert.equal(paused.enabled,false);
  assert.ok(missingConfiguration(paused).includes('Persistent volume mounted at DATA_DIR'));
  assert.ok(missingConfiguration(paused).includes('COW_SOURCE_SPREADSHEET_ID'));
  assert.equal(paused.sheet,'');
  assert.throws(()=>configuration({RAILWAY_ENVIRONMENT_ID:'test',DATA_DIR:'/data',BOT_ENABLED:'true'}),/persistent/);
  assert.throws(()=>configuration({RAILWAY_ENVIRONMENT_ID:'test',DATA_DIR:'/data',RAILWAY_VOLUME_MOUNT_PATH:'/wrong',BOT_ENABLED:'true'}),/persistent/);
  const c=configuration({RAILWAY_ENVIRONMENT_ID:'test',DATA_DIR:'/data',RAILWAY_VOLUME_MOUNT_PATH:'/data',BOT_ENABLED:'true',COW_SOURCE_SPREADSHEET_ID:'private-cow-source'});
  assert.equal(c.enabled,true);
  assert.equal(c.sourceIds.cows,'private-cow-source');
});

test('cow queries use the configured file and keep all Farm 2 source columns',async()=>{
  const g=new Google({sourceIds:{cows:'test-cow-source'}}),reads=[];
  g.grid=async id=>{assert.equal(id,'test-cow-source');return {rowCount:100};};
  g.values=async(id,range)=>{reads.push({id,range});return [];};
  await g.sources({farms:['Farm 2','Farm 4'],type:'cow'});
  assert.deepEqual(reads,[{id:'test-cow-source',range:"'Farm 2 Data'!A1:Y100"},{id:'test-cow-source',range:"'Farm 4 Data'!A1:N100"}]);
});
