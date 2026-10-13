import fs from 'node:fs';
import path from 'node:path';

export type Doc = { id:string; title:string; path:string; chapter:string; category:string; ext:string; size:number; updatedAt:string; counterpart?:string };
const root = path.join(process.cwd(),'public','2429.2026');
const exts = new Set(['.docx','.pdf','.xlsx','.jpg','.jpeg','.png']);
// Decode filenames that were escaped as #UXXXX after a CP437/UTF-8 ZIP-name mismatch.
const CP437_HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
function decodeLegacy(s:string):string {
  if (!/#U[0-9a-f]{4}/i.test(s)) return s;
  const escaped=s.replace(/#U([0-9a-f]{4})/ig,(_,hex:string)=>String.fromCharCode(parseInt(hex,16)));
  const bytes:number[]=[];
  for(const ch of escaped){
    const code=ch.charCodeAt(0);
    if(code<128){bytes.push(code);continue;}
    const idx=CP437_HIGH.indexOf(ch);
    if(idx>=0){bytes.push(idx+128);continue;}
    // Keep genuine Unicode characters intact if they are not part of the legacy CP437 sequence.
    const encoded=Buffer.from(ch,'utf8'); for(const b of encoded) bytes.push(b);
  }
  try { return Buffer.from(bytes).toString('utf8').replace(/�/g,''); } catch { return escaped; }
}
const human = (s:string) => decodeLegacy(s).replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
export function getDocuments():Doc[]{
  const out:Doc[]=[];
  function walk(dir:string, rel:string){
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      const abs=path.join(dir,e.name), r=path.join(rel,e.name);
      if(e.isDirectory()) walk(abs,r); else if(exts.has(path.extname(e.name).toLowerCase())){
        const st=fs.statSync(abs), parts=r.split(path.sep);
        const chapter=decodeLegacy(parts[0]||'Tài liệu'); const category=parts.length>2?decodeLegacy(parts[1]):'';
        const ext=path.extname(e.name).slice(1).toUpperCase();
        const siblingExt=ext==='DOCX'?'.pdf':ext==='PDF'?'.docx':null;
        const sibling=siblingExt?path.join(dir,path.basename(e.name,path.extname(e.name))+siblingExt):'';
        const counterpart=sibling&&fs.existsSync(sibling)?'/2429.2026/'+path.relative(root,sibling).split(path.sep).map(encodeURIComponent).join('/'):undefined;
        out.push({id:Buffer.from(r).toString('base64url'),title:human(path.basename(e.name,path.extname(e.name))),path:'/2429.2026/'+r.split(path.sep).map(encodeURIComponent).join('/'),chapter,category,ext,size:st.size,updatedAt:st.mtime.toISOString(),counterpart});
      }
    }
  }
  walk(root,''); return out.sort((a,b)=>a.path.localeCompare(b.path,'vi'));
}
