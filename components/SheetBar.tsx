'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {RefObject} from 'react';

// Thanh trang tính kiểu Excel (đặt ở đáy vùng xem): mũi tên ‹ › cuộn tab, dấu ⋯ báo còn tab bị ẩn,
// danh sách tab (bấm để chọn, nhấn đúp để đổi tên, kéo thả để đổi vị trí, chuột phải để mở menu),
// nút ＋ thêm trang tính, thanh ⋮ kéo để đổi độ rộng vùng tab, và thanh cuộn ngang của trang tính.
type Props={
  names:string[];active:string;editable:boolean;
  scrollRef:RefObject<HTMLElement|null>; // phần tử cuộn ngang của trang tính
  watchKey:string; // đổi giá trị này để thanh cuộn đo lại kích thước
  onSelect:(name:string)=>void;
  onAdd:()=>void;
  onRename:(from:string,to:string)=>string|null; // trả về thông báo lỗi nếu tên không hợp lệ
  onDelete:(name:string)=>void;
  onDuplicate:(name:string)=>void;
  onMove:(from:number,to:number)=>void;
};
type MenuState={x:number;y:number;kind:'tab'|'list';name?:string};

function HScroll({scrollRef,watchKey}:{scrollRef:RefObject<HTMLElement|null>;watchKey:string}){
  const trackRef=useRef<HTMLDivElement>(null);
  const [st,setSt]=useState({l:0,w:100,can:false});
  const calc=useCallback(()=>{
    const el=scrollRef.current,tr=trackRef.current;if(!el||!tr)return;
    const max=el.scrollWidth-el.clientWidth;const can=max>1;const tw=tr.clientWidth||1;
    const w=can?Math.min(tw,Math.max(28,(el.clientWidth/el.scrollWidth)*tw)):tw;
    const l=can?(el.scrollLeft/max)*(tw-w):0;
    setSt(o=>(Math.abs(o.l-l)<0.5&&Math.abs(o.w-w)<0.5&&o.can===can)?o:{l,w,can});
  },[scrollRef]);
  useEffect(()=>{
    const el=scrollRef.current;if(!el)return;
    let raf=0;const q=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(calc);};
    q();el.addEventListener('scroll',q,{passive:true});window.addEventListener('resize',q);
    const ro=new ResizeObserver(q);ro.observe(el);if(trackRef.current)ro.observe(trackRef.current);
    const mo=new MutationObserver(q);mo.observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:['style','colspan','width']});
    return()=>{cancelAnimationFrame(raf);el.removeEventListener('scroll',q);window.removeEventListener('resize',q);ro.disconnect();mo.disconnect();};
  },[scrollRef,calc,watchKey]);
  const hold=useRef<number|null>(null);
  const stopHold=()=>{if(hold.current!==null){window.clearInterval(hold.current);hold.current=null;}};
  useEffect(()=>stopHold,[]);
  const startHold=(dir:-1|1)=>(e:React.PointerEvent)=>{
    e.preventDefault();const el=scrollRef.current;if(!el)return;
    el.scrollLeft+=dir*60;stopHold();
    const t=window.setTimeout(()=>{hold.current=window.setInterval(()=>{el.scrollLeft+=dir*40;},35);},350);
    const up=()=>{window.clearTimeout(t);stopHold();window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);};
    window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
  };
  const onThumbDown=(e:React.PointerEvent<HTMLDivElement>)=>{
    const el=scrollRef.current,tr=trackRef.current;if(!el||!tr||!st.can)return;
    e.preventDefault();e.stopPropagation();
    const startX=e.clientX,startSL=el.scrollLeft,tw=tr.clientWidth,w=st.w,max=el.scrollWidth-el.clientWidth;
    const move=(ev:PointerEvent)=>{el.scrollLeft=startSL+(ev.clientX-startX)*(max/Math.max(1,tw-w));};
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
  };
  const onTrackDown=(e:React.PointerEvent<HTMLDivElement>)=>{
    const el=scrollRef.current,tr=trackRef.current;if(!el||!tr||!st.can)return;
    const r=tr.getBoundingClientRect();const x=e.clientX-r.left;
    el.scrollLeft+=(x<st.l?-1:1)*el.clientWidth*0.9;
  };
  return <div className="sheet-hscroll" role="scrollbar" aria-orientation="horizontal" aria-label="Thanh cuộn ngang của trang tính" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(st.can&&trackRef.current?(st.l/Math.max(1,(trackRef.current.clientWidth-st.w)))*100:0)}>
    <button type="button" className="sheet-btn sheet-hs-arrow" tabIndex={-1} aria-label="Cuộn sang trái" title="Cuộn sang trái" disabled={!st.can} onMouseDown={e=>e.preventDefault()} onPointerDown={startHold(-1)}>◂</button>
    <div className="sheet-hs-track" ref={trackRef} onPointerDown={onTrackDown}>
      <div className={'sheet-hs-thumb'+(st.can?'':' off')} style={{left:st.l,width:st.w}} onPointerDown={onThumbDown}/>
    </div>
    <button type="button" className="sheet-btn sheet-hs-arrow" tabIndex={-1} aria-label="Cuộn sang phải" title="Cuộn sang phải" disabled={!st.can} onMouseDown={e=>e.preventDefault()} onPointerDown={startHold(1)}>▸</button>
  </div>;
}

