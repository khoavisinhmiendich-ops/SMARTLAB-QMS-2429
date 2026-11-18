'use client';
import { FormEvent, useEffect, useState } from 'react';
import LoginHello from '@/components/LoginHello';
import LoginScene from '@/components/LoginScene';
import InstallApp from '@/components/InstallApp';
const Ico=({d}:{d:string})=><svg viewBox="0 0 24 24" aria-hidden="true"><path d={d}/></svg>;
const SHIELD='M12 3 20 6v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6z M9 12l2 2 4-4';
// Số liệu chạy từ 0 khi mở màn hình khóa (tắt nếu máy bật "giảm chuyển động").
function Count({to}:{to:number}){
 const [v,setV]=useState(0);
 useEffect(()=>{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setV(to);return}let raf=0;const t0=performance.now()+500;const f=(t:number)=>{const k=Math.min(1,Math.max(0,(t-t0)/1400));setV(Math.round(to*(1-Math.pow(1-k,3))));if(k<1)raf=requestAnimationFrame(f)};raf=requestAnimationFrame(f);return()=>cancelAnimationFrame(raf)},[to]);
 return <>{v}</>;
}
function Clock(){
 const [t,setT]=useState('');
 useEffect(()=>{const f=()=>setT(new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()));f();const id=window.setInterval(f,1000);return()=>window.clearInterval(id)},[]);
 return <time className="lx-clock">{t||'--:--:--'}</time>;
}
export default function LoginPage(){
 const [username,setUsername]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 const [show,setShow]=useState(false),[caps,setCaps]=useState(false),[focus,setFocus]=useState(false),[opened,setOpened]=useState(false),[shake,setShake]=useState(0);
 async function submit(e:FormEvent){e.preventDefault();setError('');setBusy(true);let ok=false;try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Không thể đăng nhập.');ok=true;setOpened(true);const next=new URLSearchParams(location.search).get('next');const to=next&&/^\/(?![\/\\])/.test(next)?next:'/';window.setTimeout(()=>{location.href=to},700);}catch(err){setError(err instanceof Error?err.message:'Có lỗi xảy ra.');setShake(n=>n+1);}finally{if(!ok)setBusy(false)}}
 const capsCheck=(e:React.KeyboardEvent<HTMLInputElement>)=>setCaps(e.getModifierState&&e.getModifierState('CapsLock'));
 return <main className="lx">
  <LoginScene/>
  <header className="lx-top">
   <div className="lx-brand"><span className="lx-logo"><Ico d={SHIELD}/></span><div><strong>SMARTLAB <em>QMS</em></strong><small>QUALITY MANAGEMENT SYSTEM</small></div></div>
   <div className="lx-status"><span className="lx-live"><i/>Hệ thống sẵn sàng</span><Clock/></div>
  </header>
  <div className="lx-grid">
   <section className="lx-hero" aria-label="Giới thiệu hệ thống">
    <LoginHello/>
    <div className="lx-stats" aria-label="Quy mô bộ tiêu chí">
     <div><strong><Count to={12}/></strong><span>chương</span></div>
     <div><strong><Count to={169}/></strong><span>tiêu chí</span></div>
     <div><strong><Count to={268}/></strong><span>điểm</span></div>
    </div>
    <ul className="lx-points">
     <li><Ico d={SHIELD}/><span>Theo <b>Quyết định 2429/QĐ-BYT</b> của Bộ Y tế</span></li>
     <li><Ico d="M6 3h8l5 5v13H6z M14 3v6h5 M9 13h7 M9 17h7"/><span>Xem, sửa Word · Excel · PDF trực tiếp</span></li>
     <li><Ico d="M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M11 18h2"/><span>Dùng trên điện thoại và máy tính</span></li>
    </ul>
   </section>
   <section className="lx-main">
    <div key={shake} className={'lx-card'+(shake?' lx-shake':'')+(opened?' is-open':'')}>
     <div className={'lx-emblem'+(focus?' is-typing':'')+(opened?' is-open':'')} aria-hidden="true">
      <svg viewBox="0 0 96 96"><circle className="lx-ring r1" cx="48" cy="48" r="45"/><circle className="lx-ring r2" cx="48" cy="48" r="39"/><circle className="lx-core" cx="48" cy="48" r="31"/><path className="lx-shackle" d="M39 45v-6a9 9 0 0 1 18 0v6"/><rect className="lx-lockbody" x="33" y="45" width="30" height="21" rx="5"/><circle className="lx-key" cx="48" cy="54.5" r="2.8"/><path className="lx-key" d="M48 57v4"/></svg>
     </div>
     <div className="lock-eyebrow"><i/> HỆ THỐNG QUẢN LÝ CHẤT LƯỢNG</div>
     <h1>Đăng nhập hệ thống</h1>
     <p className="lx-desc">Bệnh viện Phong - Da liễu Trung ương Quy Hòa<br/>Khoa Vi sinh - Miễn dịch · QMS 2429</p>
     <form onSubmit={submit} className="lx-form">
      <label htmlFor="username">Tên đăng nhập</label>
      <div className="lx-field"><Ico d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6"/><input id="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={e=>setUsername(e.target.value)} onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)} placeholder="Nhập tên đăng nhập" required/></div>
      <label htmlFor="password">Mật khẩu</label>
      <div className="lx-field"><Ico d="M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/><input id="password" type={show?'text':'password'} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} onKeyUp={capsCheck} onKeyDown={capsCheck} onFocus={()=>setFocus(true)} onBlur={()=>{setFocus(false);setCaps(false)}} placeholder="Nhập mật khẩu" required/><button type="button" className="lx-eye" onClick={()=>setShow(v=>!v)} aria-label={show?'Ẩn mật khẩu':'Hiện mật khẩu'} aria-pressed={show}><Ico d={show?'M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.4.8-1.3 2.1-2.7 3.3M6.6 7.6C4.4 9 3 11 2.5 12c1 1.8 4.5 6 9.5 6 1.5 0 2.8-.4 4-.9M9.9 9.9a3 3 0 0 0 4.2 4.2':'M2.5 12C3.5 10.2 7 6 12 6s8.5 4.2 9.5 6c-1 1.8-4.5 6-9.5 6s-8.5-4.2-9.5-6z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'}/></button></div>
      {caps&&<div className="lx-caps" role="status">Đang bật Caps Lock</div>}
      {error&&<div className="lock-error" role="alert">{error}</div>}
      <button className="lx-submit" type="submit" disabled={busy}><span>{opened?'Đã mở khóa':busy?'Đang xác thực…':'Mở khóa hệ thống'}</span> <b aria-hidden="true">{busy&&!opened?<i className="lx-spin"/>:'→'}</b></button>
     </form>
     <div className="lx-secure"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={SHIELD}/></svg><span>Kết nối bảo vệ · Phiên đăng nhập có thời hạn</span></div>
     <InstallApp/>
     <footer className="lx-foot">© 2026 SMARTLAB QMS <span>·</span> Quality · Compliance · Improvement</footer>
    </div>
   </section>
  </div>
 </main>
}
