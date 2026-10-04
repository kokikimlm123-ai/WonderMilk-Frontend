import {resolve} from 'node:path';

export const FARMS = Object.freeze(['Farm 2','Farm 4','Ryokusan']);
export function configuration(e=process.env) {
  const maxCalls=Number(e.MAX_AI_CALLS_PER_DAY||100);
  if (!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>10000) throw new Error('Invalid MAX_AI_CALLS_PER_DAY');
  const volumeReady=!e.RAILWAY_ENVIRONMENT_ID||resolve(e.RAILWAY_VOLUME_MOUNT_PATH||'/__missing_volume__')===resolve(e.DATA_DIR||'data');
  if(e.BOT_ENABLED==='true'&&!volumeReady)throw new Error('Attach a persistent Railway volume at DATA_DIR before enabling the bot');
  return {
    port:Number(e.PORT||3000), dir:resolve(e.DATA_DIR||'data'),
    secret:e.LINE_CHANNEL_SECRET||'', token:e.LINE_CHANNEL_ACCESS_TOKEN||'',
    group:e.LINE_GROUP_ID||'', pairing:e.PAIRING_CODE||'',
    aiKey:e.OPENAI_API_KEY||'', model:e.OPENAI_MODEL||'gpt-5.4-mini',
    googleJSON:e.GOOGLE_SERVICE_ACCOUNT_JSON||'',
    sheet:e.AGENT_SPREADSHEET_ID||'',
    cvasIndex:e.CVAS_INDEX_FILE_ID||'',
    labPairHash:e.LAB_PAIR_SHA256||'', labPairExpires:Date.parse(e.LAB_PAIR_EXPIRES||''),
    labAllowedUsers:(e.LAB_ALLOWED_USER_IDS||'').split(',').map(x=>x.trim()).filter(x=>/^U[0-9a-f]{32}$/i.test(x)),
    sourceIds:{cows:e.COW_SOURCE_SPREADSHEET_ID||'',milkTests:e.MILK_TEST_SOURCE_SPREADSHEET_ID||'',dailyExcel:e.DAILY_SOURCE_FILE_ID||'',ryokusan:e.RYOKUSAN_SOURCE_FILE_ID||''},
    maxCalls, volumeReady, enabled:e.BOT_ENABLED==='true', python:e.PYTHON_BIN||'python3',
  };
}
export function missingConfiguration(c) {
  return [!c.secret&&'LINE_CHANNEL_SECRET',!c.token&&'LINE_CHANNEL_ACCESS_TOKEN',
    !c.aiKey&&'OPENAI_API_KEY',!c.googleJSON&&'GOOGLE_SERVICE_ACCOUNT_JSON',
    !c.sheet&&'AGENT_SPREADSHEET_ID',!c.sourceIds?.cows&&'COW_SOURCE_SPREADSHEET_ID',
    !c.sourceIds?.milkTests&&'MILK_TEST_SOURCE_SPREADSHEET_ID',!c.sourceIds?.dailyExcel&&'DAILY_SOURCE_FILE_ID',
    c.volumeReady===false&&'Persistent volume mounted at DATA_DIR',
    !c.group&&(c.pairing||'').length<24&&'LINE_GROUP_ID or PAIRING_CODE (24+ characters)']
    .filter(Boolean);
}
export function bangkokDate() {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
