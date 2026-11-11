import crypto from 'node:crypto';
import type {NextRequest} from 'next/server';
import {CRIT_COOKIE,GATE_TTL_SECONDS} from './gate';
// Passkey của mục "Chấm điểm tiêu chí" được lưu dạng băm scrypt (không có mật khẩu dạng chữ trong mã nguồn).
// Đổi passkey: đặt biến môi trường QMS_CRIT_PASSKEY (trong .env.local / Vercel) rồi chạy lại.
const SALT='smartlab-qms-crit-gate-v1';
const DEFAULT_HASH='4e6fb47810ee4fa5f380eba56c7eede7773a3cb069c8f4796dc0b0abdcc52a87';
export const usingDefaultCritPasskey=()=>!(process.env.QMS_CRIT_PASSKEY||'').trim();
export function critPasskeyOk(input:string):boolean{
  const envKey=(process.env.QMS_CRIT_PASSKEY||'').trim();
  const expected=envKey?crypto.scryptSync(envKey,SALT,32):Buffer.from(DEFAULT_HASH,'hex');
  return crypto.timingSafeEqual(expected,crypto.scryptSync(input,SALT,32));
}
const sign=(secret:string,exp:string)=>crypto.createHmac('sha256',secret).update('crit.'+exp).digest('base64url');
export function makeCritToken(secret:string):string{
  const exp=String(Date.now()+GATE_TTL_SECONDS*1000);return `${exp}.${sign(secret,exp)}`;
}
export function critTokenValid(token:string|undefined):boolean{
  const secret=process.env.QMS_AUTH_SECRET;if(!token||!secret)return false;
  const dot=token.indexOf('.');if(dot<1)return false;
  const exp=token.slice(0,dot),sig=token.slice(dot+1);
  if(!/^\d+$/.test(exp)||Number(exp)<=Date.now()||!sig)return false;
  const a=Buffer.from(sig),b=Buffer.from(sign(secret,exp));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
export const hasCritGate=(req:NextRequest)=>critTokenValid(req.cookies.get(CRIT_COOKIE)?.value);
export const critCookieOptions=()=>({httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/',maxAge:GATE_TTL_SECONDS});
