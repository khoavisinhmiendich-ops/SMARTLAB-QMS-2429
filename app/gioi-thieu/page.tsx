'use client';
import {useEffect,useState} from 'react';
import type {Doc} from '@/lib/documents';
import LiveClock from '@/components/LiveClock';
import LockButton from '@/components/LockButton';
import InstallApp from '@/components/InstallApp';
const Svg=({d}:{d:string})=><svg viewBox="0 0 24 24" aria-hidden="true"><path d={d}/></svg>;
const P={
 shield:'M12 3 20 6v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6z M9 12l2 2 4-4',
 book:'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z M4 4.5V22',
 file:'M6 3h8l5 5v13H6z M14 3v6h5 M9 13h7 M9 17h7',
 search:'M20 20l-4.5-4.5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
 spark:'M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z',
 cloud:'M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z',
 phone:'M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M11 18h2',
 edit:'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
};
const FEATURES:[string,string,string][]=[
 [P.book,'Thư viện hồ sơ theo 12 chương','Toàn bộ hồ sơ QĐ 2429/QĐ-BYT được tổ chức theo chương, phân nhóm PDF – Biểu mẫu (BM) – Quy trình (SOP/QT) – Tài liệu khác; xem và tải tệp gốc ngay trên trình duyệt.'],
 [P.search,'Tra cứu nhanh','Tìm theo tên, mã, loại tài liệu hoặc lọc theo chương; mở tài liệu chỉ với một lần bấm.'],
 [P.edit,'Xem và chỉnh sửa trực tiếp','Word, Excel, PDF hiển thị đúng tệp gốc; chỉnh sửa trực tiếp, tự động lưu, tải bản đã sửa; thay tệp mới mà không mất dữ liệu cũ.'],
 [P.shield,'Chấm điểm tiêu chí tự động','Đối chiếu hồ sơ với 169 tiêu chí (268 điểm), cho biết tiêu chí đủ, một phần, thiếu hoặc cần kiểm tra tại chỗ; tự cập nhật khi hồ sơ thay đổi.'],
 [P.spark,'Trợ lý AI SMARTLAB','Hỏi đáp, tra cứu thông tin ngay trong ứng dụng; tự chuyển sang kết nối dự phòng khi một nhà cung cấp gặp sự cố.'],
 [P.shield,'Bảo mật nhiều lớp','Đăng nhập bằng tài khoản, passkey riêng cho mục nhạy cảm, phiên làm việc hết hạn sau 8 giờ, chặn dò mật khẩu và ghi nhật ký bảo mật.'],
 [P.cloud,'Sao lưu và đồng bộ','Mỗi lần lưu tạo bản sao lưu phụ ở nhiều nơi, giữ 30 phiên bản gần nhất của từng tài liệu, sao lưu Google Drive và đồng bộ nhiều thiết bị có cảnh báo xung đột.'],
 [P.phone,'Cài như ứng dụng','Cài lên điện thoại hoặc máy tính chỉ bằng một nút; giao diện tự thích ứng màn hình nhỏ, không cần cài thêm phần mềm văn phòng.'],
];
const STEPS:[string,string][]=[
 ['Đăng nhập','Dùng tên đăng nhập và mật khẩu do quản trị hệ thống cấp. Phiên làm việc kéo dài 8 giờ; bấm Khóa khi rời máy.'],
 ['Chọn chương hoặc tìm kiếm','Chọn chương ở cây thư mục bên trái (hoặc nút Danh mục trên điện thoại), hoặc gõ từ khóa vào ô tìm kiếm.'],
 ['Mở và xử lý tài liệu','Bấm Xem để mở; bật Chỉnh sửa trực tiếp để sửa (tự lưu); dùng Tải bản gốc, Tải bản đã sửa hoặc Thay tệp khi cần.'],
 ['Theo dõi tiêu chí','Vào Chấm điểm tiêu chí, nhập passkey để xem số tiêu chí đủ hồ sơ, hồ sơ còn thiếu và chấm các tiêu chí kiểm tra tại chỗ.'],
 ['Sao lưu và cài ứng dụng','Dùng trang Sao lưu để kết nối Google Drive và kiểm tra đồng bộ; bấm Cài ứng dụng để dùng như một ứng dụng riêng.'],
];
const CRITERIA:[string,string[]][]=[
 ['Tính mới và sáng tạo',['Gắn trực tiếp bộ hồ sơ với từng tiêu chí của QĐ 2429/QĐ-BYT và tự động xác định tiêu chí đủ, thiếu.','Xem và sửa Word, Excel, PDF giữ định dạng gốc ngay trên trình duyệt; có trợ lý AI tra cứu.']],
 ['Tính khả thi và áp dụng thực tế',['Chạy trên trình duyệt, không cần cài phần mềm; có thể cài như ứng dụng trên điện thoại và máy tính.','Đang vận hành với bộ hồ sơ thực tế của khoa; dùng các nền tảng phổ biến (Next.js, Vercel, Supabase, Google Drive).']],
 ['Hiệu quả',['Rút ngắn thao tác tìm, mở, cập nhật hồ sơ; một nguồn dữ liệu duy nhất cho nhiều người dùng.','Giảm rủi ro mất dữ liệu nhờ sao lưu nhiều lớp, lưu phiên bản và cảnh báo xung đột khi nhiều thiết bị cùng sửa.','Theo dõi liên tục mức đáp ứng tiêu chí để kịp thời bổ sung hồ sơ còn thiếu.']],
 ['Khả năng nhân rộng',['Áp dụng cho các khoa, phòng xét nghiệm khác thực hiện QĐ 2429/QĐ-BYT: nạp bộ hồ sơ của đơn vị, cấu hình tài khoản và vận hành.','Thêm tệp bằng nút Thêm tệp hoặc lệnh add-file; có hướng dẫn triển khai trong tài liệu kèm theo.']],
 ['An toàn, bảo mật và bền vững',['Phân lớp truy cập: đăng nhập, passkey riêng cho mục nhạy cảm, tự khóa phiên.','Nhật ký bảo mật, giới hạn số lần thử sai, kiểm tra cấu hình khi khởi động; dữ liệu tách khỏi mã nguồn nên cập nhật phần mềm không làm mất hồ sơ.']],
];
const ROLLOUT:[string,string][]=[
 ['Chuẩn bị','Cài môi trường (Node.js hoặc Vercel), tạo tệp cấu hình và đặt tài khoản, mật khẩu, passkey.'],
 ['Nạp hồ sơ','Chép hồ sơ theo chương vào thư mục dữ liệu hoặc dùng nút Thêm tệp; kiểm tra danh mục hiển thị đủ.'],
 ['Hướng dẫn người dùng','Tập huấn nhanh theo 5 bước ở trên; cài ứng dụng lên máy cá nhân của cán bộ phụ trách.'],
 ['Vận hành và cải tiến','Theo dõi điểm tiêu chí, bổ sung hồ sơ thiếu, kiểm tra sao lưu định kỳ và góp ý hoàn thiện.'],
];
export default function IntroPage(){
 const [docs,setDocs]=useState<Doc[]|null>(null);
 useEffect(()=>{let on=true;fetch('/api/documents',{cache:'no-store'}).then(r=>r.ok?r.json():[]).then(d=>{if(on)setDocs(Array.isArray(d)?d:[])}).catch(()=>{if(on)setDocs([])});return()=>{on=false}},[]);
 useEffect(()=>{const all=()=>Array.from(document.querySelectorAll<HTMLDetailsElement>('details.gt-section'));if(window.matchMedia('(max-width:950px)').matches)all().forEach((d,i)=>{d.open=i===0});const bp=()=>all().forEach(d=>{d.open=true});window.addEventListener('beforeprint',bp);return()=>window.removeEventListener('beforeprint',bp)},[]);
 const openTo=(id:string)=>{const d=document.getElementById(id);if(d instanceof HTMLDetailsElement)d.open=true};
 const n=(f:(d:Doc)=>boolean)=>docs?docs.filter(f).length.toLocaleString('vi-VN'):'—';
 const chapters=docs?new Set(docs.filter(d=>/^\s*\d+\s*\.\s*chương/i.test(d.chapter)).map(d=>d.chapter)).size.toLocaleString('vi-VN'):'—';
 return <div className="app"><header className="header"><a className="brand-mark" href="/" aria-label="SMARTLAB QMS"><span className="brand-symbol"><Svg d={P.shield}/></span><span className="brand-text"><strong>SMARTLAB <em>QMS</em></strong><small>QUALITY MANAGEMENT SYSTEM</small></span></a><div className="head-divider"/><div className="head-title"><strong>BỆNH VIỆN PHONG - DA LIỄU TRUNG ƯƠNG QUY HÒA</strong><span>KHOA VI SINH - MIỄN DỊCH <b>·</b> QUẢN LÝ CHẤT LƯỢNG 2429</span></div><div className="header-right"><LiveClock/><span className="system-status"><i/> Hệ thống sẵn sàng</span><InstallApp compact/><a className="btn" href="/backup" title="Sao lưu Google Drive &amp; đồng bộ dữ liệu">☁ Sao lưu</a><LockButton/></div></header>
 <main className="gt-wrap" id="main">
  <section className="gt-hero"><div className="gt-hero-copy"><div className="eyebrow"><span/> GIỚI THIỆU VỀ APP </div><h1>SMARTLAB QMS 2429</h1><p className="gt-lead">Ứng dụng công nghệ số trong quản lý hồ sơ và đánh giá mức chất lượng phòng xét nghiệm theo Quyết định 2429/QĐ-BYT.</p><p className="gt-unit">Khoa Vi sinh – Miễn dịch · Bệnh viện Phong - Da liễu Trung ương Quy Hòa</p><div className="gt-actions"><a className="btn btn-primary" href="/">Vào thư viện hồ sơ</a><button type="button" className="btn" onClick={()=>window.print()}>In / lưu PDF trang này</button></div></div>
   <div className="gt-stats" aria-label="Số liệu hệ thống hiện tại"><div><strong>{n(()=>true)}</strong><span>tài liệu trong thư viện</span></div><div><strong>{chapters}</strong><span>chương hồ sơ</span></div><div><strong>169</strong><span>tiêu chí · 268 điểm</span></div><div><strong>{n(d=>d.ext==='DOCX')}</strong><span>tệp Word</span></div><div><strong>{n(d=>d.ext==='PDF')}</strong><span>tệp PDF</span></div><div><strong>{n(d=>d.ext==='XLSX')}</strong><span>tệp Excel</span></div></div></section>
  <nav className="gt-toc" aria-label="Mục lục"><a href="#su-can-thiet" onClick={()=>openTo('su-can-thiet')}>Sự cần thiết</a><a href="#muc-tieu" onClick={()=>openTo('muc-tieu')}>Mục tiêu</a><a href="#chuc-nang" onClick={()=>openTo('chuc-nang')}>Chức năng</a><a href="#huong-dan" onClick={()=>openTo('huong-dan')}>Hướng dẫn</a><a href="#tieu-chi" onClick={()=>openTo('tieu-chi')}>Đối chiếu tiêu chí</a><a href="#nhan-rong" onClick={()=>openTo('nhan-rong')}>Nhân rộng</a></nav>
  <details className="gt-section" id="su-can-thiet" open><summary className="gt-head"><span className="gt-no">01</span><h2>Sự cần thiết</h2></summary><div className="gt-cols"><p>Quyết định 2429/QĐ-BYT quy định bộ tiêu chí đánh giá mức chất lượng phòng xét nghiệm y học gồm 12 chương, 169 tiêu chí, 268 điểm. Mỗi tiêu chí cần có hồ sơ, quy trình, biểu mẫu và minh chứng đi kèm; hồ sơ phải được kiểm soát, cập nhật và truy xuất nhanh khi đánh giá.</p><p>Khi hồ sơ lưu rải rác ở nhiều thư mục, nhiều máy tính hoặc bản giấy, việc tra cứu, cập nhật phiên bản, theo dõi tiêu chí còn thiếu và bảo vệ dữ liệu đòi hỏi nhiều công sức. Sáng kiến đưa toàn bộ quy trình này lên một nền tảng số dùng chung, dễ sử dụng cho mọi cán bộ trong khoa.</p></div></details>
  <details className="gt-section" id="muc-tieu" open><summary className="gt-head"><span className="gt-no">02</span><h2>Mục tiêu</h2></summary><ol className="gt-goals"><li><b>Tập trung hóa</b> toàn bộ hồ sơ theo 12 chương vào một nền tảng thống nhất.</li><li><b>Tra cứu, xem, chỉnh sửa</b> tại chỗ trên trình duyệt, không cần cài thêm phần mềm.</li><li><b>Tự động đối chiếu</b> hồ sơ với từng tiêu chí để biết đã đủ hay còn thiếu.</li><li><b>Bảo mật, sao lưu</b> và dùng được trên nhiều thiết bị (điện thoại, máy tính).</li><li><b>Dễ nhân rộng</b> cho các khoa, phòng xét nghiệm khác.</li></ol></details>
  <details className="gt-section" id="chuc-nang" open><summary className="gt-head"><span className="gt-no">03</span><h2>Giải pháp và chức năng chính</h2></summary><div className="gt-features">{FEATURES.map(([d,t,x])=><article key={t} className="gt-feature"><span className="gt-ico"><Svg d={d}/></span><h3>{t}</h3><p>{x}</p></article>)}</div></details>
  <details className="gt-section" id="huong-dan" open><summary className="gt-head"><span className="gt-no">04</span><h2>Hướng dẫn sử dụng nhanh</h2></summary><ol className="gt-steps">{STEPS.map(([t,x],i)=><li key={t}><span className="gt-step-no">{i+1}</span><div><h3>{t}</h3><p>{x}</p></div></li>)}</ol></details>
  <details className="gt-section" id="tieu-chi" open><summary className="gt-head"><span className="gt-no">05</span><h2>Đối chiếu với tiêu chí đánh giá </h2></summary><div className="gt-table-wrap"><table className="gt-table"><thead><tr><th>Tiêu chí</th><th>Minh chứng trong hệ thống</th></tr></thead><tbody>{CRITERIA.map(([t,list])=><tr key={t}><th scope="row">{t}</th><td><ul>{list.map(x=><li key={x}>{x}</li>)}</ul></td></tr>)}</tbody></table></div></details>
  <details className="gt-section" id="nhan-rong" open><summary className="gt-head"><span className="gt-no">06</span><h2>Lộ trình triển khai và nhân rộng</h2></summary><ol className="gt-roll">{ROLLOUT.map(([t,x],i)=><li key={t}><span className="gt-roll-no">Bước {i+1}</span><h3>{t}</h3><p>{x}</p></li>)}</ol></details>
  <footer className="app-footer"><span>© {new Date().getFullYear()} SMARTLAB QMS · Khoa Vi sinh – Miễn dịch</span><span>Hệ thống quản lý chất lượng phòng xét nghiệm <b>●</b></span></footer>
 </main></div>;
}
