'use client';
import {useEffect,useState} from 'react';
type PromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
const DownIcon=()=><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14"/></svg>;
// Nút "Cài ứng dụng": Android/Chrome/Edge/máy tính cài trực tiếp; iPhone/iPad (Safari) hiện hướng dẫn "Thêm vào MH chính".
export default function InstallApp({compact=false}:{compact?:boolean}){
 const [ready,setReady]=useState(false),[standalone,setStandalone]=useState(false),[ios,setIos]=useState(false),[help,setHelp]=useState(false),[tick,setTick]=useState(0);
 useEffect(()=>{
  const ua=navigator.userAgent||'';
  const isIos=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const isStandalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as unknown as {standalone?:boolean}).standalone===true;
  setIos(isIos);setStandalone(isStandalone);setReady(true);
  const on=()=>setTick(t=>t+1);window.addEventListener('qms-install-ready',on);return()=>window.removeEventListener('qms-install-ready',on);
 },[]);
 const ev=ready?(window as unknown as {__qmsInstall?:PromptEvent}).__qmsInstall:undefined;void tick;
 if(!ready||standalone||(!ev&&!ios))return null;
 const click=async()=>{
  if(ev){try{await ev.prompt();await ev.userChoice}catch{}(window as unknown as {__qmsInstall?:PromptEvent}).__qmsInstall=undefined;setTick(t=>t+1);return}
  setHelp(true);
 };
 const btn=<button type="button" className={'install-btn'+(compact?' install-compact':'')} onClick={click} title="Cài ứng dụng QMS 2429 lên thiết bị"><DownIcon/><span>Cài ứng dụng</span></button>;
 return <>{compact?btn:<div className="install-wrap">{btn}</div>}
  {help&&<div className="install-modal-back" role="dialog" aria-modal="true" onClick={()=>setHelp(false)}><div className="install-modal" onClick={e=>e.stopPropagation()}><h3>Cài ứng dụng lên iPhone / iPad</h3><p>Mở trang này bằng <b>Safari</b>, sau đó:</p><ol><li>Bấm nút <b>Chia sẻ</b> (hình vuông có mũi tên lên).</li><li>Chọn <b>Thêm vào MH chính</b> (Add to Home Screen).</li><li>Bấm <b>Thêm</b> — biểu tượng QMS 2429 sẽ xuất hiện trên màn hình chính.</li></ol><button type="button" className="install-close" onClick={()=>setHelp(false)}>Đã hiểu</button></div></div>}</>;
}
