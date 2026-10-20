import crypto from 'node:crypto';
import type {NextRequest} from 'next/server';
import {GATE_COOKIE,GATE_TTL_SECONDS,isGatedRelPath} from './gate';
// Passkey mặc định được lưu dạng băm scrypt (không có mật khẩu dạng chữ trong mã nguồn).
// Đổi passkey: đặt biến môi trường QMS_BM_PASSKEY (trong .env.local / Vercel) rồi chạy lại.
const SALT='smartlab-qms-bm-gate-v1';
const DEFAULT_HASH='518567bcd4c1da050d27759d859584d3c1ac24938a9c7a3b5c08aaf6b95c1a39';
export const usingDefaultPasskey=()=>!(process.env.QMS_BM_PASSKEY||'').trim();
export function passkeyOk(input:string):boolean{
  const envKey=(process.env.QMS_BM_PASSKEY||'').trim();
  const expected=envKey?crypto.scryptSync(envKey,SALT,32):Buffer.from(DEFAULT_HASH,'hex');
  return crypto.timingSafeEqual(expected,crypto.scryptSync(input,SALT,32));
}
const sign=(secret:string,exp:string)=>crypto.createHmac('sha256',secret).update('bm.'+exp).digest('base64url');
export function makeGateToken(secret:string):string{
  const exp=String(Date.now()+GATE_TTL_SECONDS*1000);return `${exp}.${sign(secret,exp)}`;
}
export function gateTokenValid(token:string|undefined):boolean{
  const secret=process.env.QMS_AUTH_SECRET;if(!token||!secret)return false;
  const dot=token.indexOf('.');if(dot<1)return false;
  const exp=token.slice(0,dot),sig=token.slice(dot+1);
  if(!/^\d+$/.test(exp)||Number(exp)<=Date.now()||!sig)return false;
  const a=Buffer.from(sig),b=Buffer.from(sign(secret,exp));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
export const hasGate=(req:NextRequest)=>gateTokenValid(req.cookies.get(GATE_COOKIE)?.value);
export function relFromDocumentId(id:string):string{
  try{return Buffer.from(id,'base64url').toString('utf8');}catch{return '';}
}
export const isGatedDocumentId=(id:string)=>isGatedRelPath(relFromDocumentId(id));
export const gateCookieOptions=()=>({httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/',maxAge:GATE_TTL_SECONDS});
