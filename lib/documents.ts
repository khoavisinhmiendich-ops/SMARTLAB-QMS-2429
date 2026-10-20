import fs from 'node:fs';
import path from 'node:path';

export type Doc = { id:string; title:string; path:string; chapter:string; category:string; ext:string; size:number; updatedAt:string; counterpart?:string; replacedAt?:number };
const root = path.join(process.cwd(),'public','2429.2026');
const exts = new Set(['.docx','.pdf','.xlsx','.jpg','.jpeg','.png']);
// Decode filenames that were escaped as #UXXXX after a CP437/UTF-8 ZIP-name mismatch.
const CP437_HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
// Chapter folders must all read like "3. CHƯƠNG III. ..." (one folder was stored as "Chương III"). Display only: ids/paths are untouched.
function normalizeChapter(s:string):string {
  const t=s.normalize('NFC');
  if(!/^\s*\d+\s*\.\s*chương(\s|\.|$)/i.test(t))return t;
  // "CHƯƠNG I TỔ CHỨC..." -> "CHƯƠNG I. TỔ CHỨC..." (thiếu dấu chấm sau số La Mã). Chỉ đổi hiển thị.
  return t.toLocaleUpperCase('vi').replace(/^(\s*\d+\s*\.\s*CHƯƠNG\s+[IVXL]+)\s+(?=[^\s.])/,'$1. ');
}
function decodeLegacy(s:string):string {
  if (!/#U[0-9a-f]{4}/i.test(s)) return s.normalize('NFC');
  const escaped=s.replace(/#U([0-9a-f]{4})/ig,(_,hex:string)=>String.fromCharCode(parseInt(hex,16)));
  // Only treat the text as CP437 mojibake when EVERY non-ASCII char is a CP437 char AND the resulting
  // bytes form valid UTF-8. Otherwise the escapes are already real Unicode (e.g. ì, à, á, é, ế) and must be kept as-is.
  const bytes:number[]=[]; let ok=true, high=false;
  for(const ch of escaped){
    const code=ch.charCodeAt(0);
    if(code<128){bytes.push(code);continue;}
    high=true; const idx=CP437_HIGH.indexOf(ch);
    if(idx<0){ok=false;break;}
    bytes.push(idx+128);
  }
  if(ok&&high){
    try { return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(bytes)).normalize('NFC'); } catch { /* not mojibake */ }
  }
  return escaped.normalize('NFC');
}
const human = (s:string) => decodeLegacy(s).replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
export function getDocuments(replaced:Record<string,number>={}):Doc[]{
  const out:Doc[]=[];
  function walk(dir:string, rel:string){
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      const abs=path.join(dir,e.name), r=path.join(rel,e.name);
      if(e.isDirectory()) walk(abs,r); else if(exts.has(path.extname(e.name).toLowerCase())){
        const st=fs.statSync(abs), parts=r.split(path.sep);
        const chapter=normalizeChapter(decodeLegacy(parts[0]||'Tài liệu')); const category=parts.length>2?decodeLegacy(parts[1]):'';
        const ext=path.extname(e.name).slice(1).toUpperCase();
        const siblingExt=ext==='DOCX'?'.pdf':ext==='PDF'?'.docx':null;
        const sibling=siblingExt?path.join(dir,path.basename(e.name,path.extname(e.name))+siblingExt):'';
        const counterpart=sibling&&fs.existsSync(sibling)?'/2429.2026/'+path.relative(root,sibling).split(path.sep).map(encodeURIComponent).join('/'):undefined;
        out.push({id:Buffer.from(r).toString('base64url'),title:human(path.basename(e.name,path.extname(e.name))),path:'/2429.2026/'+r.split(path.sep).map(encodeURIComponent).join('/'),chapter,category,ext,size:st.size,updatedAt:st.mtime.toISOString(),counterpart,replacedAt:replaced[r.split(path.sep).join('/')]||undefined});
      }
    }
  }
  walk(root,''); return out.sort((a,b)=>a.path.localeCompare(b.path,'vi',{numeric:true}));
}
