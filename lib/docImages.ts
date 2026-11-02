// Ảnh trong tệp Word được trình xem tạo dưới dạng địa chỉ tạm "blob:..." chỉ sống trong phiên đang mở.
// Nếu lưu nguyên địa chỉ đó vào nội dung đã chỉnh sửa, lần mở sau ảnh sẽ hỏng. Vì vậy:
//  - khi lưu: ảnh gốc của tệp được thay bằng dấu đánh số (data-qms-img) thay vì địa chỉ tạm;
//  - khi mở lại: dấu đánh số được gắn lại bằng ảnh vừa lấy ra từ tệp gốc. Dữ liệu cũ lỡ lưu địa chỉ tạm đã chết
//    cũng được sửa theo thứ tự xuất hiện.
// Ảnh tạm 1x1 trong suốt HỢP LỆ (bản cũ dùng GIF cụt "R0lGODlhAQABAAAAACw=" nên trình duyệt hiện biểu tượng ảnh hỏng nếu chưa kịp thay ảnh thật).
export const IMG_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const OLD_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const isPlaceholder = (s: string) => s === IMG_PLACEHOLDER || s === OLD_PLACEHOLDER;

// orig  = ảnh gốc của tệp Word (đúng thứ tự như bản cũ để dữ liệu đã lưu trước đây vẫn khớp chỉ mục).
// shapes = ảnh do ứng dụng vẽ từ hình vẽ DrawingML (docxShapes), tách riêng để không làm lệch chỉ mục của ảnh gốc.
export function stashOriginalImages(root: HTMLElement, orig: string[], shapes: string[] = []) {
  if (!orig.length && !shapes.length) return;
  root.querySelectorAll('img').forEach((img) => {
    const s = img.getAttribute('src') || '';
    if (!s) return;
    const k = orig.indexOf(s);
    if (k >= 0) { img.setAttribute('data-qms-img', String(k)); img.setAttribute('src', IMG_PLACEHOLDER); return; }
    const j = shapes.indexOf(s);
    if (j >= 0) { img.setAttribute('data-qms-simg', String(j)); img.setAttribute('src', IMG_PLACEHOLDER); }
  });
}

// Ảnh chèn/dán từ ngoài vào (data:, http/https) được giữ nguyên; mọi ảnh còn lại không có nguồn hợp lệ đều phải được gắn lại ảnh gốc.
const isValidKeep = (s: string) => /^(data:image\/(?!gif;base64,R0lGODlhAQABA))/i.test(s) || /^https?:/i.test(s);

// Gắn lại ảnh gốc của tệp cho mọi ảnh đang là dấu đánh số / ảnh tạm / rỗng / địa chỉ blob đã chết / đã bị báo lỗi tải.
// Ảnh không xác định được chỉ số thì lấy lần lượt các ảnh gốc CHƯA được dùng (theo thứ tự xuất hiện), nên không để ảnh hỏng.
export function restoreOriginalImages(root: HTMLElement, orig: string[], shapes: string[] = []) {
  if (!orig.length && !shapes.length) return;
  const known = new Set([...orig, ...shapes]);
  const used = new Set<number>();
  const usedS = new Set<number>();
  const pending: HTMLImageElement[] = [];
  root.querySelectorAll('img').forEach((node) => {
    const img = node as HTMLImageElement;
    const s = img.getAttribute('src') || '';
    const mark = img.getAttribute('data-qms-img');
    const smark = img.getAttribute('data-qms-simg');
    const bad = img.getAttribute('data-qms-bad') !== null;
    if (smark !== null) {
      img.removeAttribute('data-qms-simg');
      const j = Number(smark);
      if (Number.isInteger(j) && shapes[j]) { img.setAttribute('src', shapes[j]); usedS.add(j); return; }
      pending.push(img); return;
    }
    if (mark !== null) {
      img.removeAttribute('data-qms-img');
      const k = Number(mark);
      if (Number.isInteger(k) && orig[k]) { img.setAttribute('src', orig[k]); used.add(k); return; }
      pending.push(img); return;
    }
    if (known.has(s) && !bad) { const k = orig.indexOf(s); if (k >= 0) used.add(k); else { const j = shapes.indexOf(s); if (j >= 0) usedS.add(j); } return; }
    if (!bad && s && !isPlaceholder(s) && !s.startsWith('blob:') && isValidKeep(s)) return; // ảnh người dùng tự chèn
    pending.push(img);
  });
  if (!pending.length) return;
  // nguồn dự phòng: ảnh gốc chưa dùng (theo thứ tự), hết thì đến ảnh vẽ chưa dùng
  const pool: string[] = [];
  orig.forEach((o, i) => { if (o && !used.has(i)) pool.push(o); });
  shapes.forEach((o, i) => { if (o && !usedS.has(i)) pool.push(o); });
  pending.forEach((img, n) => {
    img.removeAttribute('data-qms-bad');
    if (n < pool.length) img.setAttribute('src', pool[n]);
  });
}

// Quét lại sau khi dựng: ảnh nào đã tải xong mà không có kích thước thật (hỏng) thì đánh dấu và gắn lại ảnh gốc.
export function healBrokenImages(root: HTMLElement, orig: string[], shapes: string[] = []) {
  let any = false;
  root.querySelectorAll('img').forEach((node) => {
    const img = node as HTMLImageElement;
    if (img.complete && img.naturalWidth === 0) { img.setAttribute('data-qms-bad', '1'); any = true; }
  });
  if (any) restoreOriginalImages(root, orig, shapes);
}

// Thư viện dựng Word tách đoạn chứa ảnh "nổi" (wp:anchor) thành: <p>trống</p> <div ảnh/> <p>trống</p> và đặt ảnh SAU đoạn trống đầu,
// khiến ảnh (vd. chữ ký trong bảng) bị rơi thấp hơn vị trí đúng khoảng một dòng và lệch ra khỏi ô. Trong Word, ảnh được tính từ
// ĐẦU đoạn chứa nó, nên đưa khối ảnh lên trước đoạn trống đó. Làm một lần cho mỗi ảnh (đánh dấu data-qms-anchor), an toàn khi gọi lại.
export function fixAnchoredImages(root: HTMLElement) {
  root.querySelectorAll('div').forEach((div) => {
    const el = div as HTMLElement;
    if (el.hasAttribute('data-qms-anchor')) return;
    const st = el.style;
    if (st.position !== 'relative' || st.width !== '0px' || st.height !== '0px') return;
    if (!el.querySelector(':scope > img')) return;
    const prev = el.previousElementSibling;
    const next = el.nextElementSibling;
    const emptyP = (n: Element | null) => !!n && n.tagName === 'P' && !(n.textContent || '').trim() && !n.querySelector('img,table');
    el.setAttribute('data-qms-anchor', '1');
    if (emptyP(prev) && emptyP(next) && prev!.parentNode) {
      // Đoạn trống rỗng hoàn toàn bị trình duyệt thu về chiều cao 0, trong khi Word vẫn tính đủ một dòng: thêm ký tự rộng 0 để giữ chiều cao dòng.
      if (!prev!.querySelector('br')) (prev!.querySelector('span') || prev!).appendChild(document.createTextNode('\u200b'));
      prev!.parentNode.insertBefore(el, prev);
      next!.remove(); // đoạn trống thứ hai chỉ là phần thừa do thư viện tách đoạn, không có trong tệp Word gốc
    }
  });
}
