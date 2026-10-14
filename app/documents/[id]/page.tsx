'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import DocumentPreview from '@/components/DocumentPreview';

type SavedRecord={note?:string;editedContent?:string;savedAt?:number};
export default function DocumentPage(){
 const params=useParams<{id:string}>(); const id=params.id;
 const [d,setD]=useState<any>(null),[note,setNote]=useState(''),[editedContent,setEditedContent]=useState(''),[status,setStatus]=useState(''),[editing,setEditing]=useState(false),[configured,setConfigured]=useState<boolean|null>(null),[hydrated,setHydrated]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null); const localTimer=useRef<ReturnType<typeof setTimeout>|null>(null); const retryTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const lastServerPayload=useRef(''); const dirty=useRef(false); const savedAtRef=useRef(0); const latest=useRef<SavedRecord>({}); const configuredRef=useRef<boolean|null>(null); const hydratedRef=useRef(false); const saving=useRef(false); const queued=useRef(false); const syncPending=useRef(false);
 latest.current={note,editedContent}; configuredRef.current=configured; hydratedRef.current=hydrated;
 const localKey=`smartlab-qms-record-v2:${id}`;
 const nowLabel=()=>new Date().toLocaleTimeString('vi-VN');
 // Load: browser copy + server copy, the NEWEST one wins (so edits are never lost if one side was unavailable).
 useEffect(()=>{let alive=true;setHydrated(false);dirty.current=false;lastServerPayload.current='';syncPending.current=false;fetch('/api/documents',{cache:'no-store'}).then(r=>r.json()).then(async(xs)=>{const x=xs.find((v:any)=>v.id===id);if(!alive)return;setD(x);if(!x){setHydrated(true);return;}let local:SavedRecord={};try{local=JSON.parse(localStorage.getItem(`smartlab-qms-record-v2:${id}`)||'{}')}catch{}const hasLocal=!!(local.note||local.editedContent);
   try{const r=await fetch('/api/records?document_id='+encodeURIComponent(x.id),{cache:'no-store'});const v=await r.json();if(!alive)return;setConfigured(!!v.configured);const remote=(v.data?.data||{}) as SavedRecord;const hasRemote=!!(remote.note||remote.editedContent);const remoteAt=Number(remote.savedAt)||Date.parse(v.data?.updated_at||'')||0;const localAt=Number(local.savedAt)||0;const useRemote=hasRemote&&(!hasLocal||remoteAt>=localAt);const chosen=useRemote?remote:local;setNote(chosen.note||'');setEditedContent(chosen.editedContent||'');savedAtRef.current=Number(chosen.savedAt)||(useRemote?remoteAt:0)||0;lastServerPayload.current=useRemote?JSON.stringify({note:chosen.note||'',editedContent:chosen.editedContent||''}):'';
    if(useRemote){try{localStorage.setItem(`smartlab-qms-record-v2:${id}`,JSON.stringify({note:chosen.note||'',editedContent:chosen.editedContent||'',savedAt:savedAtRef.current||Date.now()}))}catch{}setStatus('Đã tải dữ liệu đã lưu.');}else if(hasLocal){if(v.configured){syncPending.current=true;setStatus('Đã khôi phục bản lưu trên trình duyệt, đang đồng bộ lên máy chủ…');}else setStatus('Đã khôi phục bản lưu tự động trên trình duyệt.');}
   }catch{if(!alive)return;setConfigured(false);setNote(local.note||'');setEditedContent(local.editedContent||'');savedAtRef.current=Number(local.savedAt)||0;if(hasLocal)setStatus('Đã khôi phục bản lưu tự động trên trình duyệt.');}finally{if(alive)setHydrated(true)}
  }).catch(()=>{if(alive){setStatus('Không tải được danh mục tài liệu.');setHydrated(true)}});return()=>{alive=false};},[id]);
 const onContentChange=useCallback((value:string)=>{dirty.current=true;setEditedContent(value)},[]);
 const saveLocal=useCallback(()=>{try{localStorage.setItem(localKey,JSON.stringify({note:latest.current.note||'',editedContent:latest.current.editedContent||'',savedAt:savedAtRef.current||Date.now()}));return true}catch{return false}},[localKey]);
 const saveServer=useCallback(async(manual=false):Promise<boolean>=>{
  const rec={note:latest.current.note||'',editedContent:latest.current.editedContent||'',savedAt:savedAtRef.current||Date.now()};const serialized=JSON.stringify({note:rec.note,editedContent:rec.editedContent});
  if(serialized===lastServerPayload.current){setStatus(manual?'Đã lưu vào hệ thống và trình duyệt.':'Đã tự động lưu lúc '+nowLabel());return true;}
  if(saving.current){queued.current=true;return false;}
  saving.current=true;let ok=false;
  try{const body=JSON.stringify({document_id:id,data:rec,user_id:'anonymous'});const r=await fetch('/api/records',{method:'POST',headers:{'content-type':'application/json'},body,keepalive:body.length<60000});
   if(r.ok){lastServerPayload.current=serialized;ok=true;setStatus(manual?'Đã lưu vào hệ thống và trình duyệt.':'Đã tự động lưu lúc '+nowLabel());}else{const v=await r.json().catch(()=>null);setStatus('Đã lưu trên trình duyệt; lưu máy chủ lỗi: '+(v?.error||'hãy kiểm tra cấu hình lưu trữ'));}
  }catch{setStatus('Đã lưu trên trình duyệt; chưa kết nối được máy chủ — sẽ tự thử lại.');}
  finally{saving.current=false;if(queued.current){queued.current=false;void saveServer(false);}}
  if(!ok){if(retryTimer.current)clearTimeout(retryTimer.current);retryTimer.current=setTimeout(()=>{void saveServer(false)},5000);}
  return ok;
 },[id]);
 const persist=useCallback(async(manual=false)=>{if(!hydratedRef.current)return;const okLocal=saveLocal();
  if(configuredRef.current===true){const ok=await saveServer(manual);if(ok&&manual)setEditing(false);}
  else if(!okLocal){setStatus('Không lưu được: bộ nhớ trình duyệt đã đầy hoặc bị chặn.');}
  else{setStatus('Đã tự động lưu trên trình duyệt này lúc '+nowLabel()+'. Cấu hình Supabase để đồng bộ giữa thiết bị.');if(manual)setEditing(false);}
 },[saveLocal,saveServer]);
 // Autosave: browser copy after ~0.2s, server copy after ~0.7s of no typing. No Save button needed.
 useEffect(()=>{if(!hydrated||!d||!dirty.current)return;savedAtRef.current=Date.now();setStatus('Đang lưu tự động…');if(localTimer.current)clearTimeout(localTimer.current);if(timer.current)clearTimeout(timer.current);localTimer.current=setTimeout(()=>{saveLocal()},200);timer.current=setTimeout(()=>{void persist(false)},700);},[note,editedContent,hydrated,d,persist,saveLocal]);
 // Push a restored browser copy to the server once, right after loading.
 useEffect(()=>{if(hydrated&&configured===true&&syncPending.current){syncPending.current=false;void saveServer(false);}},[hydrated,configured,saveServer]);
 // Never lose the last keystrokes: flush on tab hide / close / navigation.
 useEffect(()=>{const flush=()=>{if(!hydratedRef.current||!dirty.current)return;if(localTimer.current)clearTimeout(localTimer.current);saveLocal();if(configuredRef.current===true)void saveServer(false);};const onVis=()=>{if(document.visibilityState==='hidden')flush()};window.addEventListener('pagehide',flush);window.addEventListener('beforeunload',flush);document.addEventListener('visibilitychange',onVis);return()=>{window.removeEventListener('pagehide',flush);window.removeEventListener('beforeunload',flush);document.removeEventListener('visibilitychange',onVis);flush();if(timer.current)clearTimeout(timer.current);if(localTimer.current)clearTimeout(localTimer.current);if(retryTimer.current)clearTimeout(retryTimer.current);};},[id,saveLocal,saveServer]);
 const save=async()=>{if(timer.current)clearTimeout(timer.current);if(localTimer.current)clearTimeout(localTimer.current);savedAtRef.current=Date.now();await persist(true)};
 if(!d)return <main className="main"><div className="empty-state">Đang tải tài liệu…</div></main>;
 const directEditable=['DOCX','XLSX'].includes(d.ext);
 return <main className="main document-detail"><div className="viewer"><div className="viewer-head"><div><strong>{d.title}</strong><div className="meta">{d.chapter}{d.category?' · '+d.category:''} · {d.ext}</div></div><div className="actions"><Link className="btn" href="/#library">← Danh mục</Link>{directEditable&&<button className="btn primary" type="button" onClick={()=>{setEditing(v=>!v);setStatus(editing?'Đã thoát chế độ chỉnh sửa.':'Chế độ chỉnh sửa đang bật — bấm vào nội dung để sửa.')}}>{editing?'Kết thúc chỉnh sửa':'✎ Chỉnh sửa trực tiếp'}</button>}<a className="btn primary" href={d.path} download>Tải bản gốc ↓</a></div></div>
 {directEditable&&<div className={'edit-banner '+(editing?'editing':'')}>{editing?'ĐANG CHỈNH SỬA · Có thể sửa chữ, bảng, kéo mép ô để đổi độ rộng cột/chiều cao hàng.':'Chế độ xem · Nhấn “Chỉnh sửa trực tiếp” để sửa nội dung Word/Excel.'}<span>{status||'Lưu tự động đang bật'} · Tệp gốc không bị ghi đè.</span></div>}
 {hydrated?<DocumentPreview src={d.path} ext={d.ext} title={d.title} counterpart={d.counterpart} editable={editing} savedContent={editedContent} onContentChange={onContentChange}/>:<div className="preview-message">Đang tải dữ liệu đã lưu…</div>}
 <div className="form-panel"><h3>{d.ext==='PDF'?'Dữ liệu chỉnh sửa / ghi nhận PDF':'Ghi chú và lưu chỉnh sửa'}</h3><p className="meta">{configured===false?'Tự động lưu cục bộ trên trình duyệt; để lưu lâu dài và đồng bộ giữa máy, cấu hình Supabase trong .env.local.':'Thay đổi được tự động lưu sau khi ngừng nhập khoảng 1 giây.'} {d.ext==='PDF'?'PDF gốc được giữ nguyên; nội dung bổ sung được lưu tại hồ sơ.':''}</p>{d.ext==='PDF'&&<div className="field"><label>Nội dung chỉnh sửa / dữ liệu cần ghi nhận</label><textarea rows={7} value={editedContent} onChange={e=>{dirty.current=true;setEditedContent(e.target.value)}} placeholder="Nhập dữ liệu, nội dung đã chỉnh sửa hoặc ghi nhận liên quan đến PDF…"/></div>}<div className="field"><label>Ghi chú / dữ liệu hồ sơ</label><textarea rows={4} value={note} onChange={e=>{dirty.current=true;setNote(e.target.value)}} placeholder="Nhập ghi chú cho hồ sơ này…"/></div><div className="edit-save-row"><button className="btn primary" type="button" onClick={save}>Lưu ngay</button><span className="save" role="status">{status||'Tự động lưu đang bật'}</span></div></div></div></main>
}
