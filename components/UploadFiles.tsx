'use client';
import {DragEvent,FormEvent,useEffect,useRef,useState} from 'react';
import {normFileName} from '@/lib/filename';
type Folder={folder:string;label:string};
type Existing={key:string;label:string};
type Result={name:string;status:'replaced'|'added'|'error';message:string};
// Hộp "Thêm tệp": tệp trùng tên với tệp đã có sẽ thay thế tệp cũ; tệp mới được thêm vào thư mục đã chọn.
// Khi có `target` (mở từ trang chi tiết): thay đúng tài liệu đang xem bằng 1 tệp cùng định dạng, tên tệp mới tùy ý.
export default function UploadFiles({open,folders,defaultFolder,existing,target,onClose,onDone}:{open:boolean;folders:Folder[];defaultFolder:string;existing:Existing[];target?:{id:string;title:string;ext:string};onClose:()=>void;onDone:()=>void}){
 const [files,setFiles]=useState<File[]>([]),[folder,setFolder]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[results,setResults]=useState<Result[]>([]),[drag,setDrag]=useState(false);
 const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(open){setFiles([]);setError('');setResults([]);setDrag(false);setFolder(defaultFolder||folders[0]?.folder||'')}},[open]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[open,busy,onClose]);
 if(!open)return null;
 const accept=target?'.'+target.ext.toLowerCase()+(target.ext==='JPG'||target.ext==='JPEG'?',.jpg,.jpeg':''):'.docx,.pdf,.xlsx,.jpg,.jpeg,.png';
 const map=new Map(existing.map(x=>[x.key,x.label]));
 const pick=(list:File[])=>{setResults([]);setError('');setFiles(target?list.slice(0,1):list)};
 const onDrop=(e:DragEvent)=>{e.preventDefault();setDrag(false);pick(Array.from(e.dataTransfer.files||[]))};
 async function submit(e:FormEvent){
  e.preventDefault();if(busy||!files.length)return;setBusy(true);setError('');setResults([]);
  try{
   const fd=new FormData();files.forEach(f=>fd.append('files',f));
   if(target)fd.append('target',target.id);else fd.append('folder',folder);
   const r=await fetch('/api/files/upload',{method:'POST',body:fd});const d=await r.json().catch(()=>({}));
   if(!r.ok){setError(d.error||'Không tải lên được.');return;}
   setResults(d.results||[]);setFiles([]);if(input.current)input.current.value='';
   if((d.results||[]).some((x:Result)=>x.status!=='error'))onDone();
  }catch{setError('Không kết nối được máy chủ. Vui lòng thử lại.')}
  finally{setBusy(false)}
 }
 return <div className="gate-backdrop" role="dialog" aria-modal="true" aria-labelledby="upl-title" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
  <form className="gate-card upl-card" onSubmit={submit}>
   <h3 id="upl-title">{target?'Thay tệp đang xem':'Thêm tệp tài liệu'}</h3>
   <p className="gate-desc">{target?<>Chọn tệp mới để thay thế <b>{target.title}</b>. Nội dung và các công cụ Word/Excel sẽ áp dụng cho tệp mới; tệp cũ được lưu bản sao lưu.</>:<>Tệp <b>trùng tên</b> với tệp đã có sẽ <b>tự động thay thế tệp cũ</b> (tệp cũ được lưu bản sao lưu, dữ liệu khác không bị ảnh hưởng). Tệp mới được thêm vào thư mục bên dưới.</>}</p>
   <label className="upl-label" htmlFor="upl-files">{target?`Chọn tệp ${target.ext} mới`:'Chọn tệp (.docx, .pdf, .xlsx, .jpg, .png)'} hoặc kéo thả vào đây</label>
   <div className={'upl-drop'+(drag?' over':'')} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={onDrop}>
    <input id="upl-files" ref={input} className="upl-file" type="file" multiple={!target} accept={accept} onChange={e=>pick(Array.from(e.target.files||[]))}/>
   </div>
   {files.length>0&&<ul className="upl-results">{files.map((f,i)=>{const hit=target?target.title:map.get(normFileName(f.name));return <li key={i} className={hit?'upl-replaced':'upl-added'}><b>{f.name}</b><span>{hit?`Sẽ thay thế tệp cũ${target?'':' trong “'+hit+'”'}`:'Tệp mới — sẽ thêm vào thư mục đã chọn'}</span></li>})}</ul>}
   {!target&&<><label className="upl-label" htmlFor="upl-folder">Thư mục cho tệp mới</label>
   <select id="upl-folder" className="gate-input" value={folder} onChange={e=>setFolder(e.target.value)}>{folders.map(f=><option key={f.folder} value={f.folder}>{f.label}</option>)}</select></>}
   {error&&<div className="gate-error" role="alert">{error}</div>}
   {results.length>0&&<ul className="upl-results">{results.map((r,i)=><li key={i} className={'upl-'+r.status}><b>{r.name}</b><span>{r.message}</span></li>)}</ul>}
   <div className="gate-actions"><button type="button" className="gate-cancel" onClick={onClose} disabled={busy}>Đóng</button><button type="submit" className="gate-submit" disabled={busy||!files.length}>{busy?'Đang tải lên…':files.length?`${target?'Thay tệp':'Tải lên'} (${files.length})`:target?'Thay tệp':'Tải lên'}</button></div>
  </form>
 </div>
}
