'use client';
import {useEffect,useRef,useState} from 'react';
import InstallApp from './InstallApp';
import LockButton from './LockButton';
const Ico=({d}:{d:string})=><svg viewBox="0 0 24 24" aria-hidden="true"><path d={d}/></svg>;
type Item={label:string;sub:string;d:string;href?:string;act?:()=>void;tone:string};
// Bảng trượt từ dưới lên: các chức năng phụ gom vào một chỗ để thanh điều hướng luôn gọn (tối đa 5 mục).
export default function MoreSheet({open,onClose,home}:{open:boolean;onClose:()=>void;home:boolean}){
 const [dy,setDy]=useState(0);const y0=useRef<number|null>(null);
 useEffect(()=>{if(!open)return;document.body.classList.add('nav-locked');history.pushState({qmsSheet:1},'');const pop=()=>onClose();window.addEventListener('popstate',pop);const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close()};window.addEventListener('keydown',key);return()=>{document.body.classList.remove('nav-locked');window.removeEventListener('popstate',pop);window.removeEventListener('keydown',key)}// eslint-disable-next-line react-hooks/exhaustive-deps
 },[open]);
 const close=()=>{if(history.state&&history.state.qmsSheet)history.back();else onClose()};
 if(!open)return null;
 const after=(fn:()=>void)=>()=>{close();setTimeout(fn,120)};
 const items:Item[]=[
  {label:'Sao lưu & đồng bộ',sub:'Google Drive, bản sao lưu, đồng bộ máy',d:'M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z',href:'/backup',tone:'amber'},
  {label:'Giới thiệu & Hướng dẫn',sub:'Mục tiêu, chức năng, cách sử dụng',d:'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z M4 4.5V22',href:'/gioi-thieu',tone:'rose'},
  {label:'Hỏi trợ lý AI',sub:'Tra cứu và giải đáp nhanh',d:'M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z',act:after(()=>document.querySelector<HTMLButtonElement>('.chat-launcher')?.click()),tone:'sky'},
 ];
 if(home)items.unshift({label:'Thêm / thay tệp',sub:'Tải tệp mới lên thư viện hồ sơ',d:'M12 16V4m0 0-4 4m4-4 4 4M5 20h14',act:after(()=>window.dispatchEvent(new Event('qms-open-upload'))),tone:'violet'});
 return <div className="msheet-back" onClick={close}>
  <div className="msheet" role="dialog" aria-modal="true" aria-label="Thêm chức năng" style={{transform:dy?`translateY(${dy}px)`:undefined,transition:y0.current===null?undefined:'none'}} onClick={e=>e.stopPropagation()}>
   <div className="msheet-grab" onTouchStart={e=>{y0.current=e.touches[0].clientY}} onTouchMove={e=>{if(y0.current!==null)setDy(Math.max(0,e.touches[0].clientY-y0.current))}} onTouchEnd={()=>{const d=dy;y0.current=null;setDy(0);if(d>90)close()}}><i/></div>
   <h2>Thêm</h2>
   <ul className="msheet-list">{items.map(i=><li key={i.label}>{i.href?<a href={i.href} className={'msheet-item t-'+i.tone}><span className="msheet-ico"><Ico d={i.d}/></span><span className="msheet-copy"><strong>{i.label}</strong><small>{i.sub}</small></span><span className="msheet-go" aria-hidden="true">›</span></a>:<button type="button" className={'msheet-item t-'+i.tone} onClick={i.act}><span className="msheet-ico"><Ico d={i.d}/></span><span className="msheet-copy"><strong>{i.label}</strong><small>{i.sub}</small></span><span className="msheet-go" aria-hidden="true">›</span></button>}</li>)}</ul>
   <div className="msheet-foot"><InstallApp compact/><LockButton/></div>
  </div>
 </div>
}
