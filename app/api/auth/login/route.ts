import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const user=process.env.QMS_LOGIN_USERNAME; const pass=process.env.QMS_LOGIN_PASSWORD; const secret=process.env.QMS_AUTH_SECRET;
 if(!user||!pass||!secret) return NextResponse.json({error:'Chưa cấu hình tài khoản khóa hệ thống. Hãy thiết lập QMS_LOGIN_USERNAME, QMS_LOGIN_PASSWORD và QMS_AUTH_SECRET trong .env.local/Vercel.'},{status:503});
 let body:any;try{body=await req.json()}catch{return NextResponse.json({error:'Dữ liệu đăng nhập không hợp lệ.'},{status:400})}
 if(typeof body.username!=='string'||typeof body.password!=='string'||body.username!==user||body.password!==pass) return NextResponse.json({error:'Tên đăng nhập hoặc mật khẩu không đúng.'},{status:401});
 const expires=String(Date.now()+8*60*60*1000); const sig=createHmac('sha256',secret).update(expires).digest('base64url'); const res=NextResponse.json({ok:true});
 res.cookies.set('qms_session',`${expires}.${sig}`,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:8*60*60});return res;
}
