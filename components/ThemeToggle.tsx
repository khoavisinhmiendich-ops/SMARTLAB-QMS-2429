'use client';
import {useEffect,useState} from 'react';
// Chuyển giao diện Tối (công nghệ) ↔ Sáng. Lưu trên thiết bị; mặc định là giao diện tối.
export default function ThemeToggle({label=false}:{label?:boolean}){
 const [dark,setDark]=useState(true);
 useEffect(()=>{setDark(document.documentElement.classList.contains('tech'))},[]);
 const flip=()=>{const next=!dark;setDark(next);document.documentElement.classList.toggle('tech',next);try{localStorage.setItem('qms-theme',next?'dark':'light')}catch{}};
 return <button type="button" className={'theme-toggle'+(label?' with-label':'')} onClick={flip} aria-pressed={dark} title={dark?'Chuyển sang giao diện sáng':'Chuyển sang giao diện tối'}>
  <svg viewBox="0 0 24 24" aria-hidden="true">{dark?<path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>:<path d="M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>}</svg>
  {label&&<span>{dark?'Giao diện sáng':'Giao diện tối'}</span>}
 </button>
}
