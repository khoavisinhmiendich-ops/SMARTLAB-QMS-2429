import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
// Bản sao lưu phụ của dữ liệu nhập trong ứng dụng (ghi chú, nội dung Word/Excel đã sửa).
// Lưu 2 nơi độc lập: (1) thư mục NGOÀI dự án (mặc định ../qms-backup-2429, đổi bằng QMS_BACKUP_DIR)
// để không mất khi thay/xóa thư mục dự án; (2) .data/backup trong dự án.
// Mỗi tài liệu có "latest" + "history" (giữ 30 phiên bản trước đó). Mọi thao tác đều không ném lỗi.
export type BackupRec={document_id:string;user_id:string;data:unknown;updated_at:string;path?:string};
const keyOf=(d:string,u:string)=>crypto.createHash('sha1').update(d+'|'+u).digest('hex');
export function backupDirs():string[]{
  const ext=process.env.QMS_BACKUP_DIR?path.resolve(process.env.QMS_BACKUP_DIR):path.join(process.cwd(),'..','qms-backup-2429');
  return [ext,path.join(process.cwd(),'.data','backup')];
}
function pathFromId(id:string):string|undefined{
  try{const s=Buffer.from(id,'base64url').toString('utf8');return /[\\/]/.test(s)||/\.(docx|pdf|xlsx|jpe?g|png)$/i.test(s)?s:undefined;}catch{return undefined;}
}
async function atomicWrite(file:string,content:string){
  await fs.mkdir(path.dirname(file),{recursive:true});
  const tmp=file+'.'+process.pid+'.'+Date.now()+'.tmp';
  await fs.writeFile(tmp,content,'utf8');await fs.rename(tmp,file);
}
export async function backupRecord(documentId:string,userId:string,data:unknown,updatedAt?:string):Promise<void>{
  const rec:BackupRec={document_id:documentId,user_id:userId,data,updated_at:updatedAt||new Date().toISOString(),path:pathFromId(documentId)};
  const key=keyOf(documentId,userId),json=JSON.stringify(rec);
  for(const base of backupDirs()){
    try{
      const latest=path.join(base,'latest',key+'.json');
      let prev='';try{prev=await fs.readFile(latest,'utf8');}catch{}
      if(prev){
        try{if(JSON.stringify(JSON.parse(prev).data)===JSON.stringify(data))continue;}catch{}
        // Giữ lại phiên bản cũ trước khi ghi đè để có thể khôi phục.
        const hdir=path.join(base,'history',key);await fs.mkdir(hdir,{recursive:true});
        let stamp=new Date().toISOString();try{stamp=JSON.parse(prev).updated_at||stamp;}catch{}
        await fs.writeFile(path.join(hdir,String(stamp).replace(/[:.]/g,'-')+'.json'),prev,'utf8');
        const old=(await fs.readdir(hdir)).sort();
        for(const f of old.slice(0,Math.max(0,old.length-30)))await fs.unlink(path.join(hdir,f)).catch(()=>{});
      }
      await atomicWrite(latest,json);
    }catch{/* nơi sao lưu này không ghi được: bỏ qua, nơi còn lại vẫn hoạt động */}
  }
}
// Lấy bản sao lưu mới nhất của một tài liệu (null nếu chưa có).
export async function restoreRecord(documentId:string,userId:string):Promise<BackupRec|null>{
  const key=keyOf(documentId,userId);let best:BackupRec|null=null;
  for(const base of backupDirs()){
    try{
      const r=JSON.parse(await fs.readFile(path.join(base,'latest',key+'.json'),'utf8')) as BackupRec;
      if(!best||String(r.updated_at)>String(best.updated_at))best=r;
    }catch{}
  }
  return best;
}
// Đánh dấu tệp tài liệu đã bị thay bằng tệp mới (qua nút "Thêm tệp"): nội dung chỉnh sửa cũ trên web
// (lưu trước thời điểm này) không còn phủ lên tệp mới, nhưng vẫn được giữ nguyên trong dữ liệu/bản sao lưu.
const replacedFiles=()=>[path.join(process.cwd(),'.data','replaced.json'),path.join(backupDirs()[0],'replaced.json')];
export async function readReplaced():Promise<Record<string,number>>{
  const out:Record<string,number>={};
  for(const f of replacedFiles()){try{const m=JSON.parse(await fs.readFile(f,'utf8')) as Record<string,number>;for(const k of Object.keys(m))out[k]=Math.max(out[k]||0,Number(m[k])||0);}catch{}}
  return out;
}
export async function markReplaced(rel:string):Promise<void>{
  const now=Date.now();
  for(const f of replacedFiles()){try{let m:Record<string,number>={};try{m=JSON.parse(await fs.readFile(f,'utf8'));}catch{}m[rel]=now;await atomicWrite(f,JSON.stringify(m));}catch{}}
}
// Lưu bản sao của tệp tài liệu cũ trước khi bị thay thế.
export async function archiveReplacedFile(abs:string,rel:string):Promise<void>{
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  for(const base of backupDirs()){try{const d=path.join(base,'replaced-files',stamp);await fs.mkdir(d,{recursive:true});await fs.copyFile(abs,path.join(d,rel.replace(/[\\/]/g,'__')));}catch{}}
}
