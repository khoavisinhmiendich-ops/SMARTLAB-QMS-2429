import { NextRequest, NextResponse } from 'next/server';
async function validSession(token:string|undefined,secret:string|undefined){
 if(!token||!secret)return false; const dot=token.indexOf('.');if(dot<1)return false;const exp=token.slice(0,dot),sig=token.slice(dot+1);if(!/^\d+$/.test(exp)||Number(exp)<=Date.now()||!sig)return false;
 try{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);const bytes=Uint8Array.from(atob(sig.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(sig.length/4)*4,'=')),c=>c.charCodeAt(0));return await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(exp));}catch{return false}
}
export async function middleware(req:NextRequest){
 const p=req.nextUrl.pathname;
 if(p==='/login'||p==='/api/auth/login'||p==='/api/auth/logout'||p.startsWith('/_next/')||p==='/favicon.ico'||p==='/robots.txt')return NextResponse.next();
 if(await validSession(req.cookies.get('qms_session')?.value,process.env.QMS_AUTH_SECRET))return NextResponse.next();
 const url=new URL('/login',req.url);if(p!=='/')url.searchParams.set('next',p+req.nextUrl.search);return NextResponse.redirect(url);
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
