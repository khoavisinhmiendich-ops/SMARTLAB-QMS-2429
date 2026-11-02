// Sửa các điểm trình xem Word (docx-preview) hiển thị KHÁC tệp gốc. Mỗi hàm an toàn khi gọi lại nhiều lần và chỉ đổi cách hiển thị.

// Thuộc tính hàng bảng <w:trPr><w:jc> trong Word là căn CẢ HÀNG so với lề trang (không phải căn chữ trong ô).
// Thư viện dựng lại thành text-align trên <tr>, làm chữ của mọi ô trong hàng bị căn giữa/phải sai (102/260 tệp Word có thuộc tính này).
// Căn chữ thật của từng ô luôn nằm ở đoạn văn (<p>) hoặc kiểu đoạn nên giữ nguyên; chỉ bỏ text-align gắn trực tiếp trên <tr>.
export function fixRowAlignment(root: HTMLElement) {
  root.querySelectorAll('tr').forEach((tr) => {
    const el = tr as HTMLElement;
    if (el.style.textAlign) el.style.removeProperty('text-align');
  });
}

// Khi một đoạn có hình nổi (wp:anchor), thư viện tách đoạn thành <p>, <div hình> và để phần chữ còn lại nằm TRẦN (ngoài thẻ <p>),
// nên chữ mất căn lề/kiểu của đoạn (vd. dòng "KHOA VI SINH-MIỄN DỊCH" căn giữa bị căn trái). Gom lại: hình + chữ trần vào đúng đoạn <p> gốc.
// Gọi sau fixAnchoredImages (hình đã có data-qms-anchor). Làm lại nhiều lần vẫn an toàn.
export function fixOrphanRuns(root: HTMLElement) {
  root.querySelectorAll('div[data-qms-anchor]').forEach((d) => {
    const div = d as HTMLElement; const tpl = div.previousElementSibling;
    if (!tpl || tpl.tagName !== 'P' || !div.parentNode) return;
    const orphans: Node[] = []; let n: Node | null = div.nextSibling;
    while (n && (n.nodeType === 3 || (n.nodeType === 1 && ['SPAN', 'A', 'B', 'I', 'U', 'BR'].includes((n as Element).tagName)))) { orphans.push(n); n = n.nextSibling; }
    if (!orphans.some((o) => (o.textContent || '').trim())) return;
    tpl.appendChild(div); orphans.forEach((o) => tpl.appendChild(o));
  });
}

// Bảng căn giữa (jc=center) rộng hơn vùng chữ: Word đặt bảng nhô ra đều hai bên lề; CSS "margin: auto" lại coi lề âm bằng 0 nên bảng bị dồn trái và tràn mép phải.
export function fixOversizedCenteredTables(root: HTMLElement) {
  root.querySelectorAll('table').forEach((tb) => {
    const t = tb as HTMLTableElement;
    if (t.style.marginLeft !== 'auto' || t.style.marginRight !== 'auto') return;
    const parent = t.parentElement; if (!parent) return;
    const cs = getComputedStyle(parent);
    const avail = parent.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
    const over = t.offsetWidth - avail;
    if (over > 2 && avail > 0) { t.style.marginLeft = -over / 2 + 'px'; t.style.marginRight = '0px'; t.dataset.qmsCenterFix = '1'; }
  });
}

// Gom các sửa lỗi hiển thị dành riêng cho Word.
export function fixDocxFidelity(root: HTMLElement) {
  fixRowAlignment(root);
  fixOrphanRuns(root);
  fixOversizedCenteredTables(root);
}
