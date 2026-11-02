import {NextRequest, NextResponse} from 'next/server';
import {supabase, supabaseConfig, explainSupabaseError} from '@/lib/storage';
import {canWrite, readRecord, writeRecordCAS} from '@/lib/filestore';
import {backupRecord, restoreRecord} from '@/lib/backup';
import {hasGate, isGatedDocumentId} from '@/lib/gateServer';
import {canonicalId, idVariants} from '@/lib/docId';
import {isStub,rehydrate} from '@/lib/archive';
export const dynamic='force-dynamic';
const notConfiguredMessage=()=>{const c=supabaseConfig();return !c.hasUrl&&!c.hasKey?'Supabase chưa được cấu hình (thiếu URL và khóa).':!c.hasUrl?'Supabase chưa được cấu hình (thiếu NEXT_PUBLIC_SUPABASE_URL).':'Supabase chưa được cấu hình (thiếu SUPABASE_SERVICE_ROLE_KEY hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY).'};
const gateDenied=()=>NextResponse.json({error:'Thư mục này được bảo vệ bằng passkey. Hãy nhập passkey để mở.'},{status:403});
// Mỗi bản ghi có số phiên bản (version) tăng sau mỗi lần lưu. Máy khách gửi base_rev = phiên bản nó đã nhận lần cuối;
// nếu thiết bị khác đã lưu trước (phiên bản khác) thì trả 409 kèm bản hiện tại để máy khách xử lý, không ghi đè âm thầm.
export async function GET(req:NextRequest){
 const db=supabase(); const rawId=req.nextUrl.searchParams.get('document_id'); const documentId=rawId?canonicalId(rawId):null; const metaOnly=req.nextUrl.searchParams.get('meta')==='1';
 if(!documentId)return NextResponse.json({error:'Thiếu document_id'},{status:400});
 if(documentId&&isGatedDocumentId(documentId)&&!hasGate(req))return gateDenied();
 if(!db){
  // No Supabase: keep records in server-side files so they survive restarts / other browsers. Falls back to browser-only storage if the host is read-only.
  if(!(await canWrite())) return NextResponse.json({data:null,configured:false,reason:notConfiguredMessage()});
  try{
   const rec=documentId?await readRecord(documentId):null;
   if(metaOnly)return NextResponse.json({configured:true,store:'file',meta:{rev:Number(rec?.version)||0,updated_at:rec?.updated_at||null}});
   return NextResponse.json({data:rec,configured:true,store:'file'});
  }
  catch(e){return NextResponse.json({data:null,configured:true,store:'file',error:e instanceof Error?e.message:String(e)},{status:500});}
 }
 try{
  if(metaOnly&&documentId){
   // Truy vấn nhẹ (không tải nội dung) để các thiết bị kiểm tra nhanh có bản mới hay chưa.
   const m=await db.from('form_records').select('updated_at,version,document_id').in('document_id',idVariants(documentId)).order('updated_at',{ascending:false}).limit(5);
   if(!m.error){const r0=(m.data||[]).find((x:any)=>x.document_id===documentId)||m.data?.[0];return NextResponse.json({configured:true,meta:{rev:Number(r0?.version)||0,updated_at:r0?.updated_at||null}});}
  }
  let q=db.from('form_records').select('*').order('updated_at',{ascending:false}).limit(documentId?5:1); if(documentId) q=q.in('document_id',idVariants(documentId));
  const got=await q; const error=got.error; let data=got.data as any[]|null;
  if(documentId&&data&&data.length){ // ưu tiên bản ghi mang mã chuẩn; bản ghi mã cũ được chuyển sang mã chuẩn (giữ nguyên nội dung và phiên bản)
   const canon=data.find((x:any)=>x.document_id===documentId); const pick=canon||data[0];
   if(!canon&&pick){const mv=await db.from('form_records').update({document_id:documentId}).eq('id',pick.id).select(); if(!mv.error&&mv.data?.[0])data=[mv.data[0]]; else data=[pick];} else data=[pick];
  }
  if(error) return NextResponse.json({data:null,configured:true,error:explainSupabaseError(error),raw:error.message},{status:500});
  if(!data?.[0]&&documentId){const b=await restoreRecord(documentId,'anonymous');if(b)return NextResponse.json({data:{document_id:b.document_id,user_id:b.user_id,data:b.data,updated_at:b.updated_at,...(b.version?{version:b.version}:{})},configured:true,restored:'backup'});}
  if(metaOnly)return NextResponse.json({configured:true,meta:{rev:Number(data?.[0]?.version)||0,updated_at:data?.[0]?.updated_at||null}});
  const row0=data?.[0]; // bản ghi đã lưu trữ lên Google Drive: lấy lại nội dung thật (không bao giờ trả "con trỏ" rỗng cho máy khách)
  if(row0&&isStub(row0.data)){try{row0.data=await rehydrate(row0.data);return NextResponse.json({data:row0,configured:true,restored:'drive'});}catch(e){return NextResponse.json({data:null,configured:true,archived:true,error:'Bản ghi này đã được lưu trữ trên Google Drive nhưng chưa tải về được: '+(e instanceof Error?e.message:String(e))},{status:502});}}
  return NextResponse.json({data:row0??null,configured:true});
 }catch(e){return NextResponse.json({data:null,configured:true,error:explainSupabaseError({message:e instanceof Error?e.message:String(e)})},{status:500});}
}
export async function POST(req:NextRequest){
 const db=supabase();
 let body:{document_id?:string;data?:unknown;user_id?:string;base_rev?:unknown};
 try{body=await req.json();}catch{return NextResponse.json({error:'Dữ liệu gửi lên không hợp lệ'},{status:400});}
 const {data,user_id='anonymous'}=body; const document_id=typeof body.document_id==='string'&&body.document_id?canonicalId(body.document_id):body.document_id; const idAlts=document_id?idVariants(document_id):[];
 const baseRev=typeof body.base_rev==='number'&&Number.isFinite(body.base_rev)?body.base_rev:undefined; // máy khách cũ không gửi: ghi như trước
 if(!document_id) return NextResponse.json({error:'Thiếu document_id'},{status:400});
 if(isGatedDocumentId(document_id)&&!hasGate(req))return gateDenied();
 if(!db){
  if(!(await canWrite())) return NextResponse.json({error:notConfiguredMessage()},{status:503});
  try{
   const out=await writeRecordCAS(document_id,data,user_id,baseRev);
   if(!out.ok)return NextResponse.json({conflict:true,data:out.current},{status:409});
   return NextResponse.json({data:out.rec,store:'file'});
  }
  catch(e){return NextResponse.json({error:'Không ghi được tệp lưu trữ: '+(e instanceof Error?e.message:String(e))},{status:500});}
 }
 try{
  // limit(1) instead of maybeSingle(): tolerates accidental duplicate rows from concurrent autosaves.
  let found:any[]|null=null; let versioned=true;
  const f1=await db.from('form_records').select('id,version,document_id').in('document_id',idAlts).eq('user_id',user_id).order('updated_at',{ascending:false}).limit(5);
  if(f1.error){
   // Bảng cũ chưa có cột version: vẫn lưu được, chỉ không kiểm tra xung đột phiên bản.
   const f2=await db.from('form_records').select('id,document_id').in('document_id',idAlts).eq('user_id',user_id).order('updated_at',{ascending:false}).limit(5);
   if(f2.error) return NextResponse.json({error:explainSupabaseError(f2.error),raw:f2.error.message},{status:500});
   found=f2.data;versioned=false;
  }else found=f1.data;
  const existing=found?.find((x:any)=>x.document_id===document_id)||found?.[0];
  const now=new Date().toISOString();
  let row:any=null;
  if(existing){
   const c=Number(existing.version)||0;
   const conflict=async()=>{const cur=await db.from('form_records').select('*').eq('id',existing.id).limit(1);const cr:any=cur.data?.[0]??null;if(cr&&isStub(cr.data)){try{cr.data=await rehydrate(cr.data);}catch(e){return NextResponse.json({error:'Bản ghi đang lưu trữ trên Google Drive nhưng chưa tải về được: '+(e instanceof Error?e.message:String(e)),archived:true},{status:502});}}return NextResponse.json({conflict:true,data:cr},{status:409});};
   if(versioned&&baseRev!==undefined&&baseRev<c)return await conflict(); // máy khách đi trước bản máy chủ (vừa khôi phục) không phải xung đột
   const base={document_id,user_id,data,updated_at:now};
   // Cập nhật có điều kiện version = c: nếu thiết bị khác vừa ghi xen giữa thì không có dòng nào được cập nhật.
   let res:any=versioned?await db.from('form_records').update({...base,version:Math.max(c,baseRev??0)+1}).eq('id',existing.id).eq('version',c).select():await db.from('form_records').update(base).eq('id',existing.id).select();
   if(res.error&&versioned)res=await db.from('form_records').update(base).eq('id',existing.id).select(); // dự phòng: không để lỗi kiểm tra phiên bản chặn việc lưu
   if(res.error) return NextResponse.json({error:explainSupabaseError(res.error),raw:res.error.message},{status:500});
   if(!res.data||res.data.length===0)return await conflict();
   row=res.data[0];
  }else{
   const base={document_id,user_id,data,updated_at:now};
   let res:any=versioned?await db.from('form_records').insert({...base,version:1}).select().single():await db.from('form_records').insert(base).select().single();
   if(res.error&&versioned)res=await db.from('form_records').insert(base).select().single();
   if(res.error) return NextResponse.json({error:explainSupabaseError(res.error),raw:res.error.message},{status:500});
   row=res.data;
  }
  await backupRecord(document_id,user_id,data,undefined,Number(row?.version)||undefined); // bản sao lưu phụ trên máy chủ (không ảnh hưởng kết quả lưu chính)
  return NextResponse.json({data:row});
 }catch(e){return NextResponse.json({error:explainSupabaseError({message:e instanceof Error?e.message:String(e)})},{status:500});}
}
