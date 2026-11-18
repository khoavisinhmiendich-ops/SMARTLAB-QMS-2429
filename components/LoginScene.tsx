'use client';
import {useEffect,useRef} from 'react';
// Nền màn hình khóa: mạng phân tử chuyển động (canvas) + cực quang + lưới phối cảnh. Tự dừng khi tab ẩn; tắt chuyển động nếu máy bật "giảm chuyển động".
export default function LoginScene(){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const cv=ref.current;if(!cv)return;const ctx=cv.getContext('2d');if(!ctx)return;
  let w=0,h=0,raf=0;const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  type N={x:number;y:number;vx:number;vy:number;r:number;ring:boolean;ph:number};
  let nodes:N[]=[];const ptr={x:-9999,y:-9999,on:false};
  const init=()=>{const dpr=Math.min(2,window.devicePixelRatio||1);w=cv.clientWidth;h=cv.clientHeight;cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);const n=Math.round(Math.min(90,Math.max(26,w*h/21000)));nodes=Array.from({length:n},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,r:1.2+Math.random()*2.2,ring:Math.random()<.2,ph:Math.random()*6.28}))};
  const draw=(t:number)=>{
   ctx.clearRect(0,0,w,h);const L=w<700?100:145,P=170;
   if(!reduce)for(const a of nodes){a.x+=a.vx;a.y+=a.vy;if(a.x<-20)a.x=w+20;else if(a.x>w+20)a.x=-20;if(a.y<-20)a.y=h+20;else if(a.y>h+20)a.y=-20;if(ptr.on){const dx=ptr.x-a.x,dy=ptr.y-a.y,d=Math.hypot(dx,dy);if(d<P&&d>1){a.x+=dx/d*.4;a.y+=dy/d*.4}}}
   ctx.lineWidth=1;
   for(let i=0;i<nodes.length;i++){const a=nodes[i];
    for(let j=i+1;j<nodes.length;j++){const b=nodes[j],d=Math.hypot(a.x-b.x,a.y-b.y);if(d<L){ctx.strokeStyle=`rgba(120,205,255,${(1-d/L)*.3})`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}
    if(ptr.on){const d=Math.hypot(a.x-ptr.x,a.y-ptr.y);if(d<P){ctx.strokeStyle=`rgba(127,235,215,${(1-d/P)*.6})`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(ptr.x,ptr.y);ctx.stroke()}}
   }
   for(const a of nodes){const p=.6+.4*Math.sin(t/900+a.ph);ctx.fillStyle=`rgba(165,238,255,${.25+.5*p})`;ctx.beginPath();ctx.arc(a.x,a.y,a.r,0,6.2832);ctx.fill();if(a.ring){ctx.strokeStyle=`rgba(127,235,215,${.4*p})`;ctx.beginPath();ctx.arc(a.x,a.y,a.r+5+3*p,0,6.2832);ctx.stroke()}}
  };
  const frame=(t:number)=>{draw(t);raf=requestAnimationFrame(frame)};
  const start=()=>{cancelAnimationFrame(raf);if(reduce){draw(0);return}raf=requestAnimationFrame(frame)};
  const vis=()=>{if(document.hidden)cancelAnimationFrame(raf);else start()};
  const mv=(e:PointerEvent)=>{ptr.x=e.clientX;ptr.y=e.clientY;ptr.on=true};const lv=()=>{ptr.on=false};
  init();start();
  const onResize=()=>{init();if(reduce)draw(0)};
  window.addEventListener('resize',onResize);document.addEventListener('visibilitychange',vis);window.addEventListener('pointermove',mv,{passive:true});window.addEventListener('pointerleave',lv);
  return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',onResize);document.removeEventListener('visibilitychange',vis);window.removeEventListener('pointermove',mv);window.removeEventListener('pointerleave',lv)};
 },[]);
 return <div className="lx-scene" aria-hidden="true"><i className="lx-aurora a1"/><i className="lx-aurora a2"/><i className="lx-aurora a3"/><div className="lx-floor"/><canvas ref={ref} className="lx-net"/><div className="lx-vignette"/></div>;
}
