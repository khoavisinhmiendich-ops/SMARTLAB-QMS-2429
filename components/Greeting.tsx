'use client';
import {useEffect,useState} from 'react';
// Lời chào theo đồng hồ giờ Việt Nam: sáng 05–10h, trưa 11–12h, chiều 13–17h, tối 18–04h.
function period(h:number){
 if(h>=5&&h<11)return {word:'buổi sáng',icon:'🌅'};
 if(h>=11&&h<13)return {word:'buổi trưa',icon:'☀️'};
 if(h>=13&&h<18)return {word:'buổi chiều',icon:'🌇'};
 return {word:'buổi tối',icon:'🌙'};
}
const hourVN=()=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',hour12:false}).format(new Date()))%24;
export default function Greeting(){
 const [h,setH]=useState<number|null>(null);
 useEffect(()=>{const tick=()=>setH(hourVN());tick();const id=window.setInterval(tick,30000);return()=>window.clearInterval(id)},[]);
 if(h===null)return <div className="home-greeting cooky" style={{visibility:'hidden'}} aria-hidden="true"><span className="home-greeting-text">Xin chào</span></div>;
 const p=period(h);
 return <div className="home-greeting cooky" key={p.word} role="status" aria-live="polite"><span className="home-greeting-ico" aria-hidden="true">{p.icon}</span><span className="home-greeting-text">Xin chào {p.word}</span></div>;
}
