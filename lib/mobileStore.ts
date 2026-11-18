'use client';
import {useEffect,useState} from 'react';
// Ghim tài liệu và danh sách "mở gần đây" — lưu cục bộ trên thiết bị (localStorage), không gửi lên máy chủ.
export type MiniDoc={id:string;title:string;ext:string;chapter:string};
const PINS='qms-pins-v1',RECENT='qms-recent-v1';
const rd=(k:string):MiniDoc[]=>{try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v.filter((x:MiniDoc)=>x&&typeof x.id==='string'&&typeof x.title==='string'):[]}catch{return[]}};
const wr=(k:string,v:MiniDoc[])=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}window.dispatchEvent(new Event('qms-store'))};
export const getPins=()=>rd(PINS);
export const getRecent=()=>rd(RECENT);
export const isPinned=(id:string)=>getPins().some(x=>x.id===id);
export function togglePin(d:MiniDoc):boolean{const p=getPins();const i=p.findIndex(x=>x.id===d.id);if(i>=0)p.splice(i,1);else p.unshift({id:d.id,title:d.title,ext:d.ext,chapter:d.chapter});wr(PINS,p.slice(0,30));return i<0}
export function pushRecent(d:MiniDoc){const r=getRecent().filter(x=>x.id!==d.id);r.unshift({id:d.id,title:d.title,ext:d.ext,chapter:d.chapter});wr(RECENT,r.slice(0,12))}
export function useStore(){
 const [s,setS]=useState<{pins:MiniDoc[];recent:MiniDoc[]}>({pins:[],recent:[]});
 useEffect(()=>{const f=()=>setS({pins:getPins(),recent:getRecent()});f();window.addEventListener('qms-store',f);window.addEventListener('storage',f);return()=>{window.removeEventListener('qms-store',f);window.removeEventListener('storage',f)}},[]);
 return s;
}
export const extBadge=(e:string)=>e==='DOCX'?'W':e==='XLSX'?'XLS':e==='PDF'?'PDF':e.slice(0,3);
