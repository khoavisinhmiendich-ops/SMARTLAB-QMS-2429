import {NextRequest,NextResponse} from 'next/server';
import {GATE_COOKIE} from '@/lib/gate';
import {gateCookieOptions,hasGate,makeGateToken,passkeyOk,usingDefaultPasskey} from '@/lib/gateServer';
import {auditLog,clientIp,lockState,recordFail,recordSuccess,waitText} from '@/lib/security';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){return NextResponse.json({unlocked:hasGate(req)});}
export async function POST(req:NextRequest){
  const secret=process.env.QMS_AUTH_SECRET;
  if(!secret)return NextResponse.json({error:'Chưa cấu hình QMS_AUTH_SECRET nên chưa thể mở khóa thư mục.'},{status:503});
  const ip=clientIp(req),key='bm:'+ip;
  const lock=lockState(key);
  if(lock.locked)return NextResponse.json({error:`Cảnh báo bảo mật: nhập sai passkey quá nhiều lần. Vui lòng thử lại sau ${waitText(lock.retryAfter)}.`,retryAfter:lock.retryAfter},{status:429,headers:{'Retry-After':String(lock.retryAfter)}});
  let body:{passkey?:unknown};try{body=await req.json();}catch{return NextResponse.json({error:'Dữ liệu không hợp lệ.'},{status:400});}
  const input=typeof body.passkey==='string'?body.passkey.slice(0,200):'';
  if(!input||!passkeyOk(input)){
    const f=recordFail(key);
    await auditLog('security','bm_passkey_failed',{ip,locked:f.locked,ua:(req.headers.get('user-agent')||'').slice(0,120)});
    if(f.locked)return NextResponse.json({error:`Cảnh báo bảo mật: nhập sai passkey quá nhiều lần. Thư mục bị tạm khóa ${waitText(f.retryAfter)}.`,retryAfter:f.retryAfter},{status:429,headers:{'Retry-After':String(f.retryAfter)}});
    return NextResponse.json({error:`Passkey không đúng. Còn ${f.remaining} lần thử trước khi bị tạm khóa.`,remaining:f.remaining},{status:401});
  }
  recordSuccess(key);
  await auditLog('security','bm_unlocked',{ip,defaultPasskey:usingDefaultPasskey()});
  const res=NextResponse.json({ok:true});
  res.cookies.set(GATE_COOKIE,makeGateToken(secret),gateCookieOptions());
  return res;
}
export async function DELETE(){
  const res=NextResponse.json({ok:true});
  res.cookies.set(GATE_COOKIE,'',{...gateCookieOptions(),maxAge:0});
  return res;
}
