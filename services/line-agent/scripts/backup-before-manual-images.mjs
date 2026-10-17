import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,mkdirSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
const dir=process.env.DATA_DIR||'/data',source=join(dir,'agent.sqlite');
if(existsSync(source)) {
 const folder=join(dir,'backups');mkdirSync(folder,{recursive:true,mode:0o700});
 const target=join(folder,'before-manual-images-v1.sqlite');
 if(!existsSync(target)) {
  const db=new DatabaseSync(source,{readOnly:true});
  try{await backup(db,target);chmodSync(target,0o600);}finally{db.close();}
 }
 const check=new DatabaseSync(target,{readOnly:true});
 try{if(check.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Backup integrity check failed');}finally{check.close();}
 console.log('manual_images_prechange_backup_verified');
}
