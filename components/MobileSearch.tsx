'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {Doc} from '@/lib/documents';
import {isGatedName} from '@/lib/gate';
import {extBadge,useStore} from '@/lib/mobileStore';
type Row=Doc&{_t:string;_h:string};
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'d').toLowerCase();
let cache:Row[]|null=null;
const FILTERS:[string,string][]=[['all','Tất cả'],['PDF','PDF'],['DOCX','Word'],['XLSX','Excel'],['other','Khác']];
const Ico=({d}:{d:string})=><svg viewBox="0 0 24 24" aria-hidden="true"><path d={d}/></svg>;
// Tìm kiếm toàn màn hình cho điện thoại: không cần gõ dấu, lọc theo loại tệp, gợi ý ghim / mở gần đây, nút Back của máy đóng lại.
export default function MobileSearch({open,onClose}:{open:boolean;onClose:()=>void}){
 const [rows,setRows]=useState<Row[]>(cache||[]),[unlocked,setUnlocked]=useState(false),[q,setQ]=useState(''),[f,setF]=useState('all'),[loading,setLoading]=useState(!cache),[more,setMore]=useState(60);
 const input=useRef<HTMLInputElement>(null);const {pins,recent}=useStore();
 useEffect(()=>{if(!open)return;document.body.classList.add('nav-locked');setTimeout(()=>input.current?.focus(),60);
  if(!cache){fetch('/api/documents',{cache:'no-store'}).then(r=>r.ok?r.json():[]).then((d:Doc[])=>{cache=(Array.isArray(d)?d:[]).map(x=>({...x,_t:norm(x.title),_h:norm(x.title+' '+x.chapter+' '+(x.category||'')+' '+x.ext)}));setRows(cache);}).catch(()=>{}).finally(()=>setLoading(false))}
  fetch('/api/gate/bm',{cache:'no-store'}).then(r=>r.json()).then(v=>setUnlocked(!!v.unlocked)).catch(()=>{});
  history.pushState({qmsSearch:1},'');const pop=()=>onClose();window.addEventListener('popstate',pop);
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close()};window.addEventListener('keydown',key);
  return()=>{document.body.classList.remove('nav-locked');window.removeEventListener('popstate',pop);window.removeEventListener('keydown',key)}
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[open]);
 const close=()=>{if(history.state&&history.state.qmsSearch)history.back();else onClose()};
 const go=(id:string)=>{const url='/documents/'+encodeURIComponent(id);if(history.state&&history.state.qmsSearch){let done=false;const nav=()=>{if(done)return;done=true;window.removeEventListener('popstate',nav);location.href=url};window.addEventListener('popstate',nav);history.back();setTimeout(nav,350)}else location.href=url};
 const visible=useMemo(()=>rows.filter(d=>unlocked||!isGatedName(d.chapter)),[rows,unlocked]);
 const terms=norm(q).split(/\s+/).filter(Boolean);
 const result=useMemo(()=>{if(!terms.length&&f==='all')return [];const out:{d:Row;s:number}[]=[];for(const d of visible){if(f==='other'?['PDF','DOCX','XLSX'].includes(d.ext):f!=='all'&&d.ext!==f)continue;let s=0,ok=true;for(const t of terms){if(!d._h.includes(t)){ok=false;break}s+=d._t.startsWith(t)?3:d._t.includes(' '+t)?2:d._t.includes(t)?1:.2}if(ok)out.push({d,s})}out.sort((a,b)=>b.s-a.s||a.d.title.localeCompare(b.d.title,'vi'));return out.map(x=>x.d)},[visible,terms.join(' '),f]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>setMore(60),[q,f]);
 if(!open)return null;
 const empty=!terms.length&&f==='all';
 const Item=({d}:{d:{id:string;title:string;ext:string;chapter:string}})=><li><a className="ms-item" href={'/documents/'+encodeURIComponent(d.id)} onClick={e=>{e.preventDefault();go(d.id)}}><span className={'doc-type-mini '+d.ext.toLowerCase()}>{extBadge(d.ext)}</span><span className="ms-copy"><strong>{d.title}</strong><small>{d.chapter.replace(/^[0-9]+\.\s*/,'')}</small></span><span className="ms-go" aria-hidden="true">›</span></a></li>;
 return <div className="ms" role="dialog" aria-modal="true" aria-label="Tìm kiếm tài liệu">
  <div className="ms-bar"><button type="button" className="ms-back" onClick={close} aria-label="Đóng tìm kiếm"><Ico d="M15 5l-7 7 7 7"/></button><div className="ms-field"><Ico d="M20 20l-4.5-4.5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0"/><input ref={input} type="search" enterKeyHint="search" inputMode="search" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={q} onChange={e=>setQ(e.target.value)} placeholder="Tìm tên, mã, từ khóa…"/>{q&&<button type="button" className="ms-clear" onClick={()=>{setQ('');input.current?.focus()}} aria-label="Xóa">×</button>}</div></div>
  <div className="ms-filters" role="group" aria-label="Lọc theo loại tệp">{FILTERS.map(([k,l])=><button key={k} type="button" className={'ms-chip'+(f===k?' on':'')} aria-pressed={f===k} onClick={()=>setF(k)}>{l}</button>)}</div>
  <div className="ms-body">
   {empty?<>
    {pins.length>0&&<section><h3>Đã ghim</h3><ul className="ms-list">{pins.slice(0,6).map(d=><Item key={d.id} d={d}/>)}</ul></section>}
    {recent.length>0&&<section><h3>Mở gần đây</h3><ul className="ms-list">{recent.slice(0,6).map(d=><Item key={d.id} d={d}/>)}</ul></section>}
    <p className="ms-hint">{loading?'Đang tải danh mục…':`Tìm trong ${visible.length.toLocaleString('vi-VN')} tài liệu. Không cần gõ dấu: “so do” vẫn ra “Sơ đồ”.`}</p>
   </>:<>
    <p className="ms-count" role="status">{loading?'Đang tải…':`${result.length.toLocaleString('vi-VN')} kết quả`}</p>
    {result.length>0?<ul className="ms-list">{result.slice(0,more).map(d=><Item key={d.id} d={d}/>)}</ul>:!loading&&<div className="ms-empty"><strong>Không tìm thấy tài liệu</strong><span>Thử từ khóa ngắn hơn hoặc đổi bộ lọc loại tệp.</span></div>}
    {result.length>more&&<button type="button" className="ms-more" onClick={()=>setMore(m=>m+60)}>Xem thêm {Math.min(60,result.length-more)} kết quả</button>}
   </>}
  </div>
 </div>
}
