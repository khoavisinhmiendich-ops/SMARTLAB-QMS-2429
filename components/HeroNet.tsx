'use client';
import {useEffect,useRef} from 'react';
// Mạng phân tử nhẹ phía sau banner (chỉ vẽ khi dùng giao diện tối và banner đang hiện trên màn hình).
export default function HeroNet(){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const cv=ref.current;if(!cv)return;const ctx=cv.getContext('2d');if(!ctx)return;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w=0,h=0,raf=0,visible=true;type N={x:number;y:number;vx:number;vy:number;r:number;ph:number};let nodes:N[]=[];
  const init=()=>{const dpr=Math.min(2,window.devicePixelRatio||1);w=cv.clientWidth;h=cv.clientHeight;cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);const n=Math.round(Math.min(48,Math.max(14,w*h/9000)));nodes=Array.from({length:n},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,r:1+Math.random()*1.8,ph:Math.random()*6.28}))};
  const draw=(t:number)=>{ctx.clearRect(0,0,w,h);if(!document.documentElement.classList.contains('tech'))return;const L=120;
   for(const a of nodes){if(!reduce){a.x+=a.vx;a.y+=a.vy;if(a.x<0||a.x>w)a.vx*=-1;if(a.y<0||a.y>h)a.vy*=-1}}
   ctx.lineWidth=1;for(let i=0;i<nodes.length;i++){const a=nodes[i];for(let j=i+1;j<nodes.length;j++){const b=nodes[j],d=Math.hypot(a.x-b.x,a.y-b.y);if(d<L){ctx.strokeStyle=`rgba(130,215,255,${(1-d/L)*.28})`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}}
   for(const a of nodes){const p=.6+.4*Math.sin(t/900+a.ph);ctx.fillStyle=`rgba(170,240,255,${.25+.5*p})`;ctx.beginPath();ctx.arc(a.x,a.y,a.r,0,6.2832);ctx.fill()}};
  const frame=(t:number)=>{draw(t);if(visible&&!document.hidden)raf=requestAnimationFrame(frame)};
  const start=()=>{cancelAnimationFrame(raf);if(reduce){draw(0);return}raf=requestAnimationFrame(frame)};
  init();start();
  const io=new IntersectionObserver(e=>{visible=e[0].isIntersecting;if(visible)start()},{threshold:0});io.observe(cv);
  const vis=()=>{if(!document.hidden)start()};const rs=()=>{init();if(reduce)draw(0)};
  window.addEventListener('resize',rs);document.addEventListener('visibilitychange',vis);
  return()=>{cancelAnimationFrame(raf);io.disconnect();window.removeEventListener('resize',rs);document.removeEventListener('visibilitychange',vis)};
 },[]);
 return <canvas ref={ref} className="hero-net" aria-hidden="true"/>;
}
