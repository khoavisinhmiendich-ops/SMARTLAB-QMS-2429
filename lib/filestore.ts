import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {backupRecord,restoreRecord} from './backup';
import {canonicalId,idVariants} from './docId';
import {auditLog} from './security';
// File-based record store used when Supabase is not configured. Records live OUTSIDE the browser, so they
// survive restarting `npm run dev`, Ctrl+F5, a different port/browser, and replacing document files.
// Folder: QMS_DATA_DIR (if set) or <project>/.data/records. Falls back gracefully (canWrite=false) on read-only hosts.
export type FileRecord={document_id:string;user_id:string;data:unknown;updated_at:string;version?:number};
const dir=()=>process.env.QMS_DATA_DIR?path.resolve(process.env.QMS_DATA_DIR):path.join(process.cwd(),'.data','records');
const fileFor=(documentId:string,userId:string)=>path.join(dir(),crypto.createHash('sha1').update(documentId+'|'+userId).digest('hex')+'.json');
export async function canWrite():Promise<boolean>{
 try{await fs.mkdir(dir(),{recursive:true});await fs.access(dir(),fsConstants.W_OK);return true;}catch{return false;}
}
async function readOne(documentId:string,userId:string):Promise<FileRecord|null>{
 try{return JSON.parse(await fs.readFile(fileFor(documentId,userId),'utf8')) as FileRecord;}
 catch(e){if((e as NodeJS.ErrnoException)?.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 return null;
}
export async function readRecord(documentIdIn:string,userId='anonymous'):Promise<FileRecord|null>{
 const documentId=canonicalId(documentIdIn);
 const cur=await readOne(documentId,userId);if(cur)return cur;
 // Dữ liệu lưu trước đây theo mã cũ ("\\" của Windows, NFD...): chuyển sang mã chuẩn, giữ nguyên nội dung/phiên bản.
 for(const v of idVariants(documentIdIn)){
  if(v===documentId)continue;
  const old=await readOne(v,userId);
  if(old){const rec=await writeRecord(documentId,old.data,userId,old.updated_at,true,Number(old.version)||undefined);await backupRecord(documentId,userId,old.data,rec.updated_at,rec.version);return rec;}
 }
 // Tệp chính không có hoặc bị hỏng (vd. xóa .data, cài lại dự án): tự khôi phục từ bản sao lưu phụ (giữ cả số phiên bản).
 const b=await restoreRecord(documentId,userId);
 if(!b)return null;
 const rec=await writeRecord(documentId,b.data,userId,b.updated_at,true,Number(b.version)||undefined);
 await auditLog('data','record_restored_from_backup',{document_id:documentId,path:b.path});
 return rec;
}
export async function writeRecord(documentId:string,data:unknown,userId='anonymous',updatedAt?:string,skipBackup=false,version?:number):Promise<FileRecord>{
 await fs.mkdir(dir(),{recursive:true});
 const rec:FileRecord={document_id:documentId,user_id:userId,data,updated_at:updatedAt||new Date().toISOString(),...(version!==undefined?{version}:{})};
 const target=fileFor(documentId,userId),tmp=target+'.'+process.pid+'.'+Date.now()+'.tmp';
 await fs.writeFile(tmp,JSON.stringify(rec),'utf8');
 await fs.rename(tmp,target); // atomic replace: a crash mid-write never corrupts the saved record
 if(!skipBackup)await backupRecord(documentId,userId,data,rec.updated_at,rec.version); // bản phụ: không bao giờ làm hỏng thao tác lưu chính
 return rec;
}
// Ghi tuần tự theo từng tài liệu trong cùng một tiến trình để hai lần lưu đồng thời không đè lên nhau.
const locks=new Map<string,Promise<unknown>>();
function withLock<T>(key:string,fn:()=>Promise<T>):Promise<T>{
 const run=(locks.get(key)||Promise.resolve()).then(fn,fn);
 locks.set(key,run.catch(()=>{}));
 return run;
}
// Chỉ ghi khi phiên bản máy khách (baseRev) còn khớp bản đang lưu; nếu thiết bị khác đã lưu trước thì trả về bản hiện tại.
export async function writeRecordCAS(documentIdIn:string,data:unknown,userId='anonymous',baseRev?:number):Promise<{ok:true;rec:FileRecord}|{ok:false;current:FileRecord|null}>{
 const documentId=canonicalId(documentIdIn);
 return withLock(documentId+'|'+userId,async()=>{
  const cur=await readRecord(documentId,userId);
  const c=Number(cur?.version)||0;
  // Xung đột chỉ khi máy khách dựa trên bản CŨ hơn bản đang lưu. Máy khách "đi trước" (máy chủ vừa được khôi phục từ bản sao lưu cũ hơn) thì được ghi, không báo xung đột vô lý.
  if(baseRev!==undefined&&baseRev<c)return {ok:false as const,current:cur};
  const rec=await writeRecord(documentId,data,userId,undefined,false,Math.max(c,baseRev??0)+1);
  return {ok:true as const,rec};
 });
}
