import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
// Cảnh báo & nhật ký bảo mật phía máy chủ: giới hạn số lần thử sai, ghi log sự kiện đáng ngờ.
export function clientIp(req:Request):string{
  const xf=req.headers.get('x-forwarded-for');
  return (xf?xf.split(',')[0].trim():req.headers.get('x-real-ip')||'unknown').slice(0,64)||'unknown';
}
export function safeEqual(a:string,b:string):boolean{
  const ha=crypto.createHash('sha256').update(a).digest(),hb=crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha,hb);
}
type Bucket={fails:number[];lockedUntil:number};
const g=globalThis as unknown as {__qmsBuckets?:Map<string,Bucket>};
const buckets=g.__qmsBuckets??(g.__qmsBuckets=new Map<string,Bucket>());
const MAX_FAILS=5,WINDOW_MS=10*60*1000,LOCK_MS=5*60*1000;
export function lockState(key:string):{locked:boolean;retryAfter:number}{
  const b=buckets.get(key);const now=Date.now();
  if(b&&b.lockedUntil>now)return {locked:true,retryAfter:Math.ceil((b.lockedUntil-now)/1000)};
  return {locked:false,retryAfter:0};
}
export function recordFail(key:string):{locked:boolean;retryAfter:number;remaining:number}{
  const now=Date.now();const b=buckets.get(key)??{fails:[],lockedUntil:0};
  b.fails=b.fails.filter(t=>now-t<WINDOW_MS);b.fails.push(now);
  if(b.fails.length>=MAX_FAILS){b.lockedUntil=now+LOCK_MS;b.fails=[];}
  buckets.set(key,b);
  const locked=b.lockedUntil>now;
  return {locked,retryAfter:locked?Math.ceil((b.lockedUntil-now)/1000):0,remaining:Math.max(0,MAX_FAILS-b.fails.length)};
}
export function recordSuccess(key:string){buckets.delete(key);}
export const waitText=(s:number)=>s>=60?`${Math.ceil(s/60)} phút`:`${s} giây`;
const logDir=()=>process.env.QMS_DATA_DIR?path.resolve(process.env.QMS_DATA_DIR,'..'):path.join(process.cwd(),'.data');
// Ghi một dòng JSON vào .data/<file>; không bao giờ ném lỗi (máy chủ chỉ đọc vẫn chạy bình thường).
export async function auditLog(kind:'security'|'data',event:string,detail:Record<string,unknown>={}){
  const line=JSON.stringify({time:new Date().toISOString(),event,...detail});
  if(kind==='security')console.warn('[QMS-SECURITY]',line);
  try{
    const dir=logDir();await fs.mkdir(dir,{recursive:true});
    const file=path.join(dir,kind==='security'?'security.log':'data-events.log');
    try{const st=await fs.stat(file);if(st.size>1_000_000)await fs.rename(file,file+'.1');}catch{}
    await fs.appendFile(file,line+'\n','utf8');
  }catch{}
}
