import {NextRequest,NextResponse} from 'next/server';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {isGatedName} from '@/lib/gate';
import {hasGate} from '@/lib/gateServer';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const TYPES:Record<string,string>={'.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.pdf':'application/pdf','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png'};
// Phục vụ tệp tài liệu đọc trực tiếp từ ổ đĩa (next.config.ts chuyển hướng /2429.2026/* về đây khi tệp không nằm trong
// danh sách public lúc build) nên tệp mới thêm vào hoặc vừa được thay hiển thị ngay, không cần build lại.
export async function GET(req:NextRequest,ctx:{params:Promise<{path:string[]}>}){
  const {path:segs}=await ctx.params;
  const root=path.join(process.cwd(),'public','2429.2026');
  const parts=(segs||[]).map(s=>{try{return decodeURIComponent(s)}catch{return s}});
  const abs=path.resolve(root,...parts);
  if(!abs.startsWith(root+path.sep)||parts.some(p=>p==='..'))return new NextResponse('Not found',{status:404});
  if(parts.some(isGatedName)&&!hasGate(req))return new NextResponse('Thư mục này được bảo vệ bằng passkey.',{status:403});
  const type=TYPES[path.extname(abs).toLowerCase()];
  if(!type)return new NextResponse('Not found',{status:404});
  let st;try{st=await fsp.stat(abs);if(!st.isFile())throw new Error('x');}catch{return new NextResponse('Not found',{status:404});}
  const headers:Record<string,string>={'Content-Type':type,'Cache-Control':'no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};
  const range=req.headers.get('range');const m=range&&/^bytes=(\d*)-(\d*)$/.exec(range);
  if(m&&(m[1]||m[2])){
    let start=m[1]?parseInt(m[1],10):Math.max(0,st.size-parseInt(m[2],10)),end=m[1]&&m[2]?parseInt(m[2],10):st.size-1;
    end=Math.min(end,st.size-1);
    if(start>end||start>=st.size)return new NextResponse(null,{status:416,headers:{'Content-Range':`bytes */${st.size}`}});
    return new NextResponse(Readable.toWeb(fs.createReadStream(abs,{start,end})) as unknown as ReadableStream,{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${st.size}`,'Content-Length':String(end-start+1)}});
  }
  return new NextResponse(Readable.toWeb(fs.createReadStream(abs)) as unknown as ReadableStream,{status:200,headers:{...headers,'Content-Length':String(st.size)}});
}
