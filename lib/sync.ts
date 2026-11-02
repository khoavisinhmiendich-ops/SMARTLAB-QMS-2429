// Đồng bộ phía trình duyệt: trạng thái chung (để hiện thông báo), gửi bản ghi lên máy chủ, phân loại lỗi
// (mất mạng/Wi-Fi, máy chủ ứng dụng, Supabase, phiên đăng nhập...) và tự đẩy các thay đổi đang chờ trong IndexedDB.
import { idbAll, idbPut, type IdbRecord } from './idb';

export type SyncErrorKind = 'offline' | 'server' | 'supabase' | 'drive' | 'config' | 'auth' | 'conflict' | 'blocked' | 'storage';
export type SyncState = {
  online: boolean; pending: number; conflicts: number;
  error: null | { kind: SyncErrorKind; message: string; docId?: string; at: number };
  okAt: number | null; okCount: number; syncing: boolean; active: string | null;
};
const SERVER_STATE: SyncState = { online: true, pending: 0, conflicts: 0, error: null, okAt: null, okCount: 0, syncing: false, active: null };
let state: SyncState = SERVER_STATE;
const subs = new Set<() => void>();
const set = (p: Partial<SyncState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };

export const bus = {
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  get: () => state,
  getServer: () => SERVER_STATE,
  setOnline(v: boolean) { if (state.online !== v) set({ online: v }); },
  setCounts(pending: number, conflicts: number) { if (state.pending !== pending || state.conflicts !== conflicts) set({ pending, conflicts }); },
  setSyncing(v: boolean) { if (state.syncing !== v) set({ syncing: v }); },
  setActive(id: string | null) { set({ active: id }); },
  fail(kind: SyncErrorKind, message: string, docId?: string) { set({ error: { kind, message, docId, at: Date.now() } }); },
  // Lưu/đồng bộ thành công: xóa lỗi kết nối (lỗi xung đột/bộ nhớ vẫn giữ để người dùng xử lý).
  ok(count = 0) {
    const keep = state.error && (state.error.kind === 'conflict' || state.error.kind === 'storage');
    set({ error: keep ? state.error : null, okAt: Date.now(), okCount: state.okCount + count });
  },
  clearError() { set({ error: null }); },
};

export async function refreshPending(): Promise<void> {
  try {
    const all = await idbAll();
    bus.setCounts(all.filter((r) => r.unsynced).length, all.filter((r) => r.conflict).length);
  } catch { /* IndexedDB không khả dụng: bỏ qua */ }
}

// Tên hiển thị của tài liệu từ mã (mã = đường dẫn tệp mã hóa base64url).
export function docLabel(id: string): string {
  try {
    const s = decodeURIComponent(escape(atob(id.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(id.length / 4) * 4, '='))));
    const base = s.split(/[\\/]/).pop() || s;
    return base.replace(/\.(docx|xlsx|pdf)$/i, '');
  } catch { return id.slice(0, 24); }
}

async function fetchTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); }
}

export type PushOutcome =
  | { kind: 'ok'; version: number | null }
  | { kind: 'conflict'; row: any }
  | { kind: 'too-large' }
  | { kind: 'offline' | 'server' | 'supabase' | 'drive' | 'config' | 'auth' | 'blocked'; message: string };

// Gửi một bản ghi lên /api/records và phân loại kết quả/lỗi (dùng chung cho trang tài liệu và bộ đẩy nền).
export async function postRecord(docId: string, data: { note: string; editedContent: string; savedAt: number }, baseRev: number | undefined, opts?: { keepalive?: boolean }): Promise<PushOutcome> {
  const body = JSON.stringify({ document_id: docId, data, user_id: 'anonymous', base_rev: baseRev });
  let r: Response;
  try {
    r = await fetchTimeout('/api/records', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: !!opts?.keepalive && body.length < 60000 }, 30000);
  } catch {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { kind: 'offline', message: 'Mất kết nối mạng/Wi-Fi.' };
    return { kind: 'server', message: 'Không kết nối được máy chủ ứng dụng (mạng vẫn bật): máy chủ đang tắt/khởi động lại hoặc đường truyền chập chờn.' };
  }
  const ctype = r.headers.get('content-type') || '';
  // Hết phiên đăng nhập: middleware chuyển sang trang /login (HTML) — không được coi là đã lưu thành công.
  if (r.redirected || !ctype.includes('json')) return { kind: 'auth', message: 'Phiên đăng nhập đã hết hạn hoặc bị chuyển hướng. Hãy đăng nhập lại (dữ liệu vẫn được giữ trong trình duyệt).' };
  const v = await r.json().catch(() => null);
  if (r.ok) return v && v.data ? { kind: 'ok', version: v.data.version !== undefined && v.data.version !== null ? Number(v.data.version) || 0 : null } : { kind: 'server', message: 'Máy chủ trả về dữ liệu không hợp lệ.' };
  if (r.status === 409) return { kind: 'conflict', row: v?.data };
  if (r.status === 413) return { kind: 'too-large' };
  if (r.status === 403) return { kind: 'blocked', message: v?.error || 'Thư mục được bảo vệ bằng passkey: hãy nhập passkey để đồng bộ.' };
  if (r.status === 503) return { kind: 'config', message: v?.error || 'Máy chủ chưa cấu hình nơi lưu dữ liệu.' };
  if (v?.archived && v?.error) return { kind: 'drive', message: String(v.error) };
  if (v?.error) return { kind: 'supabase', message: String(v.error) };
  return { kind: 'server', message: 'Máy chủ phản hồi lỗi (HTTP ' + r.status + ').' };
}

