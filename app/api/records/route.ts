import {NextRequest, NextResponse} from 'next/server';
import {supabase, supabaseConfig, explainSupabaseError} from '@/lib/storage';
import {canWrite, readRecord, writeRecord} from '@/lib/filestore';
export const dynamic='force-dynamic';
const notConfiguredMessage=()=>{const c=supabaseConfig();return !c.hasUrl&&!c.hasKey?'Supabase chưa được cấu hình (thiếu URL và khóa).':!c.hasUrl?'Supabase chưa được cấu hình (thiếu NEXT_PUBLIC_SUPABASE_URL).':'Supabase chưa được cấu hình (thiếu SUPABASE_SERVICE_ROLE_KEY hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY).'};
export async function GET(req:NextRequest){
 const db=supabase(); const documentId=req.nextUrl.searchParams.get('document_id');
 if(!db){
  // No Supabase: keep records in server-side files so they survive restarts / other browsers. Falls back to browser-only storage if the host is read-only.
  if(!(await canWrite())) return NextResponse.json({data:null,configured:false,reason:notConfiguredMessage()});
  try{return NextResponse.json({data:documentId?await readRecord(documentId):null,configured:true,store:'file'});}
  catch(e){return NextResponse.json({data:null,configured:true,store:'file',error:e instanceof Error?e.message:String(e)},{status:500});}
 }
 try{
  let q=db.from('form_records').select('*').order('updated_at',{ascending:false}).limit(1); if(documentId) q=q.eq('document_id',documentId);
  const {data,error}=await q;
  if(error) return NextResponse.json({data:null,configured:true,error:explainSupabaseError(error),raw:error.message},{status:500});
  return NextResponse.json({data:data?.[0]??null,configured:true});
 }catch(e){return NextResponse.json({data:null,configured:true,error:explainSupabaseError({message:e instanceof Error?e.message:String(e)})},{status:500});}
}
export async function POST(req:NextRequest){
 const db=supabase();
 let body:{document_id?:string;data?:unknown;user_id?:string};
 try{body=await req.json();}catch{return NextResponse.json({error:'Dữ liệu gửi lên không hợp lệ'},{status:400});}
 const {document_id,data,user_id='anonymous'}=body;
 if(!document_id) return NextResponse.json({error:'Thiếu document_id'},{status:400});
 if(!db){
  if(!(await canWrite())) return NextResponse.json({error:notConfiguredMessage()},{status:503});
  try{return NextResponse.json({data:await writeRecord(document_id,data,user_id),store:'file'});}
  catch(e){return NextResponse.json({error:'Không ghi được tệp lưu trữ: '+(e instanceof Error?e.message:String(e))},{status:500});}
 }
 try{
  // limit(1) instead of maybeSingle(): tolerates accidental duplicate rows from concurrent autosaves.
  const {data:found,error:findError}=await db.from('form_records').select('id').eq('document_id',document_id).eq('user_id',user_id).order('updated_at',{ascending:false}).limit(1);
  if(findError) return NextResponse.json({error:explainSupabaseError(findError),raw:findError.message},{status:500});
  const existing=found?.[0];
  const payload={document_id,user_id,data,updated_at:new Date().toISOString()};
  const res=existing?await db.from('form_records').update(payload).eq('id',existing.id).select().single():await db.from('form_records').insert(payload).select().single();
  if(res.error) return NextResponse.json({error:explainSupabaseError(res.error),raw:res.error.message},{status:500});
  return NextResponse.json({data:res.data});
 }catch(e){return NextResponse.json({error:explainSupabaseError({message:e instanceof Error?e.message:String(e)})},{status:500});}
}
