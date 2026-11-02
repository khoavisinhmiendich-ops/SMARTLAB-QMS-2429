// Mã tài liệu ổn định giữa mọi máy/hệ điều hành. Dùng được ở trình duyệt, middleware và máy chủ (không import module Node).
// Trước đây mã được tạo từ đường dẫn có dấu phân cách của hệ điều hành ("\" trên Windows, "/" trên Linux/Vercel) và đúng theo cách tên được giải nén
// (NFC/NFD, dạng "#U00e1"), nên CÙNG MỘT TỆP có thể có nhiều mã khác nhau ở các máy khác nhau → dữ liệu nhập không đồng bộ được.
// Mã chuẩn = base64url của đường dẫn tương đối trong public/2429.2026, tách bằng "/", đã giải mã "#UXXXX" và chuẩn hóa Unicode NFC.
const decodeEsc = (s: string) => s.replace(/#U([0-9a-f]{4})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
export const normalizeRel = (rel: string) => decodeEsc(rel).normalize('NFC').split(/[\\/]+/).filter(Boolean).join('/');
function enc(s: string): string {
  let bin = ''; new TextEncoder().encode(s).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function dec(id: string): string {
  try {
    const b = id.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(b.padEnd(Math.ceil(b.length / 4) * 4, '='));
    const out = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    return /\.[a-z0-9]{2,5}$/i.test(out) ? out : ''; // chỉ coi là đường dẫn tệp khi có đuôi tệp
  } catch { return ''; }
}
export const idFromRel = (rel: string) => enc(normalizeRel(rel));
export const relFromId = (id: string) => dec(id);
// Đổi mã bất kỳ (kể cả mã cũ theo kiểu "\" hoặc NFD) về mã chuẩn; mã không phải đường dẫn (vd. "locked-0") giữ nguyên.
export function canonicalId(id: string): string { const r = dec(id); return r ? idFromRel(r) : id; }
// Mọi biến thể mã mà dữ liệu của cùng một tệp có thể đã được lưu (mã chuẩn đứng đầu).
export function idVariants(id: string): string[] {
  const r = dec(id); if (!r) return [id];
  const n = normalizeRel(r); const set = new Set<string>();
  [enc(n), id, enc(r), enc(n.replace(/\//g, '\\')), enc(n.normalize('NFD')), enc(n.normalize('NFD').replace(/\//g, '\\'))].forEach((v) => set.add(v));
  return Array.from(set);
}
