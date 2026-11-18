'use client';
import {extBadge,useStore} from '@/lib/mobileStore';
// "Đã ghim" và "Mở gần đây" — chỉ hiện trên điện thoại / máy tính bảng (lớp m-only), dữ liệu lưu trên thiết bị.
export default function MobileLists(){
 const {pins,recent}=useStore();
 const rest=recent.filter(r=>!pins.some(p=>p.id===r.id)).slice(0,5);
 if(!pins.length&&!rest.length)return null;
 const Row=({d}:{d:{id:string;title:string;ext:string;chapter:string}})=><li><a href={'/documents/'+encodeURIComponent(d.id)}><span className={'doc-type-mini '+d.ext.toLowerCase()}>{extBadge(d.ext)}</span><span className="recent-copy"><strong>{d.title}</strong><small>{d.chapter.replace(/^[0-9]+\.\s*/,'')}</small></span></a></li>;
 return <section className="m-only m-lists" aria-label="Truy cập nhanh tài liệu">
  {pins.length>0&&<div><h2><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>Đã ghim</h2><ul className="m-list">{pins.slice(0,6).map(d=><Row key={d.id} d={d}/>)}</ul></div>}
  {rest.length>0&&<div><h2><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/></svg>Mở gần đây</h2><ul className="m-list">{rest.map(d=><Row key={d.id} d={d}/>)}</ul></div>}
 </section>
}
