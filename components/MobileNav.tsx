'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
const I=({d}:{d:string})=><svg viewBox="0 0 24 24" aria-hidden="true"><path d={d}/></svg>;
const ITEMS=[
 {href:'/',label:'Tổng quan',d:'M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-7h6v7'},
 {href:'/#library',label:'Thư viện',d:'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z M4 4.5V22'},
 {href:'/criteria',label:'Chấm điểm',d:'M12 3 20 6v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6z M9 12l2 2 4-4'},
 {href:'/backup',label:'Sao lưu',d:'M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z'},
 {href:'/gioi-thieu',label:'Hướng dẫn',d:'M12 17v.01M12 13.5a2.5 2.5 0 1 0-2.4-3.2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'},
];
// Thanh điều hướng dưới cùng trên điện thoại (ẩn ở màn hình khóa và trang xem/sửa tài liệu).
export default function MobileNav(){
 const path=usePathname()||'/';
 const hidden=path.startsWith('/login')||path.startsWith('/documents');
 useEffect(()=>{document.body.classList.toggle('has-mnav',!hidden);return()=>document.body.classList.remove('has-mnav')},[hidden]);
 if(hidden)return null;
 const active=(h:string)=>h==='/'?path==='/':h==='/#library'?false:path.startsWith(h);
 return <nav className="mnav" aria-label="Điều hướng nhanh">{ITEMS.map(i=><a key={i.href} href={i.href} className={active(i.href)?'on':''} aria-current={active(i.href)?'page':undefined}><I d={i.d}/><span>{i.label}</span></a>)}</nav>;
}
