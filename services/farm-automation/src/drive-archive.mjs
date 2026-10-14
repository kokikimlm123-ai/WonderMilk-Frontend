// Development-only routing. Not connected to the live worker or Google Drive.
import {createHash} from 'node:crypto';
export const archiveCategories=Object.freeze({petty_cash:'Petty Cash',corn_field:'Corn Field Records',warehouse_fixing:'Warehouse Fixing Records',cleaning:'Cleaning Records',needs_review:'Needs Review'});
const hash=s=>createHash('sha256').update(s).digest('hex');
const extensions=Object.freeze({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/json':'json','text/plain':'txt'});

// Callers supply a trusted group registry and reviewer-selected category.
// Source messages/images cannot set a destination, group, or permission.
export function archivePlan({groupId,messageId,receivedAt,mime,category},groups){
 const group=groups.find(g=>g.id===groupId&&g.enabled);
 if(!group)throw Error('group_not_allowed');
 if(typeof groupId!=='string'||!groupId||typeof messageId!=='string'||!messageId||messageId.length>200)throw Error('invalid_source');
 const selected=category??group.archiveCategory??'needs_review';
 if(!Object.hasOwn(archiveCategories,selected))throw Error('invalid_archive_category');
 if(!Object.hasOwn(extensions,mime))throw Error('unsupported_archive_type');
 if(typeof receivedAt!=='number'||!Number.isFinite(receivedAt)||receivedAt<0||receivedAt>8640000000000000)throw Error('invalid_received_at');
 const name=group.archiveLabel??group.farm;
 if(typeof name!=='string'||!name.trim()||name.length>160)throw Error('invalid_group_label');
 const label=name.trim().replace(/[\\/\x00-\x1f\x7f]/g,'_');
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(receivedAt)).map(x=>[x.type,x.value]));
 const groupKey=hash(groupId),sourceKey=hash(JSON.stringify([groupId,messageId,mime]));
 return {category:selected,groupKey,sourceKey,folders:[`${label} -- ${groupKey}`,archiveCategories[selected],`${p.year}-${p.month}`],name:`${p.year}-${p.month}-${p.day}_${sourceKey}.${extensions[mime]}`,mime,dateBasis:'message_received_at_Asia_Bangkok'};
}
