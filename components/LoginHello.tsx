// Dòng chữ "Hello, Khoa Vi sinh - Miễn dịch!" có hiệu ứng chữ nảy lên từng ký tự, vẫy tay, lấp lánh và nét gạch chân tự vẽ.
const LINES=['Hello,','Khoa Vi sinh - Miễn dịch!'];
export default function LoginHello(){
 let n=0;
 const render=(text:string)=>text.split(' ').map((w,wi)=><span key={wi}><span className="hello-word">{Array.from(w).map((c,ci)=><span key={ci} className="hello-ch" style={{['--i' as string]:n++}} aria-hidden="true">{c}</span>)}</span>{' '}</span>);
 return <div className="hello cooky" role="heading" aria-level={2} aria-label="Hello, Khoa Vi sinh - Miễn dịch!">
  <span className="hello-spark s1" aria-hidden="true">✦</span><span className="hello-spark s2" aria-hidden="true">✦</span><span className="hello-spark s3" aria-hidden="true">✦</span><span className="hello-spark s4" aria-hidden="true">✦</span>
  <span className="hello-line hello-l1">{render(LINES[0])}<span className="hello-hand" aria-hidden="true">👋</span></span>
  <span className="hello-line hello-l2">{render(LINES[1])}</span>
  <svg className="hello-squiggle" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true"><path d="M2 8 C 22 0, 38 14, 58 7 S 96 1, 116 8 S 154 14, 174 7 S 212 1, 232 8 S 270 13, 298 6"/></svg>
 </div>;
}
