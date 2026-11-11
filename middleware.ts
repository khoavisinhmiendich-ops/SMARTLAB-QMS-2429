import { NextRequest, NextResponse } from 'next/server';
import { GATE_COOKIE, isGatedName, isGatedRelPath } from './lib/gate';
async function validSession(token:string|undefined,secret:string|undefined,prefix=''){
 if(!token||!secret)return false; const dot=token.indexOf('.');if(dot<1)return false;const exp=token.slice(0,dot),sig=token.slice(dot+1);if(!/^\d+$/.test(exp)||Number(exp)<=Date.now()||!sig)return false;
 try{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);const bytes=Uint8Array.from(atob(sig.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(sig.length/4)*4,'=')),c=>c.charCodeAt(0));return await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(prefix+exp));}catch{return false}
}
// Thư mục "Các BM khác" cần thêm passkey (cookie qms_bm): chặn cả tệp tĩnh lẫn trang chi tiết tài liệu.
function relFromId(id:string){try{const b=atob(id.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(id.length/4)*4,'='));return new TextDecoder().decode(Uint8Array.from(b,c=>c.charCodeAt(0)))}catch{return ''}}
function needsGate(p:string){
 try{
  const segs=p.split('/').filter(Boolean).map(decodeURIComponent);
  if(segs[0]==='2429.2026')return segs.slice(1).some(isGatedName);
  if(segs[0]==='api'&&segs[1]==='files'&&segs[2]==='get')return segs.slice(3).some(isGatedName);
  if(segs[0]==='documents'&&segs[1])return isGatedRelPath(relFromId(segs[1]));
  return false;
 }catch{return p.startsWith('/2429.2026')||p.startsWith('/documents/')}
}
export async function middleware(req:NextRequest){
 const p=req.nextUrl.pathname;
 // Lịch tự động sao lưu Drive: chỉ riêng đường dẫn này, và chỉ khi có mật khẩu bí mật hợp lệ (API tự kiểm tra lại lần nữa).
 if(p==='/api/drive/cron'&&process.env.CRON_SECRET&&(req.headers.get('authorization')||'')==='Bearer '+process.env.CRON_SECRET)return NextResponse.next();
 // Google chuyển hướng về đây từ trang khác (cookie đăng nhập SameSite=Strict không được gửi kèm): route tự xác thực bằng chuỗi state đã ký (15 phút), không có state hợp lệ thì không làm gì.
 if(p==='/api/drive/callback'&&req.nextUrl.searchParams.has('state'))return NextResponse.next();
 if(p==='/privacy.html')return NextResponse.next();
 // Tài nguyên công khai để cài ứng dụng (PWA) và hiển thị màn hình khóa: manifest, service worker, icon, font.
 if(p==='/manifest.webmanifest'||p==='/sw.js'||p==='/favicon.ico'||p.startsWith('/icon/')||p.startsWith('/fonts/'))return NextResponse.next();
 if(p==='/login'||p==='/api/auth/login'||p==='/api/auth/logout'||p.startsWith('/_next/')||p==='/favicon.ico'||p==='/robots.txt')return NextResponse.next();
 if(await validSession(req.cookies.get('qms_session')?.value,process.env.QMS_AUTH_SECRET)){
  if(needsGate(p)&&!(await validSession(req.cookies.get(GATE_COOKIE)?.value,process.env.QMS_AUTH_SECRET,'bm.'))){
   if(p.startsWith('/documents/'))return NextResponse.redirect(new URL('/',req.url));
   return new NextResponse('Thư mục này được bảo vệ bằng passkey.',{status:403});
  }
  return NextResponse.next();
 }
 const url=new URL('/login',req.url);if(p!=='/')url.searchParams.set('next',p+req.nextUrl.search);return NextResponse.redirect(url);
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
