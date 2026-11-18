'use client';
import {useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import MobileSearch from './MobileSearch';
import MoreSheet from './MoreSheet';
const I=({d}:{d:string})=><svg viewBox="0 0 24 24" aria-hidden="true"><path d={d}/></svg>;
const HOME='M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-7h6v7';
const LIB='M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z M4 4.5V22';
const SEARCH='M20 20l-4.5-4.5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0';
const SHIELD='M12 3 20 6v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6z M9 12l2 2 4-4';
const MORE='M5 12h.01M12 12h.01M19 12h.01';
// Thanh điều hướng dưới (điện thoại): 5 mục — Tổng quan · Thư viện · Tìm (nút giữa) · Chấm điểm · Thêm.
// Ẩn ở màn hình khóa và trang xem/sửa tài liệu (trang đó có thanh thao tác riêng).
export default function MobileNav(){
 const path=usePathname()||'/';
 const hidden=path.startsWith('/login')||path.startsWith('/documents');
 const [hash,setHash]=useState(''),[search,setSearch]=useState(false),[more,setMore]=useState(false);
 useEffect(()=>{document.body.classList.toggle('has-mnav',!hidden);return()=>document.body.classList.remove('has-mnav')},[hidden]);
 useEffect(()=>{const h=()=>setHash(location.hash);h();const o=()=>setSearch(true);window.addEventListener('hashchange',h);window.addEventListener('qms-open-search',o);return()=>{window.removeEventListener('hashchange',h);window.removeEventListener('qms-open-search',o)}},[]);
 if(hidden)return null;
 const onHome=path==='/';
 const homeOn=onHome&&hash!=='#library',libOn=onHome&&hash==='#library';
 return <>
  <nav className="mnav" aria-label="Điều hướng nhanh">
   <a href="/" className={homeOn?'on':''} aria-current={homeOn?'page':undefined}><I d={HOME}/><span>Tổng quan</span></a>
   <a href="/#library" className={libOn?'on':''} aria-current={libOn?'page':undefined}><I d={LIB}/><span>Thư viện</span></a>
   <button type="button" className="mnav-search" onClick={()=>setSearch(true)} aria-label="Tìm kiếm tài liệu"><span><I d={SEARCH}/></span><em>Tìm</em></button>
   <a href="/criteria" className={path.startsWith('/criteria')?'on':''} aria-current={path.startsWith('/criteria')?'page':undefined}><I d={SHIELD}/><span>Chấm điểm</span></a>
   <button type="button" className={'mnav-more'+(path.startsWith('/backup')||path.startsWith('/gioi-thieu')?' on':'')} onClick={()=>setMore(true)} aria-haspopup="dialog"><I d={MORE}/><span>Thêm</span></button>
  </nav>
  <MobileSearch open={search} onClose={()=>setSearch(false)}/>
  <MoreSheet open={more} onClose={()=>setMore(false)} home={onHome}/>
 </>;
}
