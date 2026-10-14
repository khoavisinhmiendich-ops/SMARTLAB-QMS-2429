import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
// File-based record store used when Supabase is not configured. Records live OUTSIDE the browser, so they
// survive restarting `npm run dev`, Ctrl+F5, a different port/browser, and replacing document files.
// Folder: QMS_DATA_DIR (if set) or <project>/.data/records. Falls back gracefully (canWrite=false) on read-only hosts.
export type FileRecord={document_id:string;user_id:string;data:unknown;updated_at:string};
const dir=()=>process.env.QMS_DATA_DIR?path.resolve(process.env.QMS_DATA_DIR):path.join(process.cwd(),'.data','records');
const fileFor=(documentId:string,userId:string)=>path.join(dir(),crypto.createHash('sha1').update(documentId+'|'+userId).digest('hex')+'.json');
export async function canWrite():Promise<boolean>{
 try{await fs.mkdir(dir(),{recursive:true});await fs.access(dir(),fsConstants.W_OK);return true;}catch{return false;}
}
export async function readRecord(documentId:string,userId='anonymous'):Promise<FileRecord|null>{
 try{return JSON.parse(await fs.readFile(fileFor(documentId,userId),'utf8')) as FileRecord;}
 catch(e){if((e as NodeJS.ErrnoException)?.code==='ENOENT')return null;throw e;}
}
export async function writeRecord(documentId:string,data:unknown,userId='anonymous'):Promise<FileRecord>{
 await fs.mkdir(dir(),{recursive:true});
 const rec:FileRecord={document_id:documentId,user_id:userId,data,updated_at:new Date().toISOString()};
 const target=fileFor(documentId,userId),tmp=target+'.'+process.pid+'.'+Date.now()+'.tmp';
 await fs.writeFile(tmp,JSON.stringify(rec),'utf8');
 await fs.rename(tmp,target); // atomic replace: a crash mid-write never corrupts the saved record
 return rec;
}
