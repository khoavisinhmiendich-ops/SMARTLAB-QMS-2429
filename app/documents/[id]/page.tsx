'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import DocumentPreview from '@/components/DocumentPreview';
import UploadFiles from '@/components/UploadFiles';
import {decideOnLoad,type LocalRecord,type SavedRecord} from '@/lib/syncPolicy';
import {canonicalId,idVariants} from '@/lib/docId';
import {idbGet,idbPut,idbAddConflict} from '@/lib/idb';
import {bus,postRecord,statusTextFor} from '@/lib/sync';

const EMPTY=JSON.stringify({note:'',editedContent:''});
export default function DocumentPage(){
 const params=useParams<{id:string}>(); const id=canonicalId(params.id); // mã chuẩn: cùng một tệp luôn cùng mã ở mọi máy/hệ điều hành
 const [d,setD]=useState<any>(null),[note,setNote]=useState(''),[editedContent,setEditedContent]=useState(''),[status,setStatus]=useState(''),[editing,setEditing]=useState(false),[configured,setConfigured]=useState<boolean|null>(null),[hydrated,setHydrated]=useState(false),[replaceOpen,setReplaceOpen]=useState(false),[contentRev,setContentRev]=useState(0);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null); const localTimer=useRef<ReturnType<typeof setTimeout>|null>(null); const retryTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const lastServerPayload=useRef(''); const dirty=useRef(false); const savedAtRef=useRef(0); const latest=useRef<SavedRecord>({}); const configuredRef=useRef<boolean|null>(null); const hydratedRef=useRef(false); const saving=useRef(false); const queued=useRef(false); const syncPending=useRef(false);
 const failedBefore=useRef(false); const revRef=useRef(0); const dRef=useRef<any>(null); // revRef: số phiên bản bản ghi trên máy chủ mà thiết bị này đã nhận lần cuối
 latest.current={note,editedContent}; configuredRef.current=configured; hydratedRef.current=hydrated;
 const localKey=`smartlab-qms-record-v2:${id}`;
 const nowLabel=()=>new Date().toLocaleTimeString('vi-VN');
 const serializeNow=()=>JSON.stringify({note:latest.current.note||'',editedContent:latest.current.editedContent||''});
 // Bản lưu trong trình duyệt nằm ở IndexedDB (dung lượng lớn). localStorage chỉ còn là bản lưu dự phòng cực nhanh khi đóng thẻ và dữ liệu của phiên bản cũ: nếu mới hơn thì nhận lại rồi chuyển sang IndexedDB.
 const readLocal=useCallback(async():Promise<LocalRecord>=>{
  let idb:LocalRecord|null=null;try{const r=await idbGet(id);if(r)idb={note:r.note,editedContent:r.editedContent,savedAt:r.savedAt,rev:r.rev,unsynced:r.unsynced};}catch{}
  let ls:LocalRecord|null=null;let lsKeys:string[]=[];
  try{for(const k of [localKey,...idVariants(id).map(a=>'smartlab-qms-record-v2:'+a)]){const v=localStorage.getItem(k);if(v){lsKeys.push(k);if(!ls)ls=JSON.parse(v);}}}catch{}
  if(ls&&(!idb||(Number(ls.savedAt)||0)>(Number(idb.savedAt)||0))){try{await idbPut({id,...ls,updatedAt:Date.now()});lsKeys.forEach(k=>localStorage.removeItem(k));}catch{}return ls;}
  if(ls&&idb){try{lsKeys.forEach(k=>localStorage.removeItem(k));}catch{}}
  return idb||{};
 },[localKey,id]);
 const writeLocal=useCallback((rec:LocalRecord):Promise<boolean>=>idbPut({id,note:rec.note,editedContent:rec.editedContent,savedAt:rec.savedAt,rev:rec.rev,unsynced:rec.unsynced,updatedAt:Date.now()}).then(()=>true,()=>{bus.fail('storage','Không lưu được vào IndexedDB của trình duyệt (bộ nhớ đầy hoặc bị chặn). Hãy bấm "Lưu ngay" khi có mạng.',id);return false;}),[id]);
 const isStale=(x:any,at:number)=>!!x&&!!x.replacedAt&&['DOCX','XLSX'].includes(x.ext)&&at<x.replacedAt; // nội dung sửa trước khi tệp được thay thì không phủ lên tệp mới
 // Dùng bản của máy chủ làm nội dung đang hiển thị (và làm mốc để so sánh lần sau).
 const adoptRemote=useCallback((remote:SavedRecord,rev:number,x:any,message:string)=>{
  const at=Number(remote.savedAt)||0; const n=remote.note||''; const c=isStale(x,at)?'':remote.editedContent||'';
  dirty.current=false; revRef.current=rev; savedAtRef.current=at;
  lastServerPayload.current=JSON.stringify({note:n,editedContent:c});
  latest.current={note:n,editedContent:c}; setNote(n); setEditedContent(c);
  writeLocal({note:n,editedContent:c,savedAt:at||Date.now(),rev,unsynced:false});
  setContentRev(v=>v+1); setStatus(message);
 },[writeLocal]);
 const askConflict=()=>window.confirm('Tài liệu này vừa được cập nhật ở thiết bị khác trong lúc thiết bị này còn thay đổi chưa đồng bộ.\n\nBấm OK: dùng bản mới nhất từ máy chủ (bản của bạn vẫn được giữ lại trong trình duyệt này).\nBấm Hủy: giữ bản của bạn và ghi đè lên máy chủ (bản kia vẫn nằm trong lịch sử sao lưu của máy chủ).');
 const stashMine=(rec:LocalRecord)=>{void idbAddConflict({docId:id,...rec}).catch(()=>{try{localStorage.setItem(localKey+':conflict-'+Date.now(),JSON.stringify({...rec,stashedAt:new Date().toISOString()}))}catch{}});};
 // Máy chủ báo đã có bản mới hơn (409) khi đang lưu.
 const handleConflict=useCallback((row:any)=>{
  if(!row){revRef.current=0;queued.current=true;return;}
  const remote=(row.data||{}) as SavedRecord; const rev=Number(row.version)||0;
  if(askConflict()){stashMine({...latest.current,savedAt:savedAtRef.current,rev:revRef.current,unsynced:true});adoptRemote(remote,rev,dRef.current,'Đã cập nhật bản mới nhất từ thiết bị khác lúc '+nowLabel()+'. Bản của bạn được giữ trong trình duyệt.');}
  else{revRef.current=rev;queued.current=true;} // giữ bản của mình: lần lưu kế tiếp ghi đè có chủ đích
 },[adoptRemote]); // eslint-disable-line react-hooks/exhaustive-deps
 // Load: browser copy + server copy; quy tắc chọn bản nằm trong lib/syncPolicy.ts (dựa vào số phiên bản, không dựa vào đồng hồ máy).
 useEffect(()=>{let alive=true;setHydrated(false);dirty.current=false;lastServerPayload.current='';syncPending.current=false;revRef.current=0;
  fetch('/api/documents',{cache:'no-store'}).then(r=>r.json()).then(async(xs)=>{
   const x=xs.find((v:any)=>v.id===id); if(!alive)return; setD(x); dRef.current=x;
   if(!x){setHydrated(true);return;}
   const local=await readLocal(); const hasLocal=!!(local.note||local.editedContent);
   try{
    const r=await fetch('/api/records?document_id='+encodeURIComponent(x.id),{cache:'no-store'});
    if(r.redirected||!(r.headers.get('content-type')||'').includes('json')){bus.fail('auth','Phiên đăng nhập đã hết hạn hoặc bị chuyển hướng: hãy đăng nhập lại. Đang dùng bản lưu trong trình duyệt.',id);throw new Error('auth');}
    const v=await r.json(); if(!alive)return;
    if(!r.ok){bus.fail(r.status===503?'config':(v?.archived?'drive':'supabase'),String(v?.error||('Máy chủ lỗi HTTP '+r.status)),id);throw new Error('http');}
    bus.ok(0);
    setConfigured(!!v.configured);
    const remote=(v.data?.data||{}) as SavedRecord; const hasRemote=!!(remote.note||remote.editedContent);
    const remoteRev=Number(v.data?.version)||0; const remoteAt=Number(remote.savedAt)||Date.parse(v.data?.updated_at||'')||0;
    let choice=decideOnLoad({local,remote,remoteRev,remoteAt,serverConfigured:!!v.configured});
    if(choice==='conflict'){ if(askConflict()){stashMine(local);choice='remote';}else choice='local'; }
    if(choice==='remote'){adoptRemote(remote,remoteRev,x,'Đã tải dữ liệu đã lưu.');}
    else{
     revRef.current=remoteRev; const at=Number(local.savedAt)||0; const n=local.note||''; const c=isStale(x,at)?'':local.editedContent||'';
     savedAtRef.current=at; latest.current={note:n,editedContent:c}; setNote(n); setEditedContent(c);
     lastServerPayload.current=hasRemote?JSON.stringify({note:remote.note||'',editedContent:remote.editedContent||''}):(hasLocal?'':EMPTY);
     if(hasLocal){ if(v.configured){syncPending.current=true;setStatus('Đã khôi phục bản lưu trên trình duyệt, đang đồng bộ lên máy chủ…');}else setStatus('Đã khôi phục bản lưu tự động trên trình duyệt.'); }
    }
   }catch(err:any){
    if(!alive)return;
    if(!['auth','http'].includes(String(err?.message)))bus.fail(navigator.onLine===false?'offline':'server',navigator.onLine===false?'Mất kết nối mạng/Wi-Fi.':'Không kết nối được máy chủ ứng dụng (mạng vẫn bật).',id);
    // Chưa kết nối được máy chủ: dùng bản trong trình duyệt, sẽ tự thử kết nối lại khi lưu (configured = null).
    setConfigured(null);const at=Number(local.savedAt)||0;const n=local.note||'';const c=isStale(x,at)?'':local.editedContent||'';
    revRef.current=Number(local.rev)||0; savedAtRef.current=at; latest.current={note:n,editedContent:c}; setNote(n); setEditedContent(c);
    if(hasLocal)setStatus('Chưa kết nối được máy chủ — đang dùng bản lưu trên trình duyệt, sẽ tự đồng bộ khi có mạng.');
   }finally{if(alive)setHydrated(true)}
  }).catch(()=>{if(alive){setStatus('Không tải được danh mục tài liệu.');setHydrated(true)}});return()=>{alive=false};},[id]); // eslint-disable-line react-hooks/exhaustive-deps
 const onContentChange=useCallback((value:string)=>{dirty.current=true;setEditedContent(value)},[]);
 const saveLocal=useCallback(()=>writeLocal({note:latest.current.note||'',editedContent:latest.current.editedContent||'',savedAt:savedAtRef.current||Date.now(),rev:revRef.current,unsynced:true}),[writeLocal]);
 const mirrorLS=useCallback(()=>{try{const t=JSON.stringify({note:latest.current.note||'',editedContent:latest.current.editedContent||'',savedAt:savedAtRef.current||Date.now(),rev:revRef.current,unsynced:true});if(t.length<1500000)localStorage.setItem(localKey,t);}catch{}},[localKey]);
 const saveServer=useCallback(async(manual=false):Promise<boolean>=>{
  const rec={note:latest.current.note||'',editedContent:latest.current.editedContent||'',savedAt:savedAtRef.current||Date.now()};const serialized=JSON.stringify({note:rec.note,editedContent:rec.editedContent});
  if(serialized===lastServerPayload.current){setStatus(manual?'Đã lưu vào hệ thống và trình duyệt.':'Đã tự động lưu lúc '+nowLabel());return true;}
  if(saving.current){queued.current=true;return false;}
  saving.current=true;let ok=false;let delay=5000;
  try{
   const out=await postRecord(id,rec,revRef.current,{keepalive:true});
   if(out.kind==='ok'){if(out.version!==null)revRef.current=out.version;lastServerPayload.current=serialized;ok=true;void writeLocal({...rec,rev:revRef.current,unsynced:serializeNow()!==serialized});const recovered=failedBefore.current;failedBefore.current=false;bus.ok(recovered?1:0);setStatus(recovered?'Đã đồng bộ lên máy chủ lúc '+nowLabel()+' — các thay đổi lưu khi mất kết nối đã được đẩy lên và hiển thị đúng ở tài liệu này.':manual?'Đã lưu vào hệ thống và trình duyệt.':'Đã tự động lưu lúc '+nowLabel());}
   else if(out.kind==='conflict'){handleConflict(out.row);}
   else if(out.kind==='too-large'){failedBefore.current=true;bus.fail('storage','Nội dung quá lớn để lưu lên máy chủ (giới hạn khoảng 4 MB): hãy giảm số lượng/kích thước ảnh trong tài liệu. Bản của bạn vẫn nằm trong trình duyệt.',id);setStatus('Đã lưu trên trình duyệt; nội dung quá lớn để lưu lên máy chủ (giới hạn khoảng 4 MB). Hãy giảm số lượng/kích thước ảnh trong tài liệu.');}
   else{failedBefore.current=true;bus.fail(out.kind,out.message,id);setStatus(statusTextFor(out));if(out.kind==='offline')delay=20000;}
  }finally{saving.current=false;if(queued.current){queued.current=false;void saveServer(false);}}
  if(!ok){if(retryTimer.current)clearTimeout(retryTimer.current);retryTimer.current=setTimeout(()=>{void saveServer(false)},delay);}
  return ok;
 },[id,writeLocal,handleConflict]);
 const persist=useCallback(async(manual=false)=>{if(!hydratedRef.current)return;const okLocal=await saveLocal();
  if(configuredRef.current===null){ // lúc mở chưa kết nối được máy chủ: thử lại ngay bây giờ
   try{const r=await fetch('/api/records?document_id='+encodeURIComponent(id)+'&meta=1',{cache:'no-store'});const v=await r.json();if(r.ok&&v.configured){configuredRef.current=true;setConfigured(true);}}catch{bus.fail(navigator.onLine===false?'offline':'server',navigator.onLine===false?'Mất kết nối mạng/Wi-Fi.':'Không kết nối được máy chủ ứng dụng (mạng vẫn bật).',id);}
  }
  if(configuredRef.current===true){const ok=await saveServer(manual);if(ok&&manual)setEditing(false);}
  else if(!okLocal){setStatus('Không lưu được: bộ nhớ trình duyệt đã đầy hoặc bị chặn.');}
  else if(configuredRef.current===null){setStatus(navigator.onLine===false?'Mất mạng/Wi-Fi — đã lưu an toàn trong trình duyệt (IndexedDB), sẽ tự đẩy lên khi có mạng lại.':'Đã lưu trên trình duyệt; chưa kết nối được máy chủ — sẽ tự thử lại.');if(retryTimer.current)clearTimeout(retryTimer.current);retryTimer.current=setTimeout(()=>{void persist(false)},5000);}
  else{setStatus('Đã tự động lưu trên trình duyệt này lúc '+nowLabel()+'. Cấu hình Supabase để đồng bộ giữa thiết bị.');if(manual)setEditing(false);}
 },[id,saveLocal,saveServer]);
 // Autosave: browser copy after ~0.2s, server copy after ~0.7s of no typing. No Save button needed.
 useEffect(()=>{if(!hydrated||!d||!dirty.current)return;savedAtRef.current=Date.now();setStatus('Đang lưu tự động…');if(localTimer.current)clearTimeout(localTimer.current);if(timer.current)clearTimeout(timer.current);localTimer.current=setTimeout(()=>{saveLocal()},200);timer.current=setTimeout(()=>{void persist(false)},700);},[note,editedContent,hydrated,d,persist,saveLocal]);
 // Push a restored browser copy to the server once, right after loading.
 useEffect(()=>{if(hydrated&&configured===true&&syncPending.current){syncPending.current=false;void saveServer(false);}},[hydrated,configured,saveServer]);
 // Mất mạng/có mạng lại: báo trạng thái và đẩy NGAY các thay đổi chưa gửi (không chờ chu kỳ thử lại); đánh dấu tài liệu đang mở để bộ đẩy nền không gửi trùng.
 useEffect(()=>{bus.setActive(id);const onOnline=()=>{bus.setOnline(true);if(!hydratedRef.current)return;if(retryTimer.current)clearTimeout(retryTimer.current);if(configuredRef.current===true)void saveServer(false);else void persist(false);};const onOffline=()=>{bus.setOnline(false);if(hydratedRef.current)setStatus('Mất mạng/Wi-Fi — dữ liệu được lưu an toàn trong trình duyệt (IndexedDB) và sẽ tự đẩy lên khi có mạng lại.');};window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline);return()=>{bus.setActive(null);window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);};},[id,saveServer,persist]);
 // Never lose the last keystrokes: flush on tab hide / close / navigation.
 useEffect(()=>{const flush=()=>{if(!hydratedRef.current||!dirty.current)return;if(localTimer.current)clearTimeout(localTimer.current);saveLocal();mirrorLS();if(configuredRef.current===true)void saveServer(false);};const onVis=()=>{if(document.visibilityState==='hidden')flush()};window.addEventListener('pagehide',flush);window.addEventListener('beforeunload',flush);document.addEventListener('visibilitychange',onVis);return()=>{window.removeEventListener('pagehide',flush);window.removeEventListener('beforeunload',flush);document.removeEventListener('visibilitychange',onVis);flush();if(timer.current)clearTimeout(timer.current);if(localTimer.current)clearTimeout(localTimer.current);if(retryTimer.current)clearTimeout(retryTimer.current);};},[id,saveLocal,saveServer,mirrorLS]);
 // Đồng bộ ngược: định kỳ (10 giây), khi quay lại thẻ/cửa sổ và khi có mạng lại, kiểm tra thiết bị khác đã lưu bản mới chưa.
 // Chỉ tự cập nhật khi thiết bị này không còn thay đổi chưa lưu; nếu có thì xung đột được xử lý ở lần lưu (không ghi đè âm thầm).
 useEffect(()=>{
  if(!hydrated||configured!==true)return; let stopped=false;
  const check=async()=>{
   if(stopped||document.visibilityState!=='visible'||saving.current||!navigator.onLine)return;
   try{
    const m=await fetch('/api/records?document_id='+encodeURIComponent(id)+'&meta=1',{cache:'no-store'}); if(!m.ok)return; const mv=await m.json();
    const rr=Number(mv?.meta?.rev)||0; if(stopped||rr<=revRef.current)return;
    if(serializeNow()!==lastServerPayload.current||saving.current)return; // đang có thay đổi chưa lưu
    const f=await fetch('/api/records?document_id='+encodeURIComponent(id),{cache:'no-store'}); if(!f.ok)return; const fv=await f.json();
    if(stopped||!fv.data)return; const rrev=Number(fv.data.version)||0; if(rrev<=revRef.current)return;
    if(serializeNow()!==lastServerPayload.current||saving.current)return;
    adoptRemote((fv.data.data||{}) as SavedRecord,rrev,dRef.current,'Đã cập nhật nội dung mới từ thiết bị khác lúc '+nowLabel()+'.');
   }catch{}
  };
  const onVis=()=>{if(document.visibilityState==='visible')void check()};
  const iv=setInterval(()=>{void check()},10000);
  window.addEventListener('focus',onVis);window.addEventListener('online',onVis);document.addEventListener('visibilitychange',onVis);
  return()=>{stopped=true;clearInterval(iv);window.removeEventListener('focus',onVis);window.removeEventListener('online',onVis);document.removeEventListener('visibilitychange',onVis);};
 },[hydrated,configured,id,adoptRemote]); // eslint-disable-line react-hooks/exhaustive-deps
 const save=async()=>{if(timer.current)clearTimeout(timer.current);if(localTimer.current)clearTimeout(localTimer.current);savedAtRef.current=Date.now();await persist(true)};
 if(!d)return <main className="main"><div className="empty-state">Đang tải tài liệu…</div></main>;
 const directEditable=['DOCX','XLSX'].includes(d.ext);
 const ver=String(d.replacedAt||'')+'|'+String(d.updatedAt||'');const withVer=(u:string)=>u+(u.includes('?')?'&':'?')+'v='+encodeURIComponent(ver);
 return <main className="main document-detail"><div className="viewer"><div className="viewer-head"><div style={{display:'flex',alignItems:'center',gap:14,minWidth:0}}><Link className="btn" style={{flexShrink:0,whiteSpace:'nowrap'}} href={'/?chapter='+encodeURIComponent(d.chapter||'')}>← Quay lại</Link><div><strong>{d.title}</strong><div className="meta">{d.chapter}{d.category?' · '+d.category:''} · {d.ext}</div></div></div><div className="actions"><Link className="btn" href="/#library">← Danh mục</Link>{directEditable&&<button className="btn primary" type="button" onClick={()=>{setEditing(v=>!v);setStatus(editing?'Đã thoát chế độ chỉnh sửa.':'Chế độ chỉnh sửa đang bật — bấm vào nội dung để sửa.')}}>{editing?'Kết thúc chỉnh sửa':'✎ Chỉnh sửa trực tiếp'}</button>}<button className="btn" type="button" onClick={()=>setReplaceOpen(true)} title="Thay tài liệu này bằng tệp mới">⬆ Thay tệp</button><a className="btn primary" href={d.path} download>Tải bản gốc ↓</a></div></div>
 {directEditable&&<div className={'edit-banner '+(editing?'editing':'')}>{editing?'ĐANG CHỈNH SỬA · Có thể sửa chữ, bảng, kéo mép ô để đổi độ rộng cột/chiều cao hàng.':'Chế độ xem · Nhấn “Chỉnh sửa trực tiếp” để sửa nội dung Word/Excel.'}<span>{status||'Lưu tự động đang bật'} · Tệp gốc không bị ghi đè.</span></div>}
 {hydrated?<DocumentPreview key={ver+'|'+contentRev} src={withVer(d.path)} ext={d.ext} title={d.title} counterpart={d.counterpart?withVer(d.counterpart):d.counterpart} editable={editing} savedContent={editedContent} onContentChange={onContentChange}/>:<div className="preview-message">Đang tải dữ liệu đã lưu…</div>}
 <div className="form-panel"><h3>{d.ext==='PDF'?'Dữ liệu chỉnh sửa / ghi nhận PDF':'Ghi chú và lưu chỉnh sửa'}</h3><p className="meta">{configured===false?'Tự động lưu cục bộ trên trình duyệt; để lưu lâu dài và đồng bộ giữa máy, cấu hình Supabase trong .env.local.':'Thay đổi được tự động lưu sau khi ngừng nhập khoảng 1 giây.'} {d.ext==='PDF'?'PDF gốc được giữ nguyên; nội dung bổ sung được lưu tại hồ sơ.':''}</p>{d.ext==='PDF'&&<div className="field"><label>Nội dung chỉnh sửa / dữ liệu cần ghi nhận</label><textarea rows={7} value={editedContent} onChange={e=>{dirty.current=true;setEditedContent(e.target.value)}} placeholder="Nhập dữ liệu, nội dung đã chỉnh sửa hoặc ghi nhận liên quan đến PDF…"/></div>}<div className="field"><label>Ghi chú / dữ liệu hồ sơ</label><textarea rows={4} value={note} onChange={e=>{dirty.current=true;setNote(e.target.value)}} placeholder="Nhập ghi chú cho hồ sơ này…"/></div><div className="edit-save-row"><button className="btn primary" type="button" onClick={save}>Lưu ngay</button><span className="save" role="status">{status||'Tự động lưu đang bật'}</span></div></div></div><UploadFiles open={replaceOpen} folders={[]} defaultFolder="" existing={[]} target={{id:d.id,title:d.title,ext:d.ext}} onClose={()=>setReplaceOpen(false)} onDone={()=>{setTimeout(()=>window.location.reload(),900)}}/></main>
}
