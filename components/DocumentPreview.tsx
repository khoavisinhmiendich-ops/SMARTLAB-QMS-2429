'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import {renderAsync} from 'docx-preview';
import * as XLSX from 'xlsx';
import {stashOriginalImages,restoreOriginalImages,healBrokenImages,fixAnchoredImages} from '@/lib/docImages';
import {fixDocxFidelity} from '@/lib/docFidelity';
import {renderDocxShapes,markGeneratedImages,docxPageInfo,markPageBreaks,docxTableInfo,type TableInfo} from '@/lib/docxShapes';
import {mountShapeHandles,selectShapeHandles} from '@/lib/shapeHandles';
import {loadXlsxInfo,decorateXlsxSheet,type XlsxInfo} from '@/lib/xlsxStyles';
import SheetBar from '@/components/SheetBar';
import {attachTableClipboard} from '@/lib/tableClipboard';
import {bindResizeDelegate,addHandles} from '@/lib/tableResize';

type Props={src:string;ext:string;title:string;counterpart?:string;editable?:boolean;savedContent?:string;onContentChange?:(value:string)=>void};
// ---- Excel helpers -------------------------------------------------------------------------
// Edited Excel content is stored per sheet: {"v":2,"sheets":{"<sheet name>":"<html>"}}.
// Older saves (a single HTML string) are mapped to the first sheet only.
function readSavedOrient(saved:string):Record<string,'portrait'|'landscape'>{
  try{const o=JSON.parse(saved);if(o&&o.v===2&&o.orient&&typeof o.orient==='object')return o.orient;}catch{}
  return {};
}
function readSavedSheets(saved:string,firstSheet:string):Record<string,string>{
  if(!saved)return {};
  try{const o=JSON.parse(saved);if(o&&typeof o==='object'&&o.v===2&&o.sheets&&typeof o.sheets==='object')return o.sheets as Record<string,string>;}catch{}
  return firstSheet?{[firstSheet]:saved}:{};
}
// Tên + thứ tự hiện tại của các trang tính (đã đổi tên / thêm / xóa / kéo đổi vị trí) và trang tính gốc của từng tên.
function readSavedLayout(saved:string):{names?:string[];origin?:Record<string,string>}{
  try{const o=JSON.parse(saved);if(o&&typeof o==='object'&&o.v===2){
    const names=Array.isArray(o.names)?(o.names as unknown[]).filter((x):x is string=>typeof x==='string'&&!!x):[];
    const origin=o.origin&&typeof o.origin==='object'&&!Array.isArray(o.origin)?o.origin as Record<string,string>:undefined;
    return {names:names.length?Array.from(new Set(names)):undefined,origin};
  }}catch{}
  return {};
}
function renameKey<T>(o:Record<string,T>,from:string,to:string):Record<string,T>{
  if(!Object.prototype.hasOwnProperty.call(o,from))return o;
  const r:Record<string,T>={};for(const k of Object.keys(o))r[k===from?to:k]=o[k];return r;
}
function omitKey<T>(o:Record<string,T>,key:string):Record<string,T>{
  if(!Object.prototype.hasOwnProperty.call(o,key))return o;
  const r:Record<string,T>={};for(const k of Object.keys(o))if(k!==key)r[k]=o[k];return r;
}
const BLANK_SHEET_REF='A1:Z60'; // trang tính mới: lưới trống 26 cột x 60 hàng
// Column index (0-based) of a cell inside its table, taking row/column spans into account.
function gridColOf(cell:HTMLTableCellElement):number{
  const table=cell.closest('table');if(!table)return -1;
  const rows=Array.from(table.rows);const occ:boolean[][]=[];
  for(let r=0;r<rows.length;r++){
    occ[r]=occ[r]||[];let col=0;
    for(const td of Array.from(rows[r].cells)){
      while(occ[r][col])col++;
      const rs=td.rowSpan||1,cs=td.colSpan||1;
      if(td===cell)return col;
      for(let i=0;i<rs;i++){occ[r+i]=occ[r+i]||[];for(let j=0;j<cs;j++)occ[r+i][col+j]=true;}
      col+=cs;
    }
  }
  return -1;
}
// Make the generated HTML table look like a real worksheet: exact column widths, row heights,
// fixed layout, merged cells (already emitted by sheet_to_html) and normal gridlines (see globals.css).
function decorateSheetTable(table:HTMLTableElement,ws:XLSX.WorkSheet){
  const ref=ws['!ref'];if(!ref)return;
  const rng=XLSX.utils.decode_range(ref);const nCols=rng.e.c-rng.s.c+1;
  const colInfo=(ws['!cols']||[]) as XLSX.ColInfo[];
  let total=0;const cg=document.createElement('colgroup');
  for(let i=0;i<nCols;i++){
    const info=colInfo[rng.s.c+i];let px=64;
    if(info){if(info.hidden)px=0;else if(typeof info.wpx==='number'&&info.wpx>0)px=Math.round(info.wpx);else if(typeof info.wch==='number'&&info.wch>0)px=Math.round(info.wch*7+5);}
    const col=document.createElement('col');col.style.width=px+'px';if(!px)col.style.visibility='collapse';
    total+=px;cg.appendChild(col);
  }
  table.insertBefore(cg,table.firstChild);
  table.dataset.qmsSheet='1';
  table.style.tableLayout='fixed';table.style.width=total+'px';table.style.minWidth='0';table.style.maxWidth='none';
  const rowInfo=(ws['!rows']||[]) as XLSX.RowInfo[];
  Array.from(table.rows).forEach((tr,i)=>{
    const info=rowInfo[rng.s.r+i];if(!info)return;
    if(info.hidden){tr.style.display='none';return;}
    const px=typeof info.hpx==='number'&&info.hpx>0?info.hpx:(typeof info.hpt==='number'&&info.hpt>0?Math.round(info.hpt*4/3):0);
    if(px)tr.style.height=px+'px';
  });
}
// ---- Table helpers (grid-aware: work with merged cells, Word tables and worksheet tables) ----------
type Grid={map:(HTMLTableCellElement|undefined)[][];start:Map<HTMLTableCellElement,{r:number;c:number}>;rows:HTMLTableRowElement[];cols:number};
function buildGrid(table:HTMLTableElement):Grid{
  const rows=Array.from(table.rows);const map:(HTMLTableCellElement|undefined)[][]=rows.map(()=>[]);
  const start=new Map<HTMLTableCellElement,{r:number;c:number}>();let cols=0;
  rows.forEach((tr,r)=>{let c=0;Array.from(tr.cells).forEach(td=>{
    while(map[r][c])c++;
    const rs=Math.max(1,td.rowSpan||1),cs=Math.max(1,td.colSpan||1);start.set(td,{r,c});
    for(let i=0;i<rs&&r+i<rows.length;i++)for(let j=0;j<cs;j++)map[r+i][c+j]=td;
    c+=cs;cols=Math.max(cols,c);
  });});
  return {map,start,rows,cols};
}
function newCell(from?:HTMLTableCellElement):HTMLTableCellElement{
  const nc=document.createElement('td');nc.innerHTML='&nbsp;';
  if(from){nc.style.cssText=from.style.cssText;nc.style.height='';}
  return nc;
}
function colgroupInsert(table:HTMLTableElement,gi:number){
  const cg=table.querySelector(':scope > colgroup');if(!cg)return;
  const cols=cg.querySelectorAll('col');const base=cols[gi] as HTMLElement|undefined;
  const nc=document.createElement('col');nc.style.width=(base&&base.style.width)||'64px';
  if(base)base.after(nc);else cg.appendChild(nc);
  if(table.dataset.qmsSheet==='1'){const w=parseFloat(nc.style.width)||64;table.style.width=((parseFloat(table.style.width)||0)+w)+'px';}
}
function colgroupRemove(table:HTMLTableElement,gi:number){
  const cg=table.querySelector(':scope > colgroup');if(!cg)return;
  const col=cg.querySelectorAll('col')[gi] as HTMLElement|undefined;if(!col)return;
  if(table.dataset.qmsSheet==='1'){const w=parseFloat(col.style.width)||0;table.style.width=Math.max(24,(parseFloat(table.style.width)||0)-w)+'px';}
  col.remove();
}
function insertRowAfter(table:HTMLTableElement,cell:HTMLTableCellElement){
  const g=buildGrid(table);const st=g.start.get(cell);if(!st)return;const r=st.r;const row=g.rows[r];
  const nr=document.createElement('tr');nr.style.cssText=row.style.cssText;
  let c=0;
  while(c<g.cols){
    const cv=g.map[r][c];
    if(!cv){nr.appendChild(newCell());c++;continue;}
    const s=g.start.get(cv)!;const span=Math.max(1,cv.colSpan||1);
    if(s.r+Math.max(1,cv.rowSpan||1)-1>r){if(s.c===c)cv.rowSpan=Math.max(1,cv.rowSpan||1)+1;}
    else{const nc=newCell(cv);if(span>1&&s.c===c)nc.colSpan=span;nr.appendChild(nc);}
    c=s.c===c?c+span:c+1;
  }
  row.after(nr);
}
function deleteRowOf(table:HTMLTableElement,cell:HTMLTableCellElement):boolean{
  const g=buildGrid(table);if(g.rows.length<=1)return false;const st=g.start.get(cell);if(!st)return false;
  const r=st.r;const row=g.rows[r];const seen=new Set<HTMLTableCellElement>();
  for(let c=0;c<g.cols;c++){
    const cv=g.map[r][c];if(!cv||seen.has(cv))continue;seen.add(cv);
    const s=g.start.get(cv)!;const rs=Math.max(1,cv.rowSpan||1);
    if(s.r<r){cv.rowSpan=rs-1;}
    else if(rs>1){
      const next=g.rows[r+1];
      if(next){
        cv.rowSpan=rs-1;let ref:HTMLTableCellElement|null=null;
        for(const td of Array.from(next.cells)){const ts=g.start.get(td);if(ts&&ts.c<s.c)ref=td;}
        if(ref)ref.after(cv);else next.insertBefore(cv,next.firstChild);
      }
    }
  }
  row.remove();return true;
}
function insertColumnAfter(table:HTMLTableElement,cell:HTMLTableCellElement){
  const g=buildGrid(table);const st=g.start.get(cell);if(!st)return;
  const gi=st.c+Math.max(1,cell.colSpan||1)-1;const done=new Set<HTMLTableCellElement>();
  g.rows.forEach((tr,r)=>{
    const covering=g.map[r][gi];
    if(covering){
      const s=g.start.get(covering)!;const end=s.c+Math.max(1,covering.colSpan||1)-1;
      if(end>gi){if(!done.has(covering)){covering.colSpan=Math.max(1,covering.colSpan||1)+1;done.add(covering);}return;}
    }
    let ref:HTMLTableCellElement|null=null;
    for(const td of Array.from(tr.cells)){const s=g.start.get(td);if(s&&s.c+Math.max(1,td.colSpan||1)-1<=gi)ref=td;}
    const nc=newCell(covering||ref||undefined);nc.rowSpan=1;nc.colSpan=1;
    if(ref)ref.after(nc);else tr.insertBefore(nc,tr.firstChild);
  });
  colgroupInsert(table,gi);
}
function deleteColumnOf(table:HTMLTableElement,cell:HTMLTableCellElement):boolean{
  const g=buildGrid(table);const st=g.start.get(cell);if(!st||g.cols<=1)return false;
  const ci=st.c;const seen=new Set<HTMLTableCellElement>();
  g.rows.forEach((_,r)=>{
    const cv=g.map[r][ci];if(!cv||seen.has(cv))return;seen.add(cv);
    if(Math.max(1,cv.colSpan||1)>1)cv.colSpan=cv.colSpan-1;else cv.remove();
  });
  colgroupRemove(table,ci);return true;
}
function hasContent(el:HTMLElement):boolean{
  return (el.textContent||'').replace(/[\u200b\u00a0\s]/g,'').length>0||!!el.querySelector('img,svg,table');
}
// Merge a cell with its right neighbour. Returns an error message, or '' on success.
function mergeRight(cell:HTMLTableCellElement):string{
  const table=cell.closest('table') as HTMLTableElement|null;if(!table)return 'Không xác định được bảng.';
  const g=buildGrid(table);const st=g.start.get(cell);if(!st)return 'Không xác định được ô.';
  const next=g.map[st.r][st.c+Math.max(1,cell.colSpan||1)];
  if(!next)return 'Không có ô bên phải để gộp.';
  const ns=g.start.get(next)!;
  if(ns.r!==st.r||Math.max(1,next.rowSpan||1)!==Math.max(1,cell.rowSpan||1))return 'Hai ô có chiều cao gộp khác nhau nên không thể gộp ngang.';
  const clone=next.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.cell-resize-handle,.row-resize-handle').forEach(x=>x.remove());
  if(hasContent(clone))cell.insertAdjacentHTML('beforeend',(hasContent(cell)?' ':'')+clone.innerHTML);
  cell.colSpan=Math.max(1,cell.colSpan||1)+Math.max(1,next.colSpan||1);next.remove();return '';
}
function unmergeCell(cell:HTMLTableCellElement):boolean{
  const rs=Math.max(1,cell.rowSpan||1),cs=Math.max(1,cell.colSpan||1);if(rs<2&&cs<2)return false;
  const table=cell.closest('table') as HTMLTableElement|null;if(!table)return false;
  const g=buildGrid(table);const st=g.start.get(cell);if(!st)return false;
  cell.colSpan=1;cell.rowSpan=1;const extra=new Map<HTMLTableCellElement,number>();
  const colOf=(td:HTMLTableCellElement)=>g.start.get(td)?.c??extra.get(td)??-1;
  for(let r=st.r;r<st.r+rs&&r<g.rows.length;r++){
    const tr=g.rows[r];
    for(let c=st.c;c<st.c+cs;c++){
      if(r===st.r&&c===st.c)continue;
      const nc=newCell(cell);nc.colSpan=1;nc.rowSpan=1;
      let ref:HTMLTableCellElement|null=null;
      for(const td of Array.from(tr.cells)){if(colOf(td)<c&&colOf(td)>=0)ref=td;}
      if(ref)ref.after(nc);else tr.insertBefore(nc,tr.firstChild);
      extra.set(nc,c);
    }
  }
  return true;
}
function detectOrient(root:HTMLElement):'portrait'|'landscape'|null{
  const sec=root.querySelector('section') as HTMLElement|null;if(!sec)return null;
  const w=parseFloat(sec.style.width),h=parseFloat(sec.style.minHeight||sec.style.height);
  if(!isFinite(w)||!isFinite(h))return null;
  return w>h?'landscape':'portrait';
}
// Empty table cells (e.g. blank months in the temperature logs) have no line box, so the caret cannot be placed
// and typing does nothing. Give every empty cell a <br> so it always has an editable line.
function ensureCaretAnchors(root:HTMLElement){
  root.querySelectorAll('td,th').forEach(cell=>{
    const c=cell as HTMLElement;
    if(c.querySelector(':scope > .cell-resize-handle,:scope > .row-resize-handle'))return;
    const hasText=(c.textContent||'').replace(/[\u200b\s]/g,'').length>0;
    if(hasText||c.querySelector('br,img,svg,table'))return;
    const block=c.querySelector(':scope > p,:scope > div');
    if(block)block.appendChild(document.createElement('br'));else c.insertBefore(document.createElement('br'),c.firstChild);
  });
}
// Cố định lưới cột của bảng Word khi chỉnh sửa: gõ/sửa chữ ở một ô không làm các cột/ô khác trong hàng bị co giãn theo (mỗi cột có độ rộng riêng, chữ dài tự xuống dòng trong ô).
function freezeTables(root:HTMLElement){
  root.querySelectorAll('table:not([data-qms-sheet="1"])').forEach(t=>{
    const table=t as HTMLTableElement;
    if(table.dataset.qmsFrozen==='1'||table.parentElement?.closest('table'))return;
    const rows=Array.from(table.rows);if(!rows.length)return;
    const occ:boolean[][]=[];const pos=new Map<HTMLTableCellElement,number>();let ncols=0;
    rows.forEach((row,r)=>{occ[r]=occ[r]||[];let col=0;Array.from(row.cells).forEach(td=>{while(occ[r][col])col++;pos.set(td,col);const cs=td.colSpan||1,rs=td.rowSpan||1;for(let dr=0;dr<rs;dr++){occ[r+dr]=occ[r+dr]||[];for(let dc=0;dc<cs;dc++)occ[r+dr][col+dc]=true;}col+=cs;ncols=Math.max(ncols,col);});});
    if(!ncols)return;
    const w:(number|undefined)[]=new Array(ncols).fill(undefined);
    pos.forEach((gc,td)=>{if((td.colSpan||1)===1&&td.offsetWidth>0&&w[gc]===undefined)w[gc]=td.offsetWidth;});
    pos.forEach((gc,td)=>{const cs=td.colSpan||1;if(cs<2||!td.offsetWidth)return;const idx=Array.from({length:cs},(_,i)=>gc+i);const unknown=idx.filter(i=>w[i]===undefined);if(!unknown.length)return;const known=idx.reduce((a,i)=>a+(w[i]||0),0);const each=Math.max(24,(td.offsetWidth-known)/unknown.length);unknown.forEach(i=>{w[i]=each;});});
    const widths=w.map(x=>Math.max(24,Math.round(x||60)));
    table.querySelectorAll(':scope > colgroup').forEach(x=>x.remove());
    const cg=document.createElement('colgroup');widths.forEach(x=>{const c=document.createElement('col');c.style.width=x+'px';cg.appendChild(c);});
    table.insertBefore(cg,table.firstChild);
    table.style.tableLayout='fixed';table.style.width=widths.reduce((a,b)=>a+b,0)+'px';table.style.maxWidth='none';
    rows.forEach(row=>Array.from(row.cells).forEach(td=>{td.style.width='';td.style.minWidth='';td.style.overflowWrap='anywhere';}));
    table.dataset.qmsFrozen='1';
  });
}
// Bảng nổi (w:tblpPr) gần kín bề ngang trang: bản đã lưu từ trước vẫn giữ dạng "float: left" làm chữ bị ép sang bên cạnh và bảng tràn mép phải.
// Đổi lại thành bảng thường căn giữa (giống lúc dựng mới từ tệp gốc). Chạy lặp lại không ảnh hưởng.
function repairFloatTables(root:HTMLElement){
  root.querySelectorAll('article table').forEach(t=>{
    const table=t as HTMLTableElement;
    if(table.parentElement?.closest('table'))return;
    if(getComputedStyle(table).float!=='left')return;
    const sec=table.closest('section') as HTMLElement|null;if(!sec)return;
    const cs=getComputedStyle(sec);
    const contentW=sec.clientWidth-(parseFloat(cs.paddingLeft)||0)-(parseFloat(cs.paddingRight)||0);
    if(!(contentW>0)||table.offsetWidth<contentW*0.85)return;
    table.style.cssFloat='none';table.style.marginLeft='auto';table.style.marginRight='auto';
  });
}
// Số trang ở chân trang ("Trang: 2/4"): tệp Word chỉ lưu sẵn giá trị lúc lưu (hoặc đánh số lại từ phần thân nên lệch so với số trang thật).
// Đánh số theo vị trí thật của trang: trang đầu 1, trang kế 2, ... trang cuối = tổng số trang. Phần "/tổng" giữ nguyên, chỉ nâng lên khi số trang hiển thị nhiều hơn.
function fixPageNumbers(root:HTMLElement){
  const pages=Array.from(root.querySelectorAll('section')).filter(x=>!x.parentElement?.closest('section'));
  if(pages.length<2)return;
  const rows=pages.map((sec,i)=>{
    const ft=Array.from(sec.children).find(c=>c.tagName==='FOOTER');if(!ft)return null;
    const nodes:Text[]=[];const w=document.createTreeWalker(ft,NodeFilter.SHOW_TEXT);let n:Node|null;while((n=w.nextNode()))nodes.push(n as Text);
    const text=nodes.map(x=>x.data).join('');
    const m=/(Trang|Page)\s*:?\s*(\d+)(\s*\/\s*)?(\d+)?/i.exec(text);if(!m)return null;
    return{i,nodes,m};
  });
  const found=rows.filter(Boolean) as {i:number;nodes:Text[];m:RegExpExecArray}[];
  if(!found.length)return;
  const setRange=(nodes:Text[],from:number,to:number,val:string)=>{
    let pos=0,done=false;const starts=nodes.map(nd=>{const p0=pos;pos+=nd.data.length;return p0;});
    nodes.forEach((nd,k)=>{const len=nd.data.length,a=Math.max(from,starts[k]),b=Math.min(to,starts[k]+len);if(a<b){nd.data=nd.data.slice(0,a-starts[k])+(done?'':val)+nd.data.slice(b-starts[k]);done=true;}});
  };
  const maxDen=Math.max(0,...found.map(x=>Number(x.m[4]||0)));
  const total=Math.max(maxDen,pages.length);
  found.forEach(({i,nodes,m})=>{
    const off=m.index+m[0].search(/\d/);
    if(m[4]&&total!==Number(m[4])){const ds=off+m[2].length+(m[3]?.length||0);setRange(nodes,ds,ds+m[4].length,String(total));}
    if(String(i+1)!==m[2])setRange(nodes,off,off+m[2].length,String(i+1));
  });
}
// ===== Bảng rộng: dựng lại đúng lưới cột của Word và đảm bảo lọt trong trang =====
// Trình duyệt buộc mỗi cột phải rộng ít nhất bằng chữ + lề ô nên bảng nhiều cột hẹp (vd. 31 cột ngày) phình rộng hơn Word và tràn mép phải trang.
function tableGrid(table:HTMLTableElement){
  const rows=Array.from(table.rows);const occ:boolean[][]=[];const pos=new Map<HTMLTableCellElement,number>();let ncols=0;
  rows.forEach((row,r)=>{occ[r]=occ[r]||[];let col=0;Array.from(row.cells).forEach(td=>{while(occ[r][col])col++;pos.set(td,col);const cs=td.colSpan||1,rs=td.rowSpan||1;for(let dr=0;dr<rs;dr++){occ[r+dr]=occ[r+dr]||[];for(let dc=0;dc<cs;dc++)occ[r+dr][col+dc]=true;}col+=cs;ncols=Math.max(ncols,col);});});
  return{rows,pos,ncols};
}
function fitTablesToPage(root:HTMLElement,infos:TableInfo[]){
  const tables=(Array.from(root.querySelectorAll('article table')) as HTMLTableElement[]).filter(t=>!t.parentElement?.closest('table'));
  const useXml=infos.length===tables.length;
  tables.forEach((table,i)=>{
    const sec=table.closest('section') as HTMLElement|null;if(!sec)return;
    const{pos,ncols}=tableGrid(table);if(!ncols)return;
    const info=useXml?infos[i]:undefined;const xmlOk=!!info&&info.grid.length===ncols&&info.grid.every(g=>g>0);
    const sr=sec.getBoundingClientRect(),tr=table.getBoundingClientRect();
    const k=sr.width/(sec.offsetWidth||1)||1;
    const secW=sec.clientWidth,leftRel=(tr.left-sr.left)/k,wRel=tr.width/k;
    if(!(secW>0)||!(wRel>0))return;
    const wordW=xmlOk?info!.grid.reduce((a,b)=>a+b,0)/15:0;
    const overflow=leftRel+wRel>secW+1||wRel>secW;
    // bảng bố cục cố định trên trang ngang: đối chiếu từng cột với lưới của Word (trình duyệt hay bóp cột chữ, nới cột số)
    let colDev=false;
    if(xmlOk&&info!.fixed&&info!.pageW>=13000)pos.forEach((gc,td)=>{if((td.colSpan||1)!==1||!td.offsetWidth)return;const wd=info!.grid[gc]/15;if(Math.abs(td.offsetWidth-wd)>5&&Math.abs(td.offsetWidth-wd)>wd*0.15)colDev=true;});
    const deviates=xmlOk&&info!.fixed&&(Math.abs(wRel-wordW)>wordW*0.05||colDev);
    if(!overflow&&!deviates)return;
    let widths:number[];
    if(xmlOk)widths=info!.grid.map(g=>g/15);
    else{ // không có lưới của Word: dùng độ rộng đang hiển thị rồi thu nhỏ đều
      const w:(number|undefined)[]=new Array(ncols).fill(undefined);
      pos.forEach((gc,td)=>{if((td.colSpan||1)===1&&td.offsetWidth>0&&w[gc]===undefined)w[gc]=td.offsetWidth;});
      widths=w.map(x=>Math.max(8,x||40));
    }
    let total=widths.reduce((a,b)=>a+b,0);
    const cs=getComputedStyle(sec);const padL=parseFloat(cs.paddingLeft)||0;
    let leftPos=leftRel;
    const jc=(info?.jc||'').toLowerCase();
    if(xmlOk&&(jc===''||jc==='left'||jc==='start')){ // Word: bảng canh lề trái + thụt lề (có thể âm, kéo bảng ra phía lề)
      const indPx=info!.ind/15;
      if(table.style.marginLeft===''&&indPx!==0)table.style.marginLeft=indPx+'px';
      leftPos=padL+(table.style.marginLeft===''?0:parseFloat(table.style.marginLeft)||0);
    }else if(jc==='center'||table.style.marginLeft==='auto')leftPos=Math.max(0,(secW-total)/2);
    const limit=secW-4;
    if(leftPos+total>limit){const f=Math.max(0.2,(limit-Math.max(0,leftPos))/total);if(f<1){widths=widths.map(x=>x*f);total*=f;}}
    table.querySelectorAll(':scope > colgroup').forEach(x=>x.remove());
    const cg=document.createElement('colgroup');widths.forEach(x=>{const c=document.createElement('col');c.style.width=(Math.round(x*100)/100)+'px';cg.appendChild(c);});
    table.insertBefore(cg,table.firstChild);
    table.style.tableLayout='fixed';table.style.width=(Math.round(total*100)/100)+'px';table.style.maxWidth='none';
    pos.forEach((gc,td)=>{
      const span=td.colSpan||1;let cw=0;for(let j=0;j<span;j++)cw+=widths[gc+j]||0;
      td.style.width='';td.style.minWidth='';td.style.overflowWrap='break-word';
      if(cw<36){td.style.paddingLeft='0px';td.style.paddingRight='0px';td.style.overflowWrap='normal';} // cột rất hẹp (vd. ô ngày): bỏ lề ô để số không bị xuống dòng từng ký tự
    });
    table.dataset.qmsFrozen='1';
  });
}
// ===== Chia trang theo điểm ngắt của Word (nhóm SOP/QT) =====
// Cùng quy tắc phân nhóm với trang chủ: tên/đường dẫn chứa "quy trình" hoặc token sop/qt.
function isSopDoc(title:string|undefined,src:string){let p=src;try{p=decodeURIComponent(src);}catch{}return /(^|[\s._/-])(sop|qt)([\s._/-]|$)|quy trình|quy trinh/.test(`${title||''} ${p}`.toLocaleLowerCase('vi'));}
type PbCtx={pi:number;off:number;before:string;after:string};
const PB_TEXT='\u27E6QMSPB\u27E7';
const normWs=(t:string)=>t.replace(/\s+/g,' ');
function pbSpan(){const m=document.createElement('span');m.setAttribute('data-qms-pb','1');return m;}
// chuỗi đánh dấu (do markPageBreaks chèn vào tệp) -> phần tử <span data-qms-pb>
function textMarkersToSpans(root:HTMLElement):number{
  const hits:Text[]=[];const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n:Node|null;
  while((n=w.nextNode()))if((n as Text).data.includes(PB_TEXT))hits.push(n as Text);
  let count=0;
  hits.forEach(t=>{const frag=document.createDocumentFragment();t.data.split(PB_TEXT).forEach((part,i)=>{if(i>0){frag.appendChild(pbSpan());count++;}if(part)frag.appendChild(document.createTextNode(part));});t.parentNode?.replaceChild(frag,t);});
  return count;
}
// ghi lại ngữ cảnh từng điểm ngắt (đoạn chứa, vị trí ký tự, chữ liền trước/sau) để áp lại cho bản đã lưu từ trước chưa chia trang
function collectPbCtx(root:HTMLElement):PbCtx[]{
  const paras=Array.from(root.querySelectorAll('p'));const out:PbCtx[]=[];
  root.querySelectorAll('[data-qms-pb]').forEach(m=>{
    const p=m.closest('p');if(!p)return;
    const r=document.createRange();r.selectNodeContents(p);r.setEndBefore(m);
    const before=r.toString(),all=p.textContent||'';
    out.push({pi:paras.indexOf(p),off:before.length,before:normWs(before).slice(-24),after:normWs(all.slice(before.length)).slice(0,24)});
  });
  return out;
}
function insertPbAtOffset(p:HTMLElement,off:number){
  const m=pbSpan();const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let pos=0,n:Node|null;
  while((n=w.nextNode())){const t=n as Text,len=t.data.length;
    if(off<=pos+len){if(off===pos)t.parentNode!.insertBefore(m,t);else if(off===pos+len)t.parentNode!.insertBefore(m,t.nextSibling);else{const t2=t.splitText(off-pos);t.parentNode!.insertBefore(m,t2);}return;}
    pos+=len;}
  p.appendChild(m);
}
function applyPbCtx(root:HTMLElement,ctx:PbCtx[]){
  const paras=Array.from(root.querySelectorAll('p')) as HTMLElement[];
  ctx.forEach(c=>{
    const ok=(p:HTMLElement|undefined)=>{if(!p)return false;const t=p.textContent||'';return normWs(t.slice(0,c.off)).endsWith(c.before)&&normWs(t.slice(c.off)).startsWith(c.after)&&t.length>=c.off;};
    let p:HTMLElement|undefined=ok(paras[c.pi])?paras[c.pi]:undefined;
    for(let d=1;d<=40&&!p;d++)for(const k of [c.pi-d,c.pi+d])if(!p&&ok(paras[k]))p=paras[k];
    if(p&&!p.querySelector('[data-qms-pb]'))insertPbAtOffset(p,c.off);
  });
}
function newPageAfter(page:HTMLElement,article:HTMLElement,start:Element){
  const np=page.cloneNode(false) as HTMLElement;const na=article.cloneNode(false) as HTMLElement;
  Array.from(page.children).forEach(c=>{if(c===article)np.appendChild(na);else if(c.tagName==='HEADER'||c.tagName==='FOOTER')np.appendChild(c.cloneNode(true));});
  let n:Element|null=start;while(n){const nx:Element|null=n.nextElementSibling;na.appendChild(n);n=nx;}
  page.after(np);
}
const emptyBefore=(c:Element,m:Element)=>{const r=document.createRange();r.selectNodeContents(c);r.setEndBefore(m);return !r.toString().trim()&&!r.cloneContents().querySelector('img,table,svg');};
// Chia trang tại từng điểm ngắt: đoạn văn thì tách đoạn, bảng thì tách hàng (hàng bị cắt giữa chừng thành 2 phần như Word/PDF), rồi dựng trang mới có đầu/chân trang như trang cũ.
function paginateAtMarkers(root:HTMLElement){
  let guard=0;
  while(guard++<600){
    const M=root.querySelector('[data-qms-pb]') as HTMLElement|null;if(!M)break;
    const page=M.closest('section') as HTMLElement|null,article=M.closest('article') as HTMLElement|null;
    if(!page||!article||page.parentElement?.closest('section')){M.remove();continue;}
    let B:HTMLElement|null=M;while(B&&B.parentElement!==article)B=B.parentElement;
    if(!B){M.remove();continue;}
    let start:Element|null=null;
    if(B.tagName!=='TABLE'){
      if(emptyBefore(B,M)){M.remove();if(B===article.firstElementChild)continue;start=B;}
      else{const r=document.createRange();r.setStartBefore(M);r.setEnd(B,B.childNodes.length);const B2=B.cloneNode(false) as HTMLElement;B2.appendChild(r.extractContents());B.after(B2);B2.querySelectorAll('[data-qms-pb]').forEach(x=>x.remove());M.remove();start=B2;}
    }else{
      const T=B as HTMLTableElement;let R:HTMLTableRowElement|null=M.closest('tr');while(R&&R.closest('table')!==T)R=R.parentElement?.closest('tr')||null;
      if(!R||M.closest('table')!==T){M.remove();continue;}
      const rows=Array.from(T.rows),ri=rows.indexOf(R);
      // hàng dùng ô gộp dọc (rowspan) vắt qua điểm ngắt: không tách để khỏi vỡ bảng
      if(ri<0||rows.some((row,j)=>j<=ri&&Array.from(row.cells).some(c=>j+(c.rowSpan||1)-1>ri))){M.remove();continue;}
      const group:HTMLElement[]=[];
      Array.from(R.cells).forEach(c=>{const m=Array.from(c.querySelectorAll('[data-qms-pb]')).find(x=>x.closest('tr')===R) as HTMLElement|undefined;if(m)group.push(m);});
      if(!group.length){M.remove();continue;}
      const rowStart=group.every(m=>emptyBefore(m.closest('td,th') as Element,m));
      if(rowStart&&ri===0&&T===article.firstElementChild){group.forEach(m=>m.remove());continue;}
      let first:HTMLTableRowElement=R;
      if(!rowStart){
        const R1=R.cloneNode(false) as HTMLTableRowElement;
        Array.from(R.cells).forEach(c=>{const c1=c.cloneNode(false) as HTMLElement;const m=group.find(g=>g.closest('td,th')===c);
          if(m){const r=document.createRange();r.setStartBefore(m);r.setEnd(c,c.childNodes.length);c1.appendChild(r.extractContents());}
          R1.appendChild(c1);});
        R.after(R1);first=R1;
      }
      group.forEach(m=>m.remove());
      const parent=first.parentElement as HTMLElement;
      if(Array.from(T.rows).indexOf(first as HTMLTableRowElement)===0)start=T;
      else{
        const T2=T.cloneNode(false) as HTMLTableElement;
        Array.from(T.children).forEach(c=>{if(c.tagName==='COLGROUP')T2.appendChild(c.cloneNode(true));});
        let target:HTMLElement=T2;if(parent!==T){target=parent.cloneNode(false) as HTMLElement;T2.appendChild(target);}
        let n:Element|null=first;while(n){const nx:Element|null=n.nextElementSibling;target.appendChild(n);n=nx;}
        if(parent!==T){let sb=parent.nextElementSibling;while(sb){const nx=sb.nextElementSibling;T2.appendChild(sb);sb=nx;}}
        T.after(T2);start=T2;
      }
    }
    if(start)newPageAfter(page,article,start);
  }
  root.querySelectorAll('section').forEach(x=>{if(!x.parentElement?.closest('section'))x.setAttribute('data-qms-paged','1');});
}
// Danh sách phông chữ / cỡ chữ gợi ý (vẫn có thể chọn "Khác…" để nhập cỡ chữ bất kỳ).
const FONT_LIST=['Times New Roman','Arial','Calibri','Arial Unicode MS','Cambria','Tahoma','Verdana','Segoe UI','Georgia','Courier New','Consolas'];
const BASE_SIZES=['8','9','10','11','12','13','14','16','18','20','22','24','26','28','36','48','72'];
const ZOOMS=['40','50','60','75','90','100','110','125','150','175','200','250','300'];
// "1.234,56" / "1,234.56" / "12,5" -> số (null nếu không phải số).
function parseNum(raw:string):number|null{
  let t=String(raw||'').replace(/[\u00a0\s]/g,'').replace(/%$/,'');if(!t)return null;
  const c=t.lastIndexOf(','),d=t.lastIndexOf('.');
  if(c>=0&&d>=0)t=c>d?t.replace(/\./g,'').replace(',','.'):t.replace(/,/g,'');
  else if(c>=0)t=/^-?\d{1,3}(,\d{3})+$/.test(t)?t.replace(/,/g,''):t.replace(',','.');
  return /^-?\d+(\.\d+)?$/.test(t)?Number(t):null;
}
async function blobImagesToData(root:HTMLElement){
  await Promise.all(Array.from(root.querySelectorAll('img')).map(async img=>{
    const src=img.getAttribute('src')||'';if(!src.startsWith('blob:'))return;
    try{const b=await (await fetch(src)).blob();const d=await new Promise<string>(r=>{const fr=new FileReader();fr.onload=()=>r(String(fr.result));fr.readAsDataURL(b)});img.setAttribute('src',d);}catch{}
  }));
}
export default function DocumentPreview({src,ext,title,counterpart,editable=false,savedContent='',onContentChange}:Props){
 const host=useRef<HTMLDivElement>(null); const savedContentRef=useRef(savedContent); const editableRef=useRef(editable); savedContentRef.current=savedContent; editableRef.current=editable;
 const [error,setError]=useState(''); const [busy,setBusy]=useState(true); const [showPdfComparison,setShowPdfComparison]=useState(false); const [fontSize,setFontSize]=useState('12'); const [fontName,setFontName]=useState('Times New Roman'); const [activeSheet,setActiveSheet]=useState(''); const [sheetNames,setSheetNames]=useState<string[]>([]); const [zoom,setZoom]=useState('100'); const [orient,setOrient]=useState<'portrait'|'landscape'>('portrait'); const [orientMenu,setOrientMenu]=useState<{x:number;y:number}|null>(null); const orientRef=useRef<Record<string,'portrait'|'landscape'>>({}); const lastFind=useRef(''); const [ribbonTab,setRibbonTab]=useState('home'); const [ribbonOpen,setRibbonOpen]=useState(true);
 const workbook=useRef<XLSX.WorkBook|null>(null); const xlsxInfo=useRef<XlsxInfo|null>(null); const sheetsRef=useRef<Record<string,string>>({}); const activeSheetRef=useRef('');const sheetOrderRef=useRef<string[]>([]);const sheetScrollRef=useRef({get current(){return host.current?(host.current.querySelector('.sheet-body') as HTMLElement|null):null;}} as {current:HTMLElement|null});const originRef=useRef<Record<string,string>>({}); const originalHtml=useRef(''); const selectedShapeRef=useRef<HTMLElement|null>(null);
 const isWord=ext==='DOCX', isExcel=ext==='XLSX', isPdf=ext==='PDF';
 // Keep Word documents opening as Word by default. A matching PDF is optional for comparison only.
 const showFaithfulPdf=isWord&&!!counterpart&&showPdfComparison;
 
 const getEditRoot=useCallback(()=>{if(!host.current)return null;return isExcel?(host.current.querySelector('.sheet-body') as HTMLElement|null):host.current;},[isExcel]);
 const origImgs=useRef<string[]>([]);const tableInfoRef=useRef<TableInfo[]>([]);const pbCtxRef=useRef<PbCtx[]>([]);const sopRef=useRef(false);sopRef.current=isWord&&isSopDoc(title,src);const pageInfoRef=useRef<{singleSection:boolean;start:number}|null>(null);const shapeImgs=useRef<string[]>([]);const healTimer=useRef<number|null>(null);const cleanHtml=(root:HTMLElement)=>{const clone=root.cloneNode(true) as HTMLElement;clone.querySelectorAll('.cell-resize-handle,.row-resize-handle,[data-qms-drag],[data-qms-overlay]').forEach(x=>x.remove());clone.querySelectorAll('[data-qms-shape="true"]').forEach(x=>{(x as HTMLElement).style.outline='';});clone.querySelectorAll('[data-qms-resize]').forEach(x=>(x as HTMLElement).removeAttribute('data-qms-resize'));if(!isExcel)stashOriginalImages(clone,origImgs.current,shapeImgs.current);return clone.innerHTML;};
 const notify=useCallback(()=>{const root=getEditRoot();if(!root)return;const html=cleanHtml(root);if(isExcel){if(activeSheetRef.current)sheetsRef.current={...sheetsRef.current,[activeSheetRef.current]:html};onContentChange?.(JSON.stringify({v:2,sheets:sheetsRef.current,orient:orientRef.current,names:sheetOrderRef.current,origin:originRef.current}));}else onContentChange?.(html);},[getEditRoot,onContentChange,isExcel]);
 const notifyRef=useRef(notify);notifyRef.current=notify;
 const selectionCell=()=>{const sel=window.getSelection();let n=sel?.anchorNode as Node|null;while(n&&n!==host.current){if(n instanceof HTMLTableCellElement)return n;n=n.parentNode;}return null;};
 const command=(cmd:string,value?:string)=>{const root=getEditRoot();if(!root||(!editable&&!isPdf))return;root.focus();document.execCommand(cmd,false,value);notify();};
 const applyFontSize=(value:string)=>{setFontSize(value);const root=getEditRoot();if(!root||!editable)return;root.focus();document.execCommand('fontSize',false,'7');root.querySelectorAll('font[size="7"]').forEach(el=>{(el as HTMLElement).removeAttribute('size');(el as HTMLElement).style.fontSize=`${value}pt`;});notify();};
 // Tay kéo cột/hàng: tạo tay kéo cho từng ô, thao tác kéo xử lý bằng ủy quyền sự kiện (lib/tableResize.ts) nên ô vừa dán/khôi phục vẫn kéo được.
 const addResizeHandles=useCallback((root:HTMLElement)=>{
  root.querySelectorAll('.cell-resize-handle,.row-resize-handle').forEach(x=>x.remove());
  if(!editableRef.current)return;
  bindResizeDelegate(root,{isEditable:()=>!!editableRef.current,onChange:()=>notifyRef.current()});
  addHandles(root);
 },[]);
 const applyPageStyle=useCallback((mode:'portrait'|'landscape')=>{let st=document.getElementById('qms-page-orient') as HTMLStyleElement|null;if(!st){st=document.createElement('style');st.id='qms-page-orient';document.head.appendChild(st);}st.textContent=`@page{size:${mode};}`;},[]);
 useEffect(()=>()=>{document.getElementById('qms-page-orient')?.remove();},[]);
 const afterContentReady=useCallback((root:HTMLElement)=>{root.setAttribute('spellcheck','false');root.setAttribute('autocorrect','off');root.querySelectorAll('td,th,p,span,div').forEach(x=>x.setAttribute('spellcheck','false'));restoreOriginalImages(root,origImgs.current,shapeImgs.current);if(!isExcel){fixAnchoredImages(root);fixDocxFidelity(root);if(healTimer.current)window.clearTimeout(healTimer.current);healTimer.current=window.setTimeout(()=>{healBrokenImages(root,origImgs.current,shapeImgs.current);window.setTimeout(()=>healBrokenImages(root,origImgs.current,shapeImgs.current),2500);},700);}if(!root.dataset.qmsImgHeal){root.dataset.qmsImgHeal='1';root.addEventListener('error',(ev)=>{const t=ev.target as HTMLElement|null;if(t&&t.tagName==='IMG'&&(origImgs.current.length||shapeImgs.current.length)){t.setAttribute('data-qms-bad','1');restoreOriginalImages(root,origImgs.current,shapeImgs.current);}},true);}const o=detectOrient(root);if(o){setOrient(o);applyPageStyle(o);}if(root.querySelector('article')){if(sopRef.current&&pbCtxRef.current.length&&!root.querySelector('section[data-qms-paged]')){applyPbCtx(root,pbCtxRef.current);paginateAtMarkers(root);}repairFloatTables(root);fitTablesToPage(root,tableInfoRef.current);fixPageNumbers(root);}root.querySelectorAll('.cell-resize-handle,.row-resize-handle').forEach(x=>x.remove());root.querySelectorAll('td,th').forEach(cell=>(cell as HTMLElement).contentEditable=editableRef.current?'true':'false');if(editableRef.current){if(!isExcel)freezeTables(root);ensureCaretAnchors(root);}addResizeHandles(root);root.querySelectorAll('[data-qms-shape="true"]').forEach(shapeNode=>{const shape=shapeNode as HTMLElement;shape.contentEditable=editableRef.current?'true':'false';const handle=shape.querySelector('[data-qms-drag]') as HTMLElement|null;if(handle&&!handle.dataset.bound){handle.dataset.bound='1';handle.addEventListener('pointerdown',ev=>{if(!editableRef.current)return;ev.preventDefault();ev.stopPropagation();selectedShapeRef.current=shape;const e=ev as PointerEvent;const sx=e.clientX,sy=e.clientY;const left=parseFloat(shape.dataset.dragLeft||'0'),top=parseFloat(shape.dataset.dragTop||'0');const move=(mv:PointerEvent)=>{shape.dataset.dragLeft=String(left+mv.clientX-sx);shape.dataset.dragTop=String(top+mv.clientY-sy);shape.style.left=shape.dataset.dragLeft+'px';shape.style.top=shape.dataset.dragTop+'px';};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);notify();};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});});}});},[addResizeHandles,notify,applyPageStyle]);
 // Excel: Enter / Tab (kể cả mã kết thúc của máy quét mã vạch) chuyển sang ô BÊN PHẢI như Google Sheets (hết hàng thì xuống ô đầu hàng kế); Shift+Enter / Shift+Tab sang trái; Alt+Enter xuống dòng trong ô.
 useEffect(()=>{
  if(!isExcel||!editable)return;const h=host.current;if(!h)return;
  const onKey=(ev:KeyboardEvent)=>{if(ev.isComposing||ev.keyCode===229||(ev.key!=='Enter'&&ev.key!=='Tab')||ev.ctrlKey||ev.metaKey)return;
   const an=window.getSelection()?.anchorNode;const cell=((an instanceof Element?an:an?.parentElement)?.closest?.('td,th')||(ev.target as HTMLElement|null)?.closest?.('td,th')) as HTMLTableCellElement|null;
   if(!cell||!h.contains(cell)||!cell.closest('.sheet-body'))return;
   ev.preventDefault();ev.stopPropagation();
   if(ev.key==='Enter'&&ev.altKey){document.execCommand('insertLineBreak');notify();return;}
   const back=ev.shiftKey;const row=cell.parentElement as HTMLTableRowElement|null;
   let next=(back?cell.previousElementSibling:cell.nextElementSibling) as HTMLElement|null;
   if(!next&&row){const rn=(back?row.previousElementSibling:row.nextElementSibling) as HTMLElement|null;next=rn?((back?rn.lastElementChild:rn.firstElementChild) as HTMLElement|null):null;}
   if(!next||!(next instanceof HTMLTableCellElement))return;
   next.focus({preventScroll:true});
   const sel=window.getSelection();if(sel){const r=document.createRange();r.selectNodeContents(next);sel.removeAllRanges();sel.addRange(r);}
   next.scrollIntoView({block:'nearest',inline:'nearest'});
  };
  h.addEventListener('keydown',onKey,true);return()=>h.removeEventListener('keydown',onKey,true);
 },[isExcel,editable,notify]);
 // Sao chép / cắt / dán theo TỪNG Ô (Excel + Word): dán vùng ô từ trang tính/tài liệu khác, Excel, Google Sheets vào đúng lưới ô; mỗi ô vẫn sửa và kéo giãn được.
 useEffect(()=>{
  if(busy)return;const root=getEditRoot();if(!root)return;
  return attachTableClipboard(root,{sheet:isExcel,isEditable:()=>!!editableRef.current,onChange:()=>notify(),refresh:(r)=>{if(!isExcel)freezeTables(r);r.querySelectorAll('td,th').forEach(c=>(c as HTMLElement).contentEditable=editableRef.current?'true':'false');ensureCaretAnchors(r);addResizeHandles(r);}});
 },[busy,isExcel,getEditRoot,notify,addResizeHandles]);
 useEffect(()=>mountShapeHandles({getRoot:getEditRoot,isEditable:()=>editableRef.current,allowImages:()=>isWord,onSelect:el=>{selectedShapeRef.current=el;},onChange:notify}),[getEditRoot,notify,isWord]);
 const toolbarButton=(label:string,title:string,cmd?:string,value?:string,action?:()=>void)=><button key={title} type="button" className="office-tool-button" title={title} aria-label={title} disabled={!editable} onMouseDown={e=>e.preventDefault()} onClick={()=>action?action():cmd&&command(cmd,value)}>{label}</button>;
 const savedRange=useRef<Range|null>(null); const imgInput=useRef<HTMLInputElement>(null); const [selStat,setSelStat]=useState('');
 const rememberSel=()=>{const root=getEditRoot();const sel=window.getSelection();if(root&&sel&&sel.rangeCount&&root.contains(sel.anchorNode))savedRange.current=sel.getRangeAt(0).cloneRange();};
 const restoreSel=()=>{const root=getEditRoot();if(!root)return;root.focus({preventScroll:true});const sel=window.getSelection();if(savedRange.current&&sel){sel.removeAllRanges();sel.addRange(savedRange.current);}};
 // Chọn màu chữ / màu nền tùy ý (bảng màu của trình duyệt).
 const applyPickedColor=(kind:'fore'|'back',val:string)=>{if(!editable)return;restoreSel();document.execCommand(kind==='fore'?'foreColor':'backColor',false,val);notify();};
 const insertLink=()=>{
  const root=getEditRoot();if(!root||!editable)return;
  const sel=window.getSelection();if(!sel||sel.isCollapsed||!root.contains(sel.anchorNode)){alert('Bôi đen chữ cần gắn liên kết trước.');return;}
  const range=sel.getRangeAt(0).cloneRange();const url=(prompt('Địa chỉ liên kết (https://…):','https://')||'').trim();if(!url)return;
  if(!/^(https?:\/\/|mailto:)/i.test(url)){alert('Chỉ hỗ trợ liên kết bắt đầu bằng http://, https:// hoặc mailto:');return;}
  root.focus({preventScroll:true});sel.removeAllRanges();sel.addRange(range);document.execCommand('createLink',false,url);
  root.querySelectorAll('a[href]').forEach(a=>{a.setAttribute('target','_blank');a.setAttribute('rel','noreferrer noopener');});notify();
 };
 const insertImageFile=(file:File|undefined)=>{
  if(!file||!editable)return;
  if(!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)){alert('Chỉ chèn được ảnh PNG, JPG, GIF hoặc WebP.');return;}
  if(file.size>2*1024*1024){alert('Ảnh lớn hơn 2 MB. Hãy thu nhỏ ảnh trước khi chèn để việc lưu tự động không bị chậm.');return;}
  const fr=new FileReader();fr.onload=()=>{const root=getEditRoot();if(!root)return;restoreSel();const html=`<img src="${String(fr.result)}" alt="" style="max-width:100%;height:auto;">`;const sel=window.getSelection();if(sel&&sel.rangeCount&&root.contains(sel.anchorNode))document.execCommand('insertHTML',false,html);else root.insertAdjacentHTML('beforeend',html);afterContentReady(root);notify();};fr.readAsDataURL(file);
 };
 // Tải về bản đã chỉnh sửa: Excel -> .xlsx (mọi trang tính), Word -> .doc (mở được bằng Word).
 const exportEdited=async()=>{
  const root=getEditRoot();if(!root)return;
  const base=(title||'tai-lieu').replace(/[\\/:*?"<>|]+/g,'_').slice(0,120);
  const save=(blob:Blob,name:string)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);};
  try{
   if(isExcel){
    const wb=workbook.current;if(!wb)return;const out=XLSX.utils.book_new();
    for(const name of (sheetOrderRef.current.length?sheetOrderRef.current:wb.SheetNames)){
     const html=name===activeSheetRef.current?cleanHtml(root):sheetsRef.current[name];
     let ws:XLSX.WorkSheet|undefined;
     if(html){const div=document.createElement('div');div.innerHTML=html;div.querySelectorAll('.cell-resize-handle,.row-resize-handle').forEach(x=>x.remove());if(!originRef.current[name])div.querySelectorAll('td,th').forEach(c=>{if(!(c.textContent||'').replace(/[\u200b\s]/g,'')&&!c.querySelector('img'))c.innerHTML='';});const t=div.querySelector('table') as HTMLTableElement|null;
      if(t){ws=XLSX.utils.table_to_sheet(t);const cols=Array.from(t.querySelectorAll(':scope > colgroup > col')).map(c=>({wpx:Math.max(8,parseFloat((c as HTMLElement).style.width)||64)}));if(cols.length)ws['!cols']=cols;}}
     XLSX.utils.book_append_sheet(out,ws||wb.Sheets[originRef.current[name]||'']||XLSX.utils.aoa_to_sheet([[]]),name.slice(0,31));
    }
    XLSX.writeFile(out,base+'.xlsx');
   }else{
    const clone=root.cloneNode(true) as HTMLElement;clone.querySelectorAll('.cell-resize-handle,.row-resize-handle,[data-qms-drag]').forEach(x=>x.remove());
    await blobImagesToData(clone);
    const doc='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>'+base.replace(/[<>&]/g,'')+'</title><style>@page{size:'+(orient==='landscape'?'landscape':'portrait')+';}body{font-family:"Times New Roman",serif;}</style></head><body>'+clone.innerHTML+'</body></html>';
    save(new Blob(['\ufeff'+doc],{type:'application/msword;charset=utf-8'}),base+'.doc');
   }
  }catch(e){alert('Không tải được bản đã chỉnh sửa: '+(e instanceof Error?e.message:String(e)));}
 };
 // Excel: thống kê nhanh khi bôi chọn nhiều ô (số ô, tổng, trung bình, nhỏ nhất, lớn nhất).
 useEffect(()=>{
  if(!isExcel)return;let timer:ReturnType<typeof setTimeout>|null=null;
  const fmt=(n:number)=>Number.isInteger(n)?n.toLocaleString('vi-VN'):n.toLocaleString('vi-VN',{maximumFractionDigits:4});
  const run=()=>{
   const root=getEditRoot();const sel=window.getSelection();
   if(!root||!sel||!sel.rangeCount||sel.isCollapsed||!root.contains(sel.anchorNode)){setSelStat('');return;}
   const rg=sel.getRangeAt(0);const cells=(Array.from(root.querySelectorAll('td,th')) as HTMLElement[]).filter(c=>rg.intersectsNode(c));
   if(cells.length<2){setSelStat('');return;}
   const nums=cells.map(c=>parseNum(c.textContent||'')).filter((n):n is number=>n!==null);
   if(!nums.length){setSelStat('Đã chọn '+cells.length+' ô');return;}
   const sum=nums.reduce((a,b)=>a+b,0);
   setSelStat(`Đã chọn ${cells.length} ô · ${nums.length} số · Tổng ${fmt(sum)} · TB ${fmt(sum/nums.length)} · Min ${fmt(Math.min(...nums))} · Max ${fmt(Math.max(...nums))}`);
  };
  const h=()=>{if(timer)clearTimeout(timer);timer=setTimeout(run,160);};
  document.addEventListener('selectionchange',h);
  return()=>{document.removeEventListener('selectionchange',h);if(timer)clearTimeout(timer);};
 },[isExcel,getEditRoot]);
 const tableAction=(kind:'row+'|'row-'|'col+'|'col-'|'table+'|'table-'|'merge'|'unmerge')=>{
  if(kind==='table+'){
   const root=getEditRoot();if(!root)return;
   const rowsIn=prompt('Số hàng cần tạo? (1–200)','3');if(rowsIn===null)return;
   const colsIn=prompt('Số cột cần tạo? (1–50)','3');if(colsIn===null)return;
   const rows=Math.min(200,Math.max(1,Math.floor(Number(rowsIn))||3)),cols=Math.min(50,Math.max(1,Math.floor(Number(colsIn))||3));
   const t=document.createElement('table');t.style.cssText='border-collapse:collapse;width:100%;margin:8px 0;';
   for(let r=0;r<rows;r++){const tr=t.insertRow();for(let c=0;c<cols;c++){const td=tr.insertCell();td.innerHTML='&nbsp;';td.style.cssText='border:1px solid #333;padding:4px;min-width:40px;';}}
   const sel=window.getSelection();const node=sel?.anchorNode;
   const block=(node instanceof Element?node:node?.parentElement)?.closest('p,table') as HTMLElement|null;
   if(block&&block!==root&&root.contains(block))block.after(t);else (root.querySelector('section:last-of-type article')||root).append(t);
   afterContentReady(root);notify();return;
  }
  const cell=selectionCell();
  if(!cell){alert('Bấm vào một ô trong bảng trước.');return;}
  const table=cell.closest('table') as HTMLTableElement|null;if(!table)return;
  if(kind==='row+')insertRowAfter(table,cell);
  else if(kind==='row-'){if(!deleteRowOf(table,cell)){alert('Không thể xóa: bảng chỉ còn một hàng.');return;}}
  else if(kind==='col+')insertColumnAfter(table,cell);
  else if(kind==='col-'){if(!deleteColumnOf(table,cell)){alert('Không thể xóa: bảng chỉ còn một cột.');return;}}
  else if(kind==='table-'){if(!confirm('Xóa toàn bộ bảng này?'))return;table.remove();}
  else if(kind==='merge'){const err=mergeRight(cell);if(err){alert(err);return;}}
  else if(kind==='unmerge'){if(!unmergeCell(cell)){alert('Ô này chưa được gộp nên không cần tách.');return;}}
  const root=getEditRoot();if(root){afterContentReady(root);notify();}
 };
 const textNodesOf=(root:HTMLElement)=>{const out:Text[]=[];const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n:Node|null;while((n=w.nextNode())){const tag=n.parentElement?.tagName;if(tag==='STYLE'||tag==='SCRIPT'||tag==='TITLE')continue;out.push(n as Text);}return out;};
 // "Tìm": jumps to the NEXT match after the current selection (wraps around), so pressing it again keeps going.
 const findText=()=>{
  const root=getEditRoot();if(!root)return;
  const q=prompt('Tìm nội dung:',lastFind.current);if(!q)return;lastFind.current=q;
  const needle=q.toLocaleLowerCase();const nodes=textNodesOf(root);if(!nodes.length){alert('Không tìm thấy “'+q+'”.');return;}
  const sel=window.getSelection();let startIdx=0,startOff=0;
  if(sel&&sel.rangeCount){const rg=sel.getRangeAt(0);if(root.contains(rg.endContainer)){const k=nodes.indexOf(rg.endContainer as Text);if(k>=0){startIdx=k;startOff=rg.endOffset;}}}
  for(let i=0;i<=nodes.length;i++){
   const node=nodes[(startIdx+i)%nodes.length];const idx=(node.textContent||'').toLocaleLowerCase().indexOf(needle,i===0?startOff:0);
   if(idx>=0){root.focus({preventScroll:true});const range=document.createRange();range.setStart(node,idx);range.setEnd(node,idx+q.length);const s2=window.getSelection();s2?.removeAllRanges();s2?.addRange(range);(node.parentElement as HTMLElement|null)?.scrollIntoView({block:'center',inline:'nearest'});return;}
  }
  alert('Không tìm thấy “'+q+'”.');
 };
 // "Thay thế": replaces inside TEXT only (never touches HTML tags/attributes), case-insensitive, all matches.
 const replaceText=()=>{
  const root=getEditRoot();if(!root||!editable)return;
  const q=prompt('Tìm nội dung:',lastFind.current);if(!q)return;lastFind.current=q;
  const v=prompt('Thay bằng:','');if(v===null)return;
  const re=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');let count=0;
  textNodesOf(root).forEach(node=>{const t=node.textContent||'';if(!re.test(t)){re.lastIndex=0;return;}re.lastIndex=0;node.textContent=t.replace(re,()=>{count++;return v;});});
  if(count>0){notify();alert('Đã thay '+count+' vị trí.');}else alert('Không tìm thấy “'+q+'” để thay.');
 };
 // Text colour / highlight: press again to switch the colour off.
 const toggleColor=(kind:'fore'|'back')=>{
  const root=getEditRoot();if(!root||!editable)return;root.focus({preventScroll:true});
  const norm=(x:string)=>String(x||'').replace(/\s/g,'').toLowerCase();
  if(kind==='fore'){const cur=norm(document.queryCommandValue('foreColor'));document.execCommand('foreColor',false,cur==='rgb(192,0,0)'||cur==='#c00000'?'#000000':'#c00000');}
  else{const cur=norm(document.queryCommandValue('backColor'));document.execCommand('backColor',false,cur==='rgb(255,242,168)'||cur==='#fff2a8'?'transparent':'#fff2a8');}
  notify();
 };
 // Line spacing for every paragraph in the selection (or the paragraph/cell holding the caret).
 const applyLineHeight=(value:string)=>{
  const root=getEditRoot();if(!root||!editable)return;
  const sel=window.getSelection();
  if(!sel||!sel.rangeCount||!root.contains(sel.anchorNode)){alert('Bấm vào đoạn văn cần chỉnh giãn dòng trước.');return;}
  const range=sel.getRangeAt(0);let blocks:HTMLElement[]=[];
  if(!range.collapsed)blocks=(Array.from(root.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,blockquote')) as HTMLElement[]).filter(b=>range.intersectsNode(b));
  if(!blocks.length){const el=(sel.anchorNode instanceof Element?sel.anchorNode:sel.anchorNode?.parentElement)?.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,div') as HTMLElement|null;if(el&&el!==root&&root.contains(el))blocks=[el];}
  if(!blocks.length)return;
  blocks.forEach(b=>{b.style.lineHeight=value;});notify();
 };
 // Page orientation (Dọc/Ngang) for Word pages and Excel sheets (used when printing / exporting).
 const setOrientation=(mode:'portrait'|'landscape')=>{
  const root=getEditRoot();if(!root)return;
  if(isWord){root.querySelectorAll('section').forEach(sec=>{const el=sec as HTMLElement;const w=el.style.width,h=el.style.minHeight;const wv=parseFloat(w),hv=parseFloat(h);if(!w||!h||!isFinite(wv)||!isFinite(hv))return;if((wv>hv)!==(mode==='landscape')){el.style.width=h;el.style.minHeight=w;}el.dataset.qmsOrient=mode;});}
  else if(activeSheetRef.current){orientRef.current={...orientRef.current,[activeSheetRef.current]:mode};}
  setOrient(mode);applyPageStyle(mode);notify();
 };
 const shapeMarkup=(kind:string,id:string)=>{
  const common=`data-qms-shape="true" data-qms-shape-id="${id}" contenteditable="true" spellcheck="false"`;
  const baseStyle="display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;position:relative;box-sizing:border-box;min-width:70px;min-height:42px;width:170px;height:74px;margin:8px;padding:8px;border:2px solid #1565c0;background:#ffffff;color:#111111;font:14px 'Times New Roman',serif;text-align:center;resize:both;overflow:auto;cursor:text;white-space:pre-wrap;";
  const shapes:Record<string,{label:string;style?:string}>={
   rect:{label:'Hình chữ nhật'},process:{label:'Quy trình'},document:{label:'Tài liệu',style:'clip-path:polygon(0 0,100% 0,100% 85%,75% 92%,50% 85%,25% 78%,0 85%);'},round:{label:'Hình chữ nhật bo góc',style:'border-radius:14px;'},ellipse:{label:'Hình elip',style:'border-radius:50%;'},textbox:{label:'Nhập văn bản',style:'border:1px dashed #1565c0;background:transparent;'},triangle:{label:'Tam giác',style:'clip-path:polygon(50% 0,0 100%,100% 100%);background:#fff2cc;border-color:#c09000;'},diamond:{label:'Quyết định',style:'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);background:#fff2cc;border-color:#c09000;'},pentagon:{label:'Ngũ giác',style:'clip-path:polygon(50% 0,100% 38%,81% 100%,19% 100%,0 38%);'},hexagon:{label:'Lục giác',style:'clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%);'},star:{label:'Ngôi sao',style:'clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 95%,50% 72%,21% 95%,32% 57%,2% 35%,39% 35%);'},parallelogram:{label:'Hình bình hành',style:'clip-path:polygon(18% 0,100% 0,82% 100%,0 100%);'},trapezoid:{label:'Hình thang',style:'clip-path:polygon(20% 0,80% 0,100% 100%,0 100%);'},cylinder:{label:'Hình trụ / dữ liệu',style:'border-radius:50% / 12%;background:#eaf2f8;'},plus:{label:'Dấu cộng',style:'clip-path:polygon(38% 0,62% 0,62% 38%,100% 38%,100% 62%,62% 62%,62% 100%,38% 100%,38% 62%,0 62%,0 38%,38% 38%);'},terminator:{label:'Bắt đầu / Kết thúc',style:'border-radius:28px;background:#e2f0d9;border-color:#217346;'},data:{label:'Dữ liệu',style:'clip-path:polygon(15% 0,100% 0,85% 100%,0 100%);background:#eaf2f8;'},manual:{label:'Nhập thủ công',style:'clip-path:polygon(0 25%,100% 0,100% 100%,0 100%);'},offpage:{label:'Liên kết trang khác',style:'clip-path:polygon(0 0,100% 0,100% 75%,50% 100%,0 75%);'},cloud:{label:'Đám mây',style:'border-radius:35px;background:#eaf2f8;'},callout:{label:'Chú thích / Callout',style:'border-radius:10px;background:#fff2cc;box-shadow:5px 5px 0 #d9d9d9;'},callout2:{label:'Chú thích chữ nhật',style:'border-radius:0;background:#fff2cc;border-style:dashed;'},
  };
  if(['line','arrow','double-arrow','dashed-arrow','connector'].includes(kind)){
   const arrowStart=kind==='double-arrow'?'<span style="position:absolute;left:-1px;top:-6px;font-size:18px;line-height:12px">◀</span>':'';
   const arrowEnd=['arrow','double-arrow','dashed-arrow','connector'].includes(kind)?'<span style="position:absolute;right:-1px;top:-8px;font-size:20px;line-height:16px">▶</span>':'';
   const dashed=kind==='dashed-arrow'?'dashed':kind==='connector'?'dotted':'solid';
   return `<div ${common} data-qms-kind="${kind}" style="display:inline-block;position:relative;box-sizing:border-box;width:190px;height:24px;min-height:24px;min-width:80px;margin:8px;padding:0;border:0;background:transparent;resize:both;overflow:visible;cursor:move;"><div style="position:absolute;left:0;right:0;top:50%;border-top:2px ${dashed} #1565c0"></div>${arrowStart}${arrowEnd}<span contenteditable="false" style="position:absolute;right:0;top:-20px;font-size:10px;color:#526b7b">${kind==='connector'?'Đường nối':kind==='line'?'Đường thẳng':'Mũi tên'}</span></div>`;
  }
  const item=shapes[kind]||shapes.rect;
  return `<div ${common} data-qms-kind="${kind}" style="${baseStyle}${item.style||''}">${item.label}</div>`;
 };
 const insertShape=(kind:string)=>{const root=getEditRoot();if(!root||!editable)return;const id='qms-shape-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);const html=shapeMarkup(kind,id);const sel=window.getSelection();const inRoot=!!sel?.anchorNode&&root.contains(sel.anchorNode);if(inRoot){document.execCommand('insertHTML',false,html);}else root.insertAdjacentHTML('beforeend',html);const shape=root.querySelector(`[data-qms-shape-id="${id}"]`) as HTMLElement|null;if(shape){selectedShapeRef.current=shape;shape.style.outline='2px solid #0b8994';shape.focus();}afterContentReady(root);notify();if(shape)selectShapeHandles(shape);};
 const selectedShape=()=>{const root=getEditRoot();const sel=window.getSelection();const node=sel?.anchorNode;const fromSelection=(node instanceof Element?node:node?.parentElement)?.closest('[data-qms-shape="true"]') as HTMLElement|null;const s=fromSelection||selectedShapeRef.current;if(s&&root?.contains(s))return s;alert('Hãy bấm vào hình cần chỉnh sửa trước.');return null;};
 const updateSelectedShape=(fn:(shape:HTMLElement)=>void)=>{const shape=selectedShape();if(shape){fn(shape);selectedShapeRef.current=shape;notify();}};
 const shapeAction=(action:string)=>updateSelectedShape(shape=>{if(action==='fill'){const c=prompt('Màu tô (tên màu hoặc mã HEX):',shape.style.backgroundColor||'#ffffff');if(c!==null)shape.style.backgroundColor=c;}else if(action==='outline'){const c=prompt('Màu đường viền:',shape.style.borderColor||'#1565c0');if(c!==null)shape.style.borderColor=c;}else if(action==='width'){const w=Number(prompt('Độ dày đường viền (px):','2'));if(Number.isFinite(w)&&w>=0&&w<=20)shape.style.borderWidth=w+'px';}else if(action==='dash'){shape.style.borderStyle=shape.style.borderStyle==='dashed'?'solid':'dashed';}else if(action==='rotate'){const deg=Number(prompt('Góc xoay (độ):','15'));if(Number.isFinite(deg))shape.style.transform=`rotate(${deg}deg)`;}else if(action==='front'){shape.style.zIndex=String((Number(shape.style.zIndex)||1)+1);}else if(action==='back'){shape.style.zIndex='0';}else if(action==='duplicate'){const clone=shape.cloneNode(true) as HTMLElement;clone.dataset.qmsShapeId='qms-shape-'+Date.now()+'-'+Math.random().toString(36).slice(2,6);shape.after(clone);selectedShapeRef.current=clone;}else if(action==='delete'){if(confirm('Xóa hình đang chọn?')){shape.remove();selectedShapeRef.current=null;}}else if(action==='text'){shape.contentEditable='true';shape.focus();}else if(action==='shadow'){shape.style.boxShadow=shape.style.boxShadow?'':'4px 4px 0 #cbd5e1';}else if(action==='textcolor'){const c=prompt('Màu chữ:',shape.style.color||'#111111');if(c!==null)shape.style.color=c;}else if(action==='textalign'){const a=prompt('Căn chữ: left, center, right','center');if(a&&['left','center','right','justify'].includes(a))shape.style.textAlign=a;}else if(action==='transparent'){shape.style.backgroundColor=shape.style.backgroundColor==='transparent'?'#ffffff':'transparent';}else if(action==='reset'){shape.style.transform='';shape.style.backgroundColor='#ffffff';shape.style.borderColor='#1565c0';shape.style.borderWidth='2px';shape.style.borderStyle='solid';shape.style.boxShadow='';} });
 const renderExcelSheet=useCallback((name:string,wb:XLSX.WorkBook)=>{if(!host.current)return;const body=host.current.querySelector('.sheet-body') as HTMLDivElement|null;if(!body)return;const originName=originRef.current[name];const realWs=originName?wb.Sheets[originName]:undefined;const ws:XLSX.WorkSheet=realWs||({'!ref':BLANK_SHEET_REF} as XLSX.WorkSheet);body.scrollLeft=0;body.innerHTML='';body.innerHTML=XLSX.utils.sheet_to_html(ws,{id:'excel-preview-table'});const table=body.querySelector('table') as HTMLTableElement|null;if(table)decorateSheetTable(table,ws);const initialHtml=body.innerHTML;activeSheetRef.current=name;setActiveSheet(name);{const o=orientRef.current[name]||'portrait';setOrient(o);applyPageStyle(o);}originalHtml.current=initialHtml;const saved=sheetsRef.current[name];if(saved)body.innerHTML=saved;afterContentReady(body);{const info=xlsxInfo.current;if(info&&realWs&&originName){const st=ws['!ref']?XLSX.utils.decode_range(ws['!ref']):null;void decorateXlsxSheet(info,originName,body,'excel-preview-table',st?st.s.r:0,st?st.s.c:0).catch(()=>{});}}},[afterContentReady,applyPageStyle]);
 const commitOrder=(next:string[])=>{sheetOrderRef.current=next;setSheetNames(next.slice());};
 const selectSheet=(name:string)=>{const wb=workbook.current;if(wb&&name!==activeSheetRef.current&&sheetOrderRef.current.includes(name))renderExcelSheet(name,wb);};
 const uniqueSheetName=(base:string,taken:string[])=>{const low=taken.map(x=>x.toLowerCase());let n=base.slice(0,31),k=2;while(low.includes(n.toLowerCase())){const suf=' ('+k+')';n=base.slice(0,31-suf.length)+suf;k++;}return n;};
 // Thêm trang tính mới (lưới trống) ở cuối và chuyển sang trang đó.
 const addSheet=()=>{const wb=workbook.current;if(!wb||!editableRef.current)return;const order=sheetOrderRef.current;let k=order.length+1;let name='Sheet'+k;while(order.some(x=>x.toLowerCase()===name.toLowerCase())){k++;name='Sheet'+k;}originRef.current=omitKey(originRef.current,name);commitOrder([...order,name]);renderExcelSheet(name,wb);notify();};
 // Đổi tên trang tính (nhấn đúp vào tab). Trả về thông báo lỗi nếu tên không hợp lệ.
 const renameSheet=(from:string,to:string):string|null=>{
  if(!editableRef.current)return 'Bật “Chỉnh sửa trực tiếp” để đổi tên trang tính.';
  if(/[\\/?*\[\]:]/.test(to))return 'Tên trang tính không được chứa các ký tự:  \\  /  ?  *  [  ]  :';
  if(to.length>31)return 'Tên trang tính tối đa 31 ký tự.';
  if(to.startsWith("'")||to.endsWith("'"))return 'Tên trang tính không được bắt đầu hoặc kết thúc bằng dấu nháy đơn.';
  const order=sheetOrderRef.current;
  if(order.some(x=>x!==from&&x.toLowerCase()===to.toLowerCase()))return 'Đã có trang tính tên “'+to+'”. Hãy nhập tên khác.';
  const i=order.indexOf(from);if(i<0)return null;
  commitOrder(order.map((x,k)=>k===i?to:x));
  sheetsRef.current=renameKey(sheetsRef.current,from,to);orientRef.current=renameKey(orientRef.current,from,to);originRef.current=renameKey(originRef.current,from,to);
  if(activeSheetRef.current===from){activeSheetRef.current=to;setActiveSheet(to);}
  notify();return null;
 };
 const deleteSheet=(name:string)=>{
  const wb=workbook.current;if(!wb||!editableRef.current)return;const order=sheetOrderRef.current;
  if(order.length<2){alert('Cần giữ lại ít nhất một trang tính.');return;}
  if(!confirm('Xóa trang tính “'+name+'”? Nội dung của trang tính này sẽ mất.'))return;
  const i=order.indexOf(name);if(i<0)return;const next=order.filter(x=>x!==name);
  sheetsRef.current=omitKey(sheetsRef.current,name);orientRef.current=omitKey(orientRef.current,name);originRef.current=omitKey(originRef.current,name);
  commitOrder(next);
  if(activeSheetRef.current===name)renderExcelSheet(next[Math.min(i,next.length-1)],wb);
  notify();
 };
 const duplicateSheet=(name:string)=>{
  const wb=workbook.current;if(!wb||!editableRef.current)return;const order=sheetOrderRef.current;const i=order.indexOf(name);if(i<0)return;
  const root=getEditRoot();const html=name===activeSheetRef.current&&root?cleanHtml(root):sheetsRef.current[name];
  const nn=uniqueSheetName(name,order);
  if(originRef.current[name])originRef.current={...originRef.current,[nn]:originRef.current[name]};
  if(html)sheetsRef.current={...sheetsRef.current,[nn]:html};
  if(orientRef.current[name])orientRef.current={...orientRef.current,[nn]:orientRef.current[name]};
  const next=order.slice();next.splice(i+1,0,nn);commitOrder(next);renderExcelSheet(nn,wb);notify();
 };
 const moveSheet=(from:number,to:number)=>{if(!editableRef.current)return;const order=sheetOrderRef.current.slice();if(from<0||to<0||from>=order.length||to>=order.length||from===to)return;const [x]=order.splice(from,1);order.splice(to,0,x);commitOrder(order);notify();};
 useEffect(()=>{let alive=true;setError('');setBusy(true);workbook.current=null;setSheetNames([]);(async()=>{try{if(isWord){const res=await fetch(src);if(!res.ok)throw new Error('Không tải được tệp Word gốc.');const blob=await res.blob();{const h=new Uint8Array(await blob.slice(0,4).arrayBuffer());if(h[0]===0xD0&&h[1]===0xCF&&h[2]===0x11&&h[3]===0xE0)throw new Error('Tệp có đuôi .docx nhưng thực chất là định dạng Word cũ (.doc) nên không xem trước được trên trình duyệt. Hãy bấm “Tải bản gốc” để mở bằng Word, hoặc lưu lại thành .docx rồi dùng “Thay tệp”.');}if(!alive||!host.current)return;host.current.innerHTML='';const shapedRes=await renderDocxShapes(sopRef.current?await markPageBreaks(blob):blob);pageInfoRef.current=await docxPageInfo(blob);tableInfoRef.current=await docxTableInfo(blob);if(!alive||!host.current)return;await renderAsync(shapedRes.blob,host.current,undefined,{className:'docx-preview',inWrapper:true,ignoreWidth:false,ignoreHeight:false,breakPages:true,renderHeaders:true,renderFooters:true,renderFootnotes:true,renderEndnotes:true,useBase64URL:true});pbCtxRef.current=[];if(sopRef.current&&textMarkersToSpans(host.current)){pbCtxRef.current=collectPbCtx(host.current);paginateAtMarkers(host.current);}{const imgs=Array.from(host.current.querySelectorAll('img')) as HTMLImageElement[];const gen=await markGeneratedImages(imgs,shapedRes.pngs);if(!alive||!host.current)return;origImgs.current=imgs.filter((_,k)=>!gen[k]).map(i=>i.getAttribute('src')||'');shapeImgs.current=imgs.filter((_,k)=>gen[k]).map(i=>i.getAttribute('src')||'');}originalHtml.current=cleanHtml(host.current);if(alive&&savedContentRef.current)host.current.innerHTML=savedContentRef.current;afterContentReady(host.current);}else if(isExcel){const res=await fetch(src);if(!res.ok)throw new Error('Không tải được tệp Excel gốc.');const buf=await res.arrayBuffer();const wb=XLSX.read(buf,{type:'array',cellDates:true,cellStyles:true});xlsxInfo.current=await loadXlsxInfo(buf);if(!alive||!host.current)return;workbook.current=wb;sheetsRef.current=readSavedSheets(savedContentRef.current,wb.SheetNames[0]||'');orientRef.current=readSavedOrient(savedContentRef.current);activeSheetRef.current='';host.current.innerHTML='';const body=document.createElement('div');body.className='sheet-body';host.current.append(body);{const lay=readSavedLayout(savedContentRef.current);const order=lay.names&&lay.names.length?lay.names.slice():wb.SheetNames.slice();const org:Record<string,string>={};order.forEach(n=>{const o=lay.origin?lay.origin[n]:(wb.Sheets[n]?n:undefined);if(o&&wb.Sheets[o])org[n]=o;});sheetOrderRef.current=order;originRef.current=org;setSheetNames(order.slice());if(order.length)renderExcelSheet(order[0],wb);}}}catch(e){if(alive)setError(e instanceof Error?e.message:'Không thể xem trước tài liệu.')}finally{if(alive)setBusy(false)}})();return()=>{alive=false};},[src,ext,isWord,isExcel,renderExcelSheet,afterContentReady,showFaithfulPdf]);
 useEffect(()=>{if(!host.current||busy)return;const root=getEditRoot();if(!root)return;root.contentEditable=editable?'true':'false';root.classList.toggle('inline-editing',editable);root.querySelectorAll('td,th').forEach(cell=>(cell as HTMLElement).contentEditable=editable?'true':'false');afterContentReady(root);const input=()=>notify();const click=(ev:Event)=>{const target=ev.target as HTMLElement;const shape=(target.closest('[data-qms-shape="true"]')||(isWord&&target.tagName==='IMG'?target:null)) as HTMLElement|null;if(shape){if(selectedShapeRef.current&&selectedShapeRef.current!==shape)selectedShapeRef.current.style.outline='';selectedShapeRef.current=shape;if(shape.tagName!=='IMG')shape.style.outline='2px solid #0b8994';}else if(selectedShapeRef.current){selectedShapeRef.current.style.outline='';selectedShapeRef.current=null;}};root.addEventListener('input',input);root.addEventListener('click',click);return()=>{root.removeEventListener('input',input);root.removeEventListener('click',click)};},[editable,busy,getEditRoot,notify,afterContentReady]);
 useEffect(()=>{if(!savedContent||busy||!host.current||isExcel)return;const root=getEditRoot();if(root&&cleanHtml(root)!==savedContent){root.innerHTML=savedContent;afterContentReady(root);}},[savedContent,busy,isExcel,getEditRoot,editable,afterContentReady]);
 useEffect(()=>{const root=host.current;if(!root)return;root.style.setProperty('--doc-zoom',zoom);},[zoom,busy]);
 if(showFaithfulPdf)return <div className="pdf-office-shell paired-pdf-view"><div className="pdf-edit-notice"><strong>Đang xem PDF đối chiếu</strong> · Đây là bản PDF tương ứng để so sánh với Word. Tài liệu Word vẫn được giữ nguyên và có thể mở lại bằng nút bên dưới.</div><div className="office-tool-row" style={{padding:'10px 0'}}><button type="button" className="office-tool-button" onClick={()=>setShowPdfComparison(false)}>← Quay lại bản Word</button><a className="office-tool-button office-tool-link" href={src} target="_blank" rel="noreferrer">Mở Word gốc ↗</a></div><div className="office-ribbon pdf-ribbon"><div className="office-ribbon-group"><span className="office-group-label">BẢN PDF ĐỐI CHIẾU</span><div className="office-tool-row"><a className="office-tool-button office-tool-link" href={counterpart} target="_blank" rel="noreferrer">↗ Mở PDF đầy đủ</a><a className="office-tool-button office-tool-link" href={counterpart} download>↓ Tải PDF</a><a className="office-tool-button office-tool-link" href={src} target="_blank" rel="noreferrer">Mở Word gốc ↗</a></div></div></div><iframe className="pdf-preview" title={title+' - bản PDF đầy đủ'} src={counterpart}/></div>;
 if(isPdf)return <div className="pdf-office-shell"><div className="office-ribbon pdf-ribbon"><div className="office-ribbon-group"><span className="office-group-label">TỆP PDF</span><div className="office-tool-row"><a className="office-tool-button office-tool-link" href={src} target="_blank" rel="noreferrer">↗ Mở PDF</a><a className="office-tool-button office-tool-link" href={src} download>↓ Tải xuống</a><button type="button" className="office-tool-button" onClick={()=>window.print()}>⎙ In</button></div></div><div className="office-ribbon-hint">PDF gốc được giữ nguyên. Dùng ghi chú để lưu nội dung bổ sung.</div></div><iframe className="pdf-preview" title={title} src={src}/></div>;
 if(['JPG','JPEG','PNG'].includes(ext))return <div className="image-preview"><img src={src} alt={title}/></div>;
 return <div className="preview-shell">
  <div className="office-ribbon" role="toolbar" data-tab={ribbonTab} data-open={ribbonOpen?'1':'0'} aria-label={isWord?'Thanh công cụ Word':'Thanh công cụ Excel'}>
   <div className="office-tabs" role="tablist">{(isWord?[['home','Trang chủ'],['table','Bảng'],['layout','Bố cục'],['shapes','Hình vẽ']]:[['home','Trang chủ'],['table','Bảng'],['layout','Bố cục']]).map(([k,l])=><button key={k} type="button" role="tab" aria-selected={ribbonOpen&&ribbonTab===k} className={'office-tab'+(ribbonOpen&&ribbonTab===k?' active':'')} onMouseDown={e=>e.preventDefault()} onClick={()=>{setRibbonTab(k);setRibbonOpen(true)}}>{l}</button>)}<span className="office-tabs-spacer"/>{!editable&&<span className="office-ribbon-hint office-tabs-hint" title="Bật “Chỉnh sửa trực tiếp” ở đầu trang để sử dụng công cụ định dạng.">Bật “Chỉnh sửa trực tiếp” để dùng công cụ</span>}{isExcel&&<span className="office-ribbon-hint office-tabs-hint">{sheetNames.length} trang tính · {activeSheet||'Đang tải'} · {orient==='landscape'?'Giấy ngang':'Giấy dọc'}</span>}{isExcel&&selStat&&<span className="office-ribbon-hint office-tabs-hint" role="status">{selStat}</span>}<select className="office-size-select office-zoom-select" value={zoom} onChange={e=>setZoom(e.target.value)} aria-label="Thu phóng" title="Thu phóng">{ZOOMS.map(z=><option key={z} value={z}>{z}%</option>)}</select><button type="button" className="office-tab office-collapse" title={ribbonOpen?'Thu gọn thanh công cụ':'Mở rộng thanh công cụ'} aria-label={ribbonOpen?'Thu gọn thanh công cụ':'Mở rộng thanh công cụ'} onMouseDown={e=>e.preventDefault()} onClick={()=>setRibbonOpen(v=>!v)}>{ribbonOpen?'▴':'▾'}</button></div>
   <div className="office-ribbon-group" data-g="home"><span className="office-group-label">TỆP & CHỈNH SỬA</span><div className="office-tool-row"><button className="office-tool-button" type="button" onClick={()=>window.print()}>⎙ In</button>{isWord&&counterpart&&<button className="office-tool-button" type="button" onClick={()=>setShowPdfComparison(true)}>Xem PDF đối chiếu</button>}{toolbarButton('↶','Hoàn tác','undo')}{toolbarButton('↷','Làm lại','redo')}<button className="office-tool-button" type="button" disabled={!editable} title="Khôi phục bản gốc" onClick={()=>{const root=getEditRoot();if(root&&confirm('Khôi phục về bản gốc? Mọi chỉnh sửa trên trang/trang tính này sẽ mất.')){root.innerHTML=originalHtml.current;afterContentReady(root);notify();}}}>Khôi phục</button><button className="office-tool-button" type="button" onClick={findText} title="Tìm (bấm lại để tìm kết quả kế tiếp)">Tìm</button><button className="office-tool-button" type="button" disabled={!editable} onClick={replaceText} title="Thay thế tất cả">Thay thế</button><button className="office-tool-button" type="button" onClick={exportEdited} title={isExcel?'Tải về bản đã chỉnh sửa (.xlsx, mọi trang tính)':'Tải về bản đã chỉnh sửa (.doc, mở được bằng Word)'}>⬇ Tải bản đã sửa</button></div></div>
   <div className="office-ribbon-group" data-g="home"><span className="office-group-label">CHÈN</span><div className="office-tool-row"><button className="office-tool-button" type="button" disabled={!editable} title="Gắn liên kết cho chữ đang bôi đen" onMouseDown={e=>e.preventDefault()} onClick={insertLink}>🔗 Liên kết</button><button className="office-tool-button" type="button" disabled={!editable} title="Chèn ảnh (PNG/JPG, tối đa 2 MB)" onMouseDown={e=>{e.preventDefault();rememberSel()}} onClick={()=>imgInput.current?.click()}>🖼 Ảnh</button><input ref={imgInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" style={{display:'none'}} onChange={e=>{insertImageFile(e.target.files?.[0]);e.target.value=''}}/></div></div>
   <div className="office-ribbon-group" data-g="home"><span className="office-group-label">PHÔNG CHỮ</span><div className="office-tool-row"><select className="office-font-select" value={fontName} onChange={e=>{setFontName(e.target.value);command('fontName',e.target.value)}} disabled={!editable} aria-label="Phông chữ">{FONT_LIST.map(f=><option key={f}>{f}</option>)}</select><select className="office-size-select" value={fontSize} onChange={e=>{if(e.target.value==='__custom'){const n=Number(String(prompt('Nhập cỡ chữ (pt, từ 4 đến 400):',fontSize)||'').replace(',','.'));if(isFinite(n)&&n>=4&&n<=400)applyFontSize(String(n));}else applyFontSize(e.target.value)}} disabled={!editable} aria-label="Cỡ chữ">{(BASE_SIZES.includes(fontSize)?BASE_SIZES:[...BASE_SIZES,fontSize].sort((a,b)=>Number(a)-Number(b))).map(n=><option key={n} value={n}>{n}</option>)}<option value="__custom">Khác…</option></select>{toolbarButton('B','Đậm','bold')}{toolbarButton('I','Nghiêng','italic')}{toolbarButton('U̲','Gạch chân','underline')}{toolbarButton('A̲','Màu chữ (bấm lại để tắt)','',undefined,()=>toggleColor('fore'))}{toolbarButton('▨','Tô sáng (bấm lại để tắt)','',undefined,()=>toggleColor('back'))}{toolbarButton('Tx','Xóa định dạng','removeFormat')}{toolbarButton('x²','Chỉ số trên','superscript')}{toolbarButton('x₂','Chỉ số dưới','subscript')}{toolbarButton('S̶','Gạch ngang','strikeThrough')}<label className="office-tool-button office-color-pick" title="Chọn màu chữ tùy ý" onMouseDown={rememberSel}>A<input type="color" defaultValue="#c00000" disabled={!editable} aria-label="Chọn màu chữ" onChange={e=>applyPickedColor('fore',e.target.value)}/></label><label className="office-tool-button office-color-pick" title="Chọn màu nền chữ tùy ý" onMouseDown={rememberSel}>▨<input type="color" defaultValue="#fff2a8" disabled={!editable} aria-label="Chọn màu nền chữ" onChange={e=>applyPickedColor('back',e.target.value)}/></label></div></div>
   <div className="office-ribbon-group" data-g="home"><span className="office-group-label">ĐOẠN VĂN & BỐ CỤC</span><div className="office-tool-row">{toolbarButton('≡','Căn trái','justifyLeft')}{toolbarButton('☰','Căn giữa','justifyCenter')}{toolbarButton('≣','Căn phải','justifyRight')}{toolbarButton('☷','Căn đều','justifyFull')}{toolbarButton('• Danh sách','Danh sách dấu đầu dòng','insertUnorderedList')}{toolbarButton('1. Danh sách','Danh sách đánh số','insertOrderedList')}{toolbarButton('⇥','Tăng thụt lề','indent')}{toolbarButton('⇤','Giảm thụt lề','outdent')}<select className="office-size-select" defaultValue="p" disabled={!editable} aria-label="Kiểu đoạn" onChange={e=>command('formatBlock',e.target.value)}><option value="p">Đoạn văn</option><option value="h1">Tiêu đề 1</option><option value="h2">Tiêu đề 2</option><option value="h3">Tiêu đề 3</option><option value="blockquote">Trích dẫn</option></select><select className="office-size-select" defaultValue="1.0" disabled={!editable} aria-label="Giãn dòng" onChange={e=>{if(e.target.value==='__custom'){const n=Number(String(prompt('Nhập giãn dòng (0.5 – 5):','1.5')||'').replace(',','.'));if(isFinite(n)&&n>=0.5&&n<=5)applyLineHeight(String(n));e.target.value='1.0';}else applyLineHeight(e.target.value)}}><option value="1.0">Dòng 1.0</option><option value="1.15">Dòng 1.15</option><option value="1.25">Dòng 1.25</option><option value="1.5">Dòng 1.5</option><option value="1.75">Dòng 1.75</option><option value="2">Dòng 2.0</option><option value="2.5">Dòng 2.5</option><option value="3">Dòng 3.0</option><option value="__custom">Khác…</option></select></div></div>
   <div className="office-ribbon-group" data-g="table"><span className="office-group-label">BẢNG</span><div className="office-tool-row">{toolbarButton('▦+','Chèn bảng','',undefined,()=>tableAction('table+'))}{toolbarButton('Hàng +','Thêm hàng dưới','',undefined,()=>tableAction('row+'))}{toolbarButton('Hàng −','Xóa hàng','',undefined,()=>tableAction('row-'))}{toolbarButton('Cột +','Thêm cột bên phải','',undefined,()=>tableAction('col+'))}{toolbarButton('Cột −','Xóa cột','',undefined,()=>tableAction('col-'))}{toolbarButton('Gộp ô','Gộp ô kế bên','',undefined,()=>tableAction('merge'))}{toolbarButton('Tách ô','Tách ô đã gộp','',undefined,()=>tableAction('unmerge'))}{toolbarButton('Xóa bảng','Xóa bảng đang chọn','',undefined,()=>tableAction('table-'))}{toolbarButton('Màu ô','Tô màu ô','',undefined,()=>{const c=selectionCell();if(!c){alert('Bấm vào một ô trong bảng trước.');return;}const col=prompt('Mã màu hoặc tên màu (để trống = bỏ màu):','#fff2a8');if(col===null)return;(c as HTMLElement).style.backgroundColor=col.trim();notify();})}{toolbarButton('Viền','Hiện viền bảng','',undefined,()=>{const c=selectionCell();const t=c?.closest('table');if(!t){alert('Bấm vào một ô trong bảng trước.');return;}if(t){t.querySelectorAll('td,th').forEach(x=>(x as HTMLElement).style.border='1px solid #333');notify();}})}</div></div>
   <div className="office-ribbon-group" data-g="layout"><span className="office-group-label">BỐ CỤC</span><div className="office-tool-row"><button className="office-tool-button orient-btn" type="button" aria-haspopup="menu" aria-expanded={!!orientMenu} title="Hướng giấy (Dọc / Ngang)" onMouseDown={e=>e.preventDefault()} onClick={e=>{const r=(e.currentTarget as HTMLElement).getBoundingClientRect();setOrientMenu(orientMenu?null:{x:Math.max(6,Math.min(r.left,window.innerWidth-214)),y:r.bottom+4});}}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 3h9l4 4v14H6z M15 3v4h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg><span>Hướng giấy</span><span aria-hidden="true">▾</span></button></div></div>
   {isWord&&<div className="office-ribbon-group office-shapes-group" data-g="shapes"><span className="office-group-label">SHAPES · HÌNH VẼ</span><div className="office-tool-row"><select className="office-size-select office-shape-select" defaultValue="rect" disabled={!editable} aria-label="Chọn hình vẽ"><option value="rect">Chữ nhật</option><option value="round">Chữ nhật bo góc</option><option value="ellipse">Elip / hình tròn</option><option value="textbox">Hộp văn bản</option><option value="line">Đường thẳng</option><option value="arrow">Mũi tên</option><option value="double-arrow">Mũi tên hai đầu</option><option value="dashed-arrow">Mũi tên nét đứt</option><option value="connector">Đường nối</option><option value="triangle">Tam giác</option><option value="diamond">Hình thoi / quyết định</option><option value="pentagon">Ngũ giác</option><option value="hexagon">Lục giác</option><option value="parallelogram">Bình hành</option><option value="trapezoid">Hình thang</option><option value="cylinder">Hình trụ / dữ liệu</option><option value="plus">Dấu cộng</option><option value="star">Ngôi sao</option><option value="process">Lưu đồ: Quy trình</option><option value="terminator">Lưu đồ: Bắt đầu/Kết thúc</option><option value="document">Lưu đồ: Tài liệu</option><option value="data">Lưu đồ: Dữ liệu</option><option value="manual">Lưu đồ: Nhập thủ công</option><option value="offpage">Lưu đồ: Liên kết trang</option><option value="cloud">Đám mây</option><option value="callout">Chú thích</option><option value="callout2">Chú thích nét đứt</option></select><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>{const sel=document.querySelector('.office-shape-select') as HTMLSelectElement|null;insertShape(sel?.value||'rect')}}>＋ Chèn hình</button><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('fill')}>Màu tô</button><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('outline')}>Màu viền</button><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('width')}>Độ dày</button><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('dash')}>Nét đứt</button><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('rotate')}>Xoay</button><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('shadow')}>Bóng</button><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('transparent')}>Trong suốt</button><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('textcolor')}>Màu chữ hình</button><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('textalign')}>Căn chữ hình</button><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('duplicate')}>Nhân đôi</button><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('front')}>Lên trước</button><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('back')}>Xuống sau</button><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('delete')}>Xóa hình</button></div><div className="office-tool-row"><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('text')}>Sửa chữ trong hình</button><button className="office-tool-button" type="button" disabled={!editable} onClick={()=>shapeAction('reset')}>Đặt lại kiểu</button><span className="office-ribbon-hint">Bấm vào hình rồi kéo các chấm vuông để đổi dài/ngắn/to/nhỏ (giữ Shift để giữ tỉ lệ), chấm tròn phía trên để xoay, nút ✥ để di chuyển; đường thẳng/mũi tên kéo từng đầu.</span></div></div>}
  </div>
  {orientMenu&&<><div className="orient-backdrop" onMouseDown={()=>setOrientMenu(null)}/><div className="orient-menu" role="menu" style={{left:orientMenu.x,top:orientMenu.y}}><button type="button" role="menuitem" className={'orient-item'+(orient==='portrait'?' active':'')} onClick={()=>{setOrientation('portrait');setOrientMenu(null);}}><span className="orient-ico"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 3h9l4 4v14H6z M15 3v4h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg></span><span>Dọc (Portrait)</span></button><button type="button" role="menuitem" className={'orient-item'+(orient==='landscape'?' active':'')} onClick={()=>{setOrientation('landscape');setOrientMenu(null);}}><span className="orient-ico"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 6h14l4 4v8H3z M17 6v4h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg></span><span>Ngang (Landscape)</span></button></div></>}
  {busy&&<div className="preview-message">Đang mở bản xem trước…</div>}{error&&<div className="preview-message preview-error">{error}<p><a className="btn primary" href={src} target="_blank" rel="noreferrer">Mở / tải tệp gốc</a></p></div>}
  <div ref={host} className={'preview-content '+(busy?'is-loading':'')+(isExcel?' sheet-host':'')} style={{zoom:zoom+'%'}}/>
  {isExcel&&!error&&!busy&&<SheetBar names={sheetNames} active={activeSheet} editable={!!editable} scrollRef={sheetScrollRef.current} watchKey={zoom} onSelect={selectSheet} onAdd={addSheet} onRename={renameSheet} onDelete={deleteSheet} onDuplicate={duplicateSheet} onMove={moveSheet}/>}
  {!error&&<div className="preview-original"><a className="btn primary" href={src} target="_blank" rel="noreferrer">Mở tệp gốc trong ứng dụng tương ứng ↗</a></div>}
 </div>
}
