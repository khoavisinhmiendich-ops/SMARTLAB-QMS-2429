'use client';
import {useEffect,useState} from 'react';
export default function LiveClock(){
 const [now,setNow]=useState<Date|null>(null);
 useEffect(()=>{const tick=()=>setNow(new Date());tick();const id=window.setInterval(tick,1000);return()=>window.clearInterval(id)},[]);
 const date=now?new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).format(now):'Đang đồng bộ ngày giờ…';
 const time=now?new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now):'--:--:--';
 return <div className="live-clock" aria-label="Ngày giờ Việt Nam"><span className="clock-icon">◷</span><span className="clock-copy"><strong>{time}</strong><small>{date}</small></span><i className="live-dot"/></div>
}
