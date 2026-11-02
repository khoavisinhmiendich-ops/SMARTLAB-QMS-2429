// Kho lưu trữ trong trình duyệt bằng IndexedDB: giữ bản chỉnh sửa khi mất mạng/Wi-Fi hoặc lỗi Supabase,
// dung lượng lớn hơn localStorage (~5 MB) nên tài liệu nhiều ảnh vẫn lưu được. Chỉ dùng ở phía trình duyệt.
export type IdbRecord = {
  id: string; // mã tài liệu chuẩn (canonicalId)
  note?: string;
  editedContent?: string;
  savedAt?: number;
  rev?: number; // phiên bản bản ghi trên máy chủ mà bản này dựa trên
  unsynced?: boolean; // còn thay đổi chưa đẩy lên máy chủ
  conflict?: boolean; // máy chủ đã có bản mới hơn: cần người dùng chọn bản (xử lý khi mở tài liệu)
  updatedAt: number;
};
const DB_NAME = 'smartlab-qms', DB_VER = 1;
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Trình duyệt không hỗ trợ hoặc đang chặn IndexedDB.'));
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const q = indexedDB.open(DB_NAME, DB_VER);
    q.onupgradeneeded = () => {
      const db = q.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('conflicts')) db.createObjectStore('conflicts', { keyPath: 'key', autoIncrement: true });
    };
    q.onsuccess = () => { const db = q.result; db.onversionchange = () => { db.close(); dbp = null; }; resolve(db); };
    q.onerror = () => { dbp = null; reject(q.error || new Error('Không mở được IndexedDB.')); };
  });
  return dbp;
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | null): Promise<T | undefined> {
  const db = await open();
  return new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction(store, mode);
    let out: T | undefined;
    const rq = fn(t.objectStore(store));
    if (rq) rq.onsuccess = () => { out = rq.result; };
    t.oncomplete = () => resolve(out); // chỉ báo thành công khi giao dịch đã ghi xong
    t.onerror = () => reject(t.error || new Error('Lỗi ghi IndexedDB.'));
    t.onabort = () => reject(t.error || new Error('Giao dịch IndexedDB bị hủy (có thể bộ nhớ đã đầy).'));
  });
}
const changed = () => { try { window.dispatchEvent(new Event('qms-idb-changed')); } catch { /* bỏ qua */ } };

export async function idbGet(id: string): Promise<IdbRecord | null> {
  return ((await run<IdbRecord>('records', 'readonly', (s) => s.get(id))) as IdbRecord | undefined) || null;
}
export async function idbPut(rec: IdbRecord): Promise<void> {
  await run('records', 'readwrite', (s) => s.put(rec));
  changed();
}
export async function idbDelete(id: string): Promise<void> {
  await run('records', 'readwrite', (s) => s.delete(id));
  changed();
}
export async function idbAll(): Promise<IdbRecord[]> {
  return ((await run<IdbRecord[]>('records', 'readonly', (s) => s.getAll())) as IdbRecord[] | undefined) || [];
}
// Bản của người dùng bị thay thế khi xử lý xung đột vẫn được giữ lại ở đây.
export async function idbAddConflict(obj: Record<string, unknown>): Promise<void> {
  await run('conflicts', 'readwrite', (s) => s.add({ ...obj, stashedAt: new Date().toISOString() }));
}
export async function idbConflicts(): Promise<Array<Record<string, unknown>>> {
  return ((await run<Array<Record<string, unknown>>>('conflicts', 'readonly', (s) => s.getAll())) as Array<Record<string, unknown>> | undefined) || [];
}
