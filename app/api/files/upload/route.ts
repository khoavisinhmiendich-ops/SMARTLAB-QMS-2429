import {NextRequest,NextResponse} from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import {isGatedName} from '@/lib/gate';
import {hasGate,relFromDocumentId} from '@/lib/gateServer';
import {normFileName} from '@/lib/filename';
import {archiveReplacedFile,markReplaced} from '@/lib/backup';
import {auditLog,clientIp} from '@/lib/security';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const ROOT=()=>path.join(process.cwd(),'public','2429.2026');
const EXTS=new Set(['.docx','.pdf','.xlsx','.jpg','.jpeg','.png']);
const MAX=50*1024*1024;
type Result={name:string;status:'replaced'|'added'|'error';message:string;folder?:string};
// Kiểm tra phần đầu tệp để chặn tệp giả đuôi (vd. .exe đổi tên thành .docx).
function signatureOk(ext:string,b:Buffer):boolean{
  if(ext==='.docx'||ext==='.xlsx')return b.length>3&&b[0]===0x50&&b[1]===0x4b;
  if(ext==='.pdf')return b.subarray(0,5).toString('latin1')==='%PDF-';
  if(ext==='.png')return b.length>7&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47;
  return b.length>2&&b[0]===0xff&&b[1]===0xd8;
}
async function findByName(dir:string,rel:string,target:string,out:{abs:string;rel:string}[]){
  for(const e of await fs.readdir(dir,{withFileTypes:true})){
    const abs=path.join(dir,e.name),r=rel?rel+'/'+e.name:e.name;
    if(e.isDirectory())await findByName(abs,r,target,out);
    else if(normFileName(e.name)===target)out.push({abs,rel:r});
  }
}
async function writeAtomic(dest:string,buf:Buffer){
  const tmp=dest+'.'+process.pid+'.'+Date.now()+'.tmp';
  await fs.writeFile(tmp,buf);await fs.rename(tmp,dest);
}
export async function POST(req:NextRequest){
  let form:FormData;try{form=await req.formData();}catch{return NextResponse.json({error:'Dữ liệu tải lên không hợp lệ hoặc quá lớn (tối đa 50 MB mỗi tệp).'},{status:400});}
  const files=form.getAll('files').filter((f):f is File=>typeof f!=='string');
  const folderRaw=String(form.get('folder')||'').trim();
  const targetId=String(form.get('target')||'').trim();
  if(!files.length)return NextResponse.json({error:'Chưa chọn tệp.'},{status:400});
  if(files.length>20)return NextResponse.json({error:'Mỗi lần tối đa 20 tệp.'},{status:400});
  const root=ROOT(),gated=hasGate(req),ip=clientIp(req);
  const topOf=(rel:string)=>rel.split('/')[0];
  // Chế độ "Thay tệp đang mở": thay đúng tệp được chỉ định, bất kể tên tệp mới là gì (phải cùng định dạng).
  if(targetId){
    const rel=relFromDocumentId(targetId).split(/[\\/]/).join('/');
    const abs=path.resolve(root,rel);
    if(!rel||!abs.startsWith(root+path.sep))return NextResponse.json({error:'Tài liệu cần thay không hợp lệ.'},{status:400});
    if(files.length!==1)return NextResponse.json({error:'Chỉ chọn 1 tệp để thay.'},{status:400});
    if(rel.split('/').some(isGatedName)&&!gated)return NextResponse.json({error:'Thư mục được bảo vệ bằng passkey. Hãy nhập passkey trước.'},{status:403});
    const f=files[0],ext=path.extname(f.name||'').toLowerCase(),oldExt=path.extname(abs).toLowerCase();
    const same=ext===oldExt||(['.jpg','.jpeg'].includes(ext)&&['.jpg','.jpeg'].includes(oldExt));
    if(!EXTS.has(ext)||!same)return NextResponse.json({error:`Tệp mới phải cùng định dạng ${oldExt||''} với tệp đang thay.`},{status:400});
    if(f.size>MAX)return NextResponse.json({error:'Tệp vượt quá 50 MB.'},{status:400});
    const buf=Buffer.from(await f.arrayBuffer());
    if(!signatureOk(ext,buf))return NextResponse.json({error:'Nội dung tệp không đúng định dạng '+ext+'.'},{status:400});
    try{await fs.access(abs);}catch{return NextResponse.json({error:'Không tìm thấy tệp cũ để thay.'},{status:404});}
    try{
      await archiveReplacedFile(abs,rel);await writeAtomic(abs,buf);await markReplaced(rel);
      await auditLog('data','file_replaced',{rel,size:buf.length,ip,mode:'target'});
      return NextResponse.json({results:[{name:path.basename(abs),status:'replaced',message:'Đã thay thế tệp (tệp cũ được lưu bản sao lưu).',folder:topOf(rel)}]});
    }catch(e){return NextResponse.json({error:'Không ghi được tệp: '+(e instanceof Error?e.message:String(e))},{status:500});}
  }
  let folder='';
  if(folderRaw){
    const abs=path.resolve(root,folderRaw);
    if(abs===root||!abs.startsWith(root+path.sep)||folderRaw.includes('/')||folderRaw.includes('\\'))return NextResponse.json({error:'Thư mục đích không hợp lệ.'},{status:400});
    folder=folderRaw;
  }
  const results:Result[]=[];
  for(const f of files){
    const name=path.basename(f.name||'').normalize('NFC').replace(/[<>:"|?*\u0000-\u001f]/g,'_').trim();
    const fail=(message:string)=>results.push({name:name||'(không tên)',status:'error',message});
    const ext=path.extname(name).toLowerCase();
    if(!name||name.startsWith('.')||!EXTS.has(ext)){fail('Chỉ nhận .docx, .pdf, .xlsx, .jpg, .png.');continue;}
    if(f.size>MAX){fail('Tệp vượt quá 50 MB.');continue;}
    const buf=Buffer.from(await f.arrayBuffer());
    if(!signatureOk(ext,buf)){fail('Nội dung tệp không đúng định dạng '+ext+'.');continue;}
    // 1) Có tệp cùng tên trong thư viện -> thay thế đúng vị trí và đúng tên tệp cũ (giữ nguyên dữ liệu gắn với nó).
    const found:{abs:string;rel:string}[]=[];
    try{await findByName(root,'',normFileName(name),found);}catch{}
    const match=found.length===1?found[0]:found.find(m=>folder&&normFileName(topOf(m.rel))===normFileName(folder)||folder&&topOf(m.rel)===folder);
    if(found.length>1&&!match){fail('Có '+found.length+' tệp trùng tên ở nhiều thư mục. Hãy chọn thư mục đích rồi tải lại.');continue;}
    if(match&&match.rel.split('/').some(isGatedName)&&!gated){fail('Thư mục được bảo vệ bằng passkey. Hãy nhập passkey trước.');continue;}
    try{
      if(match){
        await archiveReplacedFile(match.abs,match.rel);
        await writeAtomic(match.abs,buf);
        await markReplaced(match.rel);
        await auditLog('data','file_replaced',{rel:match.rel,size:buf.length,ip});
        results.push({name,status:'replaced',message:'Đã thay thế tệp cũ (tệp cũ được lưu bản sao lưu).',folder:topOf(match.rel)});
        continue;
      }
      // 2) Tệp mới -> thêm vào thư mục đã chọn.
      if(!folder){fail('Tệp mới: hãy chọn thư mục đích.');continue;}
      if(isGatedName(folder)&&!gated){fail('Thư mục được bảo vệ bằng passkey. Hãy nhập passkey trước.');continue;}
      const dir=path.join(root,folder);await fs.mkdir(dir,{recursive:true});
      await fs.writeFile(path.join(dir,name),buf,{flag:'wx'});
      await auditLog('data','file_added',{rel:folder+'/'+name,size:buf.length,ip});
      results.push({name,status:'added',message:'Đã thêm tệp mới.',folder});
    }catch(e){fail('Không ghi được tệp: '+(e instanceof Error?e.message:String(e))+'. (Máy chủ chỉ đọc, ví dụ Vercel, không hỗ trợ thêm tệp.)');}
  }
  return NextResponse.json({results});
}
