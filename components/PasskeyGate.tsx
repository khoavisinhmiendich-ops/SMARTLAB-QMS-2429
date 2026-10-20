'use client';
import {FormEvent,useEffect,useRef,useState} from 'react';
// Hộp nhập passkey khi mở thư mục được bảo vệ (ví dụ "Các BM khác"). Passkey được kiểm tra ở máy chủ.
export default function PasskeyGate({open,name,onClose,onUnlocked}:{open:boolean;name:string;onClose:()=>void;onUnlocked:()=>void}){
 const [pass,setPass]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const ref=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(open){setPass('');setError('');const t=setTimeout(()=>ref.current?.focus(),30);return()=>clearTimeout(t)}},[open]);
 useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[open,onClose]);
 if(!open)return null;
 async function submit(e:FormEvent){
  e.preventDefault();if(busy||!pass)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/gate/bm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passkey:pass})});
   const d=await r.json().catch(()=>({}));
   if(!r.ok){setError(d.error||'Không thể mở khóa.');setPass('');ref.current?.focus();return;}
   setPass('');onUnlocked();
  }catch{setError('Không kết nối được máy chủ. Vui lòng thử lại.')}
  finally{setBusy(false)}
 }
 return <div className="gate-backdrop" role="dialog" aria-modal="true" aria-labelledby="gate-title" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <form className="gate-card" onSubmit={submit}>
   <div className="gate-icon"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3 M12 14v3"/></svg></div>
   <h3 id="gate-title">Nhập passkey để mở</h3>
   <p className="gate-desc">Thư mục <b>“{name}”</b> được bảo vệ. Vui lòng nhập passkey để xem nội dung.</p>
   <input ref={ref} className="gate-input" type="password" autoComplete="off" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Passkey" aria-label="Passkey" maxLength={200}/>
   {error&&<div className="gate-error" role="alert">{error}</div>}
   <div className="gate-actions"><button type="button" className="gate-cancel" onClick={onClose}>Hủy</button><button type="submit" className="gate-submit" disabled={busy||!pass}>{busy?'Đang kiểm tra…':'Mở khóa'}</button></div>
   <div className="gate-note">Mọi lần nhập sai đều được ghi vào nhật ký bảo mật. Nhập sai nhiều lần sẽ bị tạm khóa.</div>
  </form>
 </div>
}
