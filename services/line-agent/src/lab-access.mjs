import {createHash} from 'node:crypto';
import {sameSecret} from './core.mjs';
export const validLabUser=id=>typeof id==='string'&&/^U[0-9a-f]{32}$/i.test(id);
export function labAllowed(c,store,id) {
 return validLabUser(id)&&(store.setting('lab_owner')===id||(c.labAllowedUsers||[]).includes(id));
}
export function canPairLab(c,store,e) {
 if(e?.source?.type!=='user'||!validLabUser(e.source.userId)||e.type!=='message'||e.message?.type!=='text'||store.setting('lab_owner'))return false;
 if(!Number.isFinite(c.labPairExpires)||Date.now()>c.labPairExpires||!/^\/[lL]ab-pair /.test(e.message.text||''))return false;
 const code=e.message.text.slice(10).trim();
 return code.length>=24&&/^[a-f0-9]{64}$/i.test(c.labPairHash||'')&&sameSecret(createHash('sha256').update(code).digest('hex'),c.labPairHash);
}
export function privateLabEvent(c,store,e) {
 return e?.source?.type==='user'&&e.type==='message'&&e.message?.type==='text'&&(labAllowed(c,store,e.source.userId)||canPairLab(c,store,e));
}