export default function SheetBar(p:Props){
  const {names,active,editable}=p;
  const barRef=useRef<HTMLDivElement>(null);
  const wrapRef=useRef<HTMLDivElement>(null);
  const stripRef=useRef<HTMLDivElement>(null);
  const finished=useRef(false);
  const [canL,setCanL]=useState(false);
  const [canR,setCanR]=useState(false);
  const [editing,setEditing]=useState<string|null>(null);
  const [menu,setMenu]=useState<MenuState|null>(null);
  const [tabsW,setTabsW]=useState<number|null>(null);
  const [drag,setDrag]=useState<{from:number;over:number}|null>(null);

  const measure=useCallback(()=>{
    const s=stripRef.current;if(!s)return;
    setCanL(s.scrollLeft>1);setCanR(s.scrollLeft+s.clientWidth<s.scrollWidth-1);
  },[]);
  useEffect(()=>{
    const s=stripRef.current;if(!s)return;
    s.addEventListener('scroll',measure,{passive:true});
    const ro=new ResizeObserver(measure);ro.observe(s);if(barRef.current)ro.observe(barRef.current);
    // cuộn con lăn chuột = cuộn ngang dãy tab
    const wheel=(e:WheelEvent)=>{
      if(s.scrollWidth<=s.clientWidth)return;
      const d=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(!d)return;
      e.preventDefault();s.scrollLeft+=d;
    };
    s.addEventListener('wheel',wheel,{passive:false});
    return()=>{s.removeEventListener('scroll',measure);s.removeEventListener('wheel',wheel);ro.disconnect();};
  },[measure]);
  useEffect(()=>{measure();},[names,tabsW,editing,measure]);
  // luôn đưa tab đang chọn vào vùng nhìn thấy
  useEffect(()=>{
    const s=stripRef.current;if(!s)return;
    const t=s.querySelector<HTMLElement>('[data-sheet-tab][aria-selected="true"]');if(!t)return;
    const l=t.offsetLeft,r=l+t.offsetWidth;
    if(l<s.scrollLeft)s.scrollLeft=Math.max(0,l-4);else if(r>s.scrollLeft+s.clientWidth)s.scrollLeft=r-s.clientWidth+4;
  },[active,names,tabsW]);

  const step=(dir:-1|1,all=false)=>{
    const s=stripRef.current;if(!s)return;
    if(all){s.scrollTo({left:dir<0?0:s.scrollWidth,behavior:'smooth'});return;}
    const tabs=Array.from(s.querySelectorAll<HTMLElement>('[data-sheet-tab]'));const sl=s.scrollLeft,sr=sl+s.clientWidth;
    if(dir>0){const t=tabs.find(x=>x.offsetLeft+x.offsetWidth>sr+1);if(t)s.scrollTo({left:t.offsetLeft+t.offsetWidth-s.clientWidth,behavior:'smooth'});}
    else{const t=[...tabs].reverse().find(x=>x.offsetLeft<sl-1);if(t)s.scrollTo({left:t.offsetLeft,behavior:'smooth'});}
  };
  const page=(dir:-1|1)=>{const s=stripRef.current;if(s)s.scrollBy({left:dir*s.clientWidth*0.8,behavior:'smooth'});};

  const openList=(e:React.MouseEvent)=>{e.preventDefault();setMenu({x:Math.max(6,Math.min(e.clientX,window.innerWidth-214)),y:e.clientY,kind:'list'});};
  const startRename=(n:string)=>{
    if(!editable){alert('Bật “Chỉnh sửa trực tiếp” để đổi tên trang tính.');return;}
    finished.current=false;setMenu(null);setEditing(n);p.onSelect(n);
  };
  const finishRename=(from:string,val:string,ok:boolean)=>{
    if(finished.current)return;finished.current=true;setEditing(null);
    if(!ok)return;const to=val.trim();if(!to||to===from)return;
    const err=p.onRename(from,to);if(err)alert(err);
  };

  // đóng menu khi bấm ra ngoài / Esc / cuộn / đổi kích thước
  useEffect(()=>{
    if(!menu)return;
    const close=()=>setMenu(null);const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};
    window.addEventListener('keydown',key);window.addEventListener('resize',close);window.addEventListener('blur',close);
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('resize',close);window.removeEventListener('blur',close);};
  },[menu]);

  // kéo thanh ⋮ để đổi độ rộng vùng tab / thanh cuộn
  const onSplitDown=(e:React.PointerEvent<HTMLDivElement>)=>{
    const wrap=wrapRef.current,bar=barRef.current;if(!wrap||!bar)return;
    e.preventDefault();const startX=e.clientX,startW=wrap.getBoundingClientRect().width;
    const max=Math.max(120,bar.clientWidth-260);
    const move=(ev:PointerEvent)=>setTabsW(Math.max(90,Math.min(max,startW+(ev.clientX-startX))));
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
  };

  const idx=menu?.name?names.indexOf(menu.name):-1;
  const run=(fn:()=>void)=>{setMenu(null);fn();};
  return <>
    <div className="sheet-bar" ref={barRef} role="toolbar" aria-label="Thanh trang tính">
      <div className="sheet-nav" onContextMenu={openList} title="Chuột phải: danh sách tất cả trang tính">
        <button type="button" className="sheet-btn" aria-label="Cuộn tab sang trái" title="Cuộn sang trái (Shift: về trang tính đầu tiên)" disabled={!canL} onMouseDown={e=>e.preventDefault()} onClick={e=>step(-1,e.shiftKey)}>‹</button>
        <button type="button" className="sheet-btn" aria-label="Cuộn tab sang phải" title="Cuộn sang phải (Shift: đến trang tính cuối cùng)" disabled={!canR} onMouseDown={e=>e.preventDefault()} onClick={e=>step(1,e.shiftKey)}>›</button>
      </div>
      <button type="button" className={'sheet-btn sheet-dots'+(canL?'':' hid')} aria-label="Còn trang tính ở bên trái" title="Còn trang tính ở bên trái (chuột phải: danh sách tất cả)" tabIndex={canL?0:-1} onMouseDown={e=>e.preventDefault()} onClick={()=>page(-1)} onContextMenu={openList}>⋯</button>
      <div className="sheet-tabwrap" ref={wrapRef} style={tabsW!==null?{flex:'0 0 '+tabsW+'px'}:undefined}>
        <div className="sheet-strip" ref={stripRef} role="tablist" aria-label="Các trang tính">
          {names.map((n,i)=>{
            const isActive=n===active;const isEdit=editing===n;
            const cls='sheet-tab'+(isActive?' active':'')+(isEdit?' editing':'')+(drag&&drag.over===i&&drag.from!==i&&drag.from+1!==i?' drop-l':'')+(drag&&i===names.length-1&&drag.over===names.length&&drag.from!==i?' drop-r':'');
            return <div key={n} data-sheet-tab="1" role="tab" aria-selected={isActive} tabIndex={isActive?0:-1} className={cls} title={isEdit?undefined:n+(editable?' — nhấn đúp để đổi tên, chuột phải để mở menu':'')}
              draggable={editable&&!isEdit}
              onMouseDown={e=>{if(isEdit)e.stopPropagation();}}
              onClick={()=>{if(!isEdit&&!isActive)p.onSelect(n);}}
              onDoubleClick={()=>{if(!isEdit)startRename(n);}}
              onContextMenu={e=>{e.preventDefault();if(!isActive)p.onSelect(n);setMenu({x:Math.max(6,Math.min(e.clientX,window.innerWidth-214)),y:e.clientY,kind:'tab',name:n});}}
              onKeyDown={e=>{if(isEdit)return;if(e.key==='F2'){e.preventDefault();startRename(n);}else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!isActive)p.onSelect(n);}else if(e.key==='ArrowRight'&&i<names.length-1){e.preventDefault();p.onSelect(names[i+1]);}else if(e.key==='ArrowLeft'&&i>0){e.preventDefault();p.onSelect(names[i-1]);}}}
              onDragStart={e=>{setDrag({from:i,over:i});e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',n);}catch{}}}
              onDragOver={e=>{if(!drag)return;e.preventDefault();e.dataTransfer.dropEffect='move';const r=e.currentTarget.getBoundingClientRect();const over=e.clientX<r.left+r.width/2?i:i+1;if(over!==drag.over)setDrag({from:drag.from,over});}}
              onDrop={e=>{e.preventDefault();if(!drag)return;let to=drag.over;if(to>drag.from)to--;const from=drag.from;setDrag(null);if(to!==from)p.onMove(from,to);}}
              onDragEnd={()=>setDrag(null)}>
              {isEdit
                ?<input className="sheet-rename" autoFocus defaultValue={n} maxLength={31} size={Math.max(6,Math.min(31,n.length+2))} aria-label="Tên trang tính"
                    onFocus={e=>e.currentTarget.select()} onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}
                    onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();finishRename(n,e.currentTarget.value,true);}else if(e.key==='Escape'){e.preventDefault();finishRename(n,'',false);}}}
                    onBlur={e=>finishRename(n,e.currentTarget.value,true)}/>
                :n}
            </div>;
          })}
        </div>
      </div>
      <button type="button" className={'sheet-btn sheet-dots'+(canR?'':' hid')} aria-label="Còn trang tính ở bên phải" title="Còn trang tính ở bên phải (chuột phải: danh sách tất cả)" tabIndex={canR?0:-1} onMouseDown={e=>e.preventDefault()} onClick={()=>page(1)} onContextMenu={openList}>⋯</button>
      <button type="button" className="sheet-btn sheet-add" aria-label="Thêm trang tính mới" title={editable?'Thêm trang tính mới':'Bật “Chỉnh sửa trực tiếp” để thêm trang tính'} disabled={!editable} onMouseDown={e=>e.preventDefault()} onClick={p.onAdd}>+</button>
      <div className="sheet-split" role="separator" aria-orientation="vertical" title="Kéo để đổi độ rộng vùng tab (nhấn đúp: về mặc định)" onPointerDown={onSplitDown} onDoubleClick={()=>setTabsW(null)}>⋮</div>
      <HScroll scrollRef={p.scrollRef} watchKey={p.watchKey+'|'+active+'|'+names.length+'|'+tabsW}/>
    </div>
    {menu&&<>
      <div className="orient-backdrop" onMouseDown={()=>setMenu(null)} onContextMenu={e=>{e.preventDefault();setMenu(null);}}/>
      <div className="orient-menu sheet-menu" role="menu" style={{left:menu.x,top:'auto',bottom:Math.max(6,window.innerHeight-menu.y+6)}}>
        {menu.kind==='list'
          ?<div className="sheet-menu-list">{names.map(n=><button key={n} type="button" role="menuitem" className={'orient-item'+(n===active?' active':'')} onClick={()=>run(()=>p.onSelect(n))}>{n}</button>)}</div>
          :menu.name&&<>
            <button type="button" role="menuitem" className="orient-item" disabled={!editable} onClick={()=>startRename(menu.name as string)}>Đổi tên <span className="sheet-menu-key">F2</span></button>
            <button type="button" role="menuitem" className="orient-item" disabled={!editable} onClick={()=>run(()=>p.onDuplicate(menu.name as string))}>Nhân đôi trang tính</button>
            <button type="button" role="menuitem" className="orient-item" disabled={!editable||idx<=0} onClick={()=>run(()=>p.onMove(idx,idx-1))}>Chuyển sang trái</button>
            <button type="button" role="menuitem" className="orient-item" disabled={!editable||idx<0||idx>=names.length-1} onClick={()=>run(()=>p.onMove(idx,idx+1))}>Chuyển sang phải</button>
            <button type="button" role="menuitem" className="orient-item sheet-menu-danger" disabled={!editable||names.length<2} onClick={()=>run(()=>p.onDelete(menu.name as string))}>Xóa trang tính</button>
          </>}
      </div>
    </>}
  </>;
}