export const statusTextFor = (o: Exclude<PushOutcome, { kind: 'ok' } | { kind: 'conflict' } | { kind: 'too-large' }>) => {
  switch (o.kind) {
    case 'offline': return 'Mất mạng/Wi-Fi — đã lưu an toàn trong trình duyệt (IndexedDB), sẽ tự đẩy lên khi có mạng lại.';
    case 'server': return 'Đã lưu trong trình duyệt; ' + o.message + ' Sẽ tự thử lại.';
    case 'supabase': return 'Đã lưu trong trình duyệt; LỖI SUPABASE: ' + o.message + ' Sẽ tự thử lại.';
    case 'drive': return 'Đã lưu trong trình duyệt; LỖI GOOGLE DRIVE: ' + o.message + ' Sẽ tự thử lại.';
    case 'auth': return 'Đã lưu trong trình duyệt; ' + o.message;
    case 'blocked': return 'Đã lưu trong trình duyệt; ' + o.message;
    default: return 'Đã lưu trong trình duyệt; ' + o.message;
  }
};

let flushing: Promise<{ pushed: number; remaining: number }> | null = null;
// Đẩy mọi thay đổi đang chờ trong IndexedDB lên máy chủ (bỏ qua tài liệu đang mở: trang tài liệu tự đồng bộ).
export function flushPending(): Promise<{ pushed: number; remaining: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let pushed = 0;
    bus.setSyncing(true);
    try {
      const all = await idbAll();
      const todo = all.filter((r) => r.unsynced && !r.conflict && r.id !== state.active);
      for (const rec of todo) {
        const out = await postRecord(rec.id, { note: rec.note || '', editedContent: rec.editedContent || '', savedAt: rec.savedAt || rec.updatedAt }, typeof rec.rev === 'number' ? rec.rev : undefined);
        if (out.kind === 'ok') {
          const cur = (await idbAll()).find((x) => x.id === rec.id);
          const same = !cur || (cur.savedAt === rec.savedAt && cur.editedContent === rec.editedContent && cur.note === rec.note);
          const next: IdbRecord = { ...(cur || rec), rev: out.version ?? rec.rev, unsynced: same ? false : true, updatedAt: Date.now() };
          await idbPut(next).catch(() => {});
          pushed++;
        } else if (out.kind === 'conflict') {
          await idbPut({ ...rec, conflict: true, updatedAt: Date.now() }).catch(() => {});
          bus.fail('conflict', 'Tài liệu "' + docLabel(rec.id) + '" đã được cập nhật ở thiết bị khác: hãy mở tài liệu để chọn bản giữ lại (bản của bạn vẫn được giữ trong trình duyệt).', rec.id);
        } else if (out.kind === 'too-large') {
          bus.fail('storage', 'Tài liệu "' + docLabel(rec.id) + '" quá lớn để lưu lên máy chủ (giới hạn khoảng 4 MB): hãy giảm số lượng/kích thước ảnh. Bản của bạn vẫn nằm trong trình duyệt.', rec.id);
        } else if (out.kind === 'blocked') {
          continue; // thư mục có passkey: để trang tài liệu xử lý khi người dùng mở
        } else {
          bus.fail(out.kind, out.message);
          break; // lỗi chung (mạng/Supabase/đăng nhập): dừng, thử lại sau
        }
      }
    } catch { /* IndexedDB lỗi: bỏ qua */ }
    await refreshPending();
    if (pushed > 0) bus.ok(pushed);
    bus.setSyncing(false);
    return { pushed, remaining: state.pending };
  })().finally(() => { flushing = null; });
  return flushing;
}

// Kiểm tra kết nối: mạng → máy chủ ứng dụng → Supabase. Trả về loại lỗi cụ thể để thông báo đúng nguyên nhân.
export async function probe(): Promise<{ ok: boolean; kind?: SyncErrorKind; message?: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, kind: 'offline', message: 'Mất kết nối mạng/Wi-Fi.' };
  let r: Response;
  try { r = await fetchTimeout('/api/sync/ping', { cache: 'no-store' }, 15000); }
  catch { return { ok: false, kind: (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'server', message: 'Không kết nối được máy chủ ứng dụng (mạng vẫn bật).' }; }
  if (r.redirected || !(r.headers.get('content-type') || '').includes('json')) return { ok: false, kind: 'auth', message: 'Phiên đăng nhập đã hết hạn: hãy đăng nhập lại.' };
  const v = await r.json().catch(() => null);
  if (r.ok && v?.ok) return { ok: true };
  return { ok: false, kind: 'supabase', message: String(v?.error || 'Supabase không truy cập được.') };
}
