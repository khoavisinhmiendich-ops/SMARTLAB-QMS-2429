'use client';
import {useEffect} from 'react';
// Đăng ký service worker (để trình duyệt cho phép "Cài đặt ứng dụng") và giữ lại sự kiện cài đặt cho nút "Cài ứng dụng".
export default function PwaRegister(){
 useEffect(()=>{
  const w=window as unknown as {__qmsInstall?:Event};
  const onPrompt=(e:Event)=>{e.preventDefault();w.__qmsInstall=e;window.dispatchEvent(new Event('qms-install-ready'))};
  const onInstalled=()=>{w.__qmsInstall=undefined;window.dispatchEvent(new Event('qms-install-ready'))};
  window.addEventListener('beforeinstallprompt',onPrompt);window.addEventListener('appinstalled',onInstalled);
  if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{})}
  return()=>{window.removeEventListener('beforeinstallprompt',onPrompt);window.removeEventListener('appinstalled',onInstalled)};
 },[]);
 return null;
}
