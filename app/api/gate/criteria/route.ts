import {NextRequest,NextResponse} from 'next/server';
import {CRIT_COOKIE} from '@/lib/gate';
import {critCookieOptions,hasCritGate,makeCritToken,critPasskeyOk,usingDefaultCritPasskey} from '@/lib/critGate';
import {auditLog,clientIp,globalFail,globalLock,lockState,recordFail,recordSuccess,waitText} from '@/lib/security';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){return NextResponse.json({unlocked:hasCritGate(req)});}
export async function POST(req:NextRequest){
  const secret=process.env.QMS_AUTH_SECRET;
  if(!secret)return NextResponse.json({error:'Chưa cấu hình QMS_AUTH_SECRET nên chưa thể mở khóa mục chấm điểm.'},{status:503});
  const ip=clientIp(req),key='crit:'+ip;
  const lock=(()=>{const a=lockState(key),b=globalLock('crit');return b.locked&&b.retryAfter>a.retryAfter?b:a})();
  if(lock.locked)return NextResponse.json({error:`Cảnh báo bảo mật: nhập sai passkey quá nhiều lần. Vui lòng thử lại sau ${waitText(lock.retryAfter)}.`,retryAfter:lock.retryAfter},{status:429,headers:{'Retry-After':String(lock.retryAfter)}});
  let body:{passkey?:unknown};try{body=await req.json();}catch{return NextResponse.json({error:'Dữ liệu không hợp lệ.'},{status:400});}
  const input=typeof body.passkey==='string'?body.passkey.slice(0,200):'';
  if(!input||!critPasskeyOk(input)){
    const f=recordFail(key);const gf=globalFail('crit');if(gf.locked&&!f.locked){f.locked=true;f.retryAfter=gf.retryAfter;}
    await auditLog('security','crit_passkey_failed',{ip,locked:f.locked,ua:(req.headers.get('user-agent')||'').slice(0,120)});
    if(f.locked)return NextResponse.json({error:`Cảnh báo bảo mật: nhập sai passkey quá nhiều lần. Mục chấm điểm bị tạm khóa ${waitText(f.retryAfter)}.`,retryAfter:f.retryAfter},{status:429,headers:{'Retry-After':String(f.retryAfter)}});
    return NextResponse.json({error:`Passkey không đúng. Còn ${f.remaining} lần thử trước khi bị tạm khóa.`,remaining:f.remaining},{status:401});
  }
  recordSuccess(key);
  await auditLog('security','crit_unlocked',{ip,defaultPasskey:usingDefaultCritPasskey()});
  const res=NextResponse.json({ok:true});
  res.cookies.set(CRIT_COOKIE,makeCritToken(secret),critCookieOptions());
  return res;
}
export async function DELETE(){
  const res=NextResponse.json({ok:true});
  res.cookies.set(CRIT_COOKIE,'',{...critCookieOptions(),maxAge:0});
  return res;
}
