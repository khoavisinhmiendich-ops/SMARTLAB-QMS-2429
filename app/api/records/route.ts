import {NextRequest, NextResponse} from 'next/server';
import {supabase} from '@/lib/storage';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const db=supabase(); const documentId=req.nextUrl.searchParams.get('document_id');
 if(!db) return NextResponse.json({data:null,configured:false});
 let q=db.from('form_records').select('*').order('updated_at',{ascending:false}).limit(1); if(documentId) q=q.eq('document_id',documentId);
 const {data,error}=await q; if(error) return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({data:data?.[0]??null,configured:true});
}
export async function POST(req:NextRequest){
 const db=supabase(); if(!db) return NextResponse.json({error:'Supabase chưa được cấu hình'},{status:503});
 const body=await req.json(); const {document_id,data,user_id='anonymous'}=body;
 if(!document_id) return NextResponse.json({error:'Thiếu document_id'},{status:400});
 const {data:existing}=await db.from('form_records').select('id').eq('document_id',document_id).eq('user_id',user_id).maybeSingle();
 const payload={document_id,user_id,data,updated_at:new Date().toISOString()};
 const res=existing?await db.from('form_records').update(payload).eq('id',existing.id).select().single():await db.from('form_records').insert(payload).select().single();
 if(res.error) return NextResponse.json({error:res.error.message},{status:500}); return NextResponse.json({data:res.data});
}
