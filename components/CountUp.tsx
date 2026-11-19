'use client';
import {useEffect,useRef,useState} from 'react';
// Số liệu chạy từ 0 đến giá trị thật (một lần khi hiện); máy bật "giảm chuyển động" thì hiện luôn.
export default function CountUp({n}:{n:number}){
 const [v,setV]=useState(n);const shown=useRef(false);
 useEffect(()=>{
  if(shown.current||n<=0){setV(n);return}
  shown.current=true;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setV(n);return}
  let raf=0;const t0=performance.now();setV(0);
  const f=(t:number)=>{const k=Math.min(1,(t-t0)/1100);setV(Math.round(n*(1-Math.pow(1-k,3))));if(k<1)raf=requestAnimationFrame(f)};
  raf=requestAnimationFrame(f);return()=>cancelAnimationFrame(raf);
 },[n]);
 return <>{v.toLocaleString('vi-VN')}</>;
}
