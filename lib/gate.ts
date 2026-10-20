// Dùng được cả ở trình duyệt, middleware (Edge) và máy chủ: KHÔNG import module Node ở đây.
// Thư mục "Các BM khác" được bảo vệ bằng passkey (cookie qms_bm sau khi nhập đúng).
export const GATE_COOKIE='qms_bm';
export const GATE_TTL_SECONDS=8*60*60;
const GATED_NAMES=['các bm khác'];
// Tên thư mục có thể bị ZIP đổi thành dạng "C#U00e1c BM kh#U00e1c": giải mã trước khi so sánh.
export function decodeEscapes(s:string):string{
  return s.replace(/#U([0-9a-f]{4})/ig,(_,h:string)=>String.fromCharCode(parseInt(h,16))).normalize('NFC');
}
export function isGatedName(name:string|undefined|null):boolean{
  if(!name)return false;
  return GATED_NAMES.includes(decodeEscapes(name).trim().toLocaleLowerCase('vi'));
}
// rel: đường dẫn tương đối trong public/2429.2026 (phân tách bằng / hoặc \).
export function isGatedRelPath(rel:string):boolean{
  return rel.split(/[\\/]/).some(isGatedName);
}
