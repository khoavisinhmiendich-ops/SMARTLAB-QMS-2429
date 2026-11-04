import crypto from 'node:crypto';
import { supabase, explainSupabaseError } from './storage';
import { DriveError, driveEnv, ensureFolder, uploadJson, uploadHtmlAsDoc, downloadText, listFiles, writeState, type DriveFile } from './drive';
import { canonicalId, idVariants } from './docId';
import { auditLog } from './security';
// Lưu trữ hai chiều Supabase <-> Google Drive:
//  - "due": bản ghi không được sửa quá N ngày (mặc định 60) được chép lên Drive, kiểm tra toàn vẹn (MD5), rồi thay nội dung trong Supabase
//    bằng một "con trỏ" nhỏ -> giải phóng dung lượng Supabase. Mở lại tài liệu thì nội dung tự lấy từ Drive (lazy restore).
//  - "copy": chép bản sao lên Drive nhưng GIỮ nguyên dữ liệu trong Supabase.
//  - nhập ngược: nạp tệp sao lưu từ Drive vào Supabase (thêm mới, thay con trỏ bằng nội dung thật, hoặc cập nhật bản mới hơn).
export type Stub = { archived: true; archive: { provider: 'gdrive'; fileId: string; md5?: string; bytes: number; archivedAt: string; version: number; name: string }; savedAt?: number };
export const isStub = (d: any): d is Stub => !!d && typeof d === 'object' && d.archived === true && !!d.archive && typeof d.archive.fileId === 'string';
const SCHEMA = 'smartlab-qms-archive-v1';
const MIN_BYTES = 8192; // bản ghi nhỏ hơn không đáng chuyển đi
const did = (docId: string) => crypto.createHash('sha1').update(docId).digest('hex');
function readable(docId: string): string {
  let base = docId;
  try { const s = Buffer.from(docId, 'base64url').toString('utf8'); if (/[\\/]/.test(s) || /\.(docx|xlsx|pdf)$/i.test(s)) base = s.split(/[\\/]/).pop() || s; } catch { /* dùng mã gốc */ }
  return base.replace(/\.(docx|xlsx|pdf)$/i, '').replace(/[^\p{L}\p{N}._ -]+/gu, '_').trim().slice(0, 70) || 'record';
}
export type ArchiveRun = { at: string; mode: 'due' | 'copy'; afterDays: number; scanned: number; archived: number; copied: number; skipped: number; raced: number; failed: number; bytes: number; errors: string[]; durationMs: number; done: boolean };
let running = false;

type Row = { id: string; document_id: string; form_id?: string | null; user_id: string; data: any; version?: number | null; created_at?: string; updated_at: string };

async function driveHas(folderId: string, docId: string, version: number): Promise<boolean> {
  const q = "appProperties has { key='did' and value='" + did(docId) + "' } and appProperties has { key='ver' and value='" + version + "' }";
  const r = await listFiles(folderId, q, undefined, 1);
  return r.files.length > 0;
}
const escHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Tạo thêm bản Google Docs đọc được cạnh tệp JSON. Lỗi ở bước này KHÔNG ảnh hưởng sao lưu chính.
async function viewCopy(row: Row, ver: number, folder: string): Promise<void> {
  try {
    const html = typeof row.data?.editedContent === 'string' ? row.data.editedContent : '';
    if (!html.trim() || html.length > 9_000_000) return;
    const note = typeof row.data?.note === 'string' && row.data.note.trim() ? '<p><b>Ghi chú:</b> ' + escHtml(row.data.note) + '</p><hr>' : '';
    const page = '<!doctype html><html><head><meta charset="utf-8"><title>' + escHtml(readable(row.document_id)) + '</title></head><body>' + note + html + '</body></html>';
    await uploadHtmlAsDoc(readable(row.document_id) + ' (bản xem v' + ver + ')', page, { vdid: did(row.document_id), ver: String(ver), kind: 'view' }, folder);
  } catch { /* bản xem là phần bổ sung, bỏ qua lỗi */ }
}
const payloadOf = (row: Row, ts: string) => ({ schema: SCHEMA, document_id: row.document_id, form_id: row.form_id ?? null, user_id: row.user_id, version: Number(row.version) || 0, created_at: row.created_at, updated_at: row.updated_at, archived_at: ts, data: row.data });

export async function runArchive(opts: { mode?: 'due' | 'copy'; limit?: number; afterDays?: number; maxMs?: number } = {}): Promise<ArchiveRun> {
  if (running) throw new DriveError('busy', 'Một lần sao lưu khác đang chạy: hãy đợi rồi thử lại.');
  const db = supabase();
  if (!db) throw new DriveError('no_supabase', 'Chưa cấu hình Supabase nên không có dữ liệu để sao lưu lên Drive.');
  running = true;
  const t0 = Date.now(); const mode = opts.mode || 'due'; const afterDays = opts.afterDays ?? driveEnv().afterDays; const limit = Math.max(1, Math.min(opts.limit ?? 40, 200)); const maxMs = opts.maxMs ?? 50000;
  const run: ArchiveRun = { at: new Date().toISOString(), mode, afterDays, scanned: 0, archived: 0, copied: 0, skipped: 0, raced: 0, failed: 0, bytes: 0, errors: [], durationMs: 0, done: true };
  try {
    const folder = await ensureFolder();
    const cutoff = new Date(Date.now() - afterDays * 86400000).toISOString();
    let cursor = ''; let worked = 0;
    outer: while (true) {
      let q = db.from('form_records').select('id,document_id,form_id,user_id,data,version,created_at,updated_at').order('updated_at', { ascending: true }).limit(20);
      if (mode === 'due') q = q.lt('updated_at', cutoff);
      if (cursor) q = q.gt('updated_at', cursor);
      const got = await q;
      if (got.error) throw new Error(explainSupabaseError(got.error));
      const rows = (got.data || []) as Row[];
      if (!rows.length) break;
      for (const row of rows) {
        cursor = row.updated_at; run.scanned++;
        if (isStub(row.data)) { run.skipped++; continue; }
        const text = JSON.stringify(row.data ?? {});
        if (mode === 'due' && Buffer.byteLength(text) < MIN_BYTES) { run.skipped++; continue; }
        if (!row.data || (typeof row.data === 'object' && !Object.keys(row.data).length)) { run.skipped++; continue; }
        if (worked >= limit || Date.now() - t0 > maxMs) { run.done = false; break outer; }
        try {
          const ver = Number(row.version) || 0;
          if (mode === 'copy' && await driveHas(folder, row.document_id, ver)) { run.skipped++; continue; }
          const ts = new Date().toISOString();
          const up = await uploadJson(readable(row.document_id) + '__v' + ver + '__' + ts.replace(/[:.]/g, '-') + '.json', payloadOf(row, ts), { did: did(row.document_id), ver: String(ver), kind: mode === 'due' ? 'archive' : 'copy' }, folder);
          if (up.md5 && up.md5 !== up.localMd5) throw new Error('Kiểm tra toàn vẹn MD5 không khớp sau khi tải lên Drive (không xóa dữ liệu trong Supabase).');
          worked++; run.bytes += up.size; await viewCopy(row, ver, folder);
          if (mode === 'copy') { run.copied++; continue; }
          const stub: Stub = { archived: true, archive: { provider: 'gdrive', fileId: up.id, md5: up.md5 || up.localMd5, bytes: up.size, archivedAt: ts, version: ver, name: readable(row.document_id) }, savedAt: Number(row.data?.savedAt) || undefined };
          let u = db.from('form_records').update({ data: stub }).eq('id', row.id).eq('updated_at', row.updated_at);
          if (row.version !== undefined && row.version !== null) u = u.eq('version', row.version);
          const res = await u.select('id');
          if (res.error) throw new Error(explainSupabaseError(res.error));
          if (!res.data?.length) { run.raced++; continue; } // có người vừa sửa: giữ nguyên, lần sau xử lý
          run.archived++;
        } catch (e) {
          run.failed++; if (run.errors.length < 5) run.errors.push((e instanceof Error ? e.message : String(e)) + ' [' + readable(row.document_id) + ']');
          if (e instanceof DriveError && ['quota', 'invalid_grant', 'network', 'not_connected', 'api_disabled'].includes(e.code)) { run.done = false; break outer; } // lỗi chung: dừng sớm
        }
      }
      if (rows.length < 20) break;
    }
  } finally {
    run.durationMs = Date.now() - t0; running = false;
  }
  await writeState({ lastRun: run }).catch(() => false);
  await auditLog('data', 'drive_archive_run', { mode, scanned: run.scanned, archived: run.archived, copied: run.copied, failed: run.failed }).catch(() => {});
  return run;
}

// Lấy lại nội dung thật từ Drive cho một "con trỏ" (dùng khi mở tài liệu đã được lưu trữ).
export async function rehydrate(stub: Stub): Promise<any> {
  const text = await downloadText(stub.archive.fileId);
  let obj: any; try { obj = JSON.parse(text); } catch { throw new DriveError('corrupt', 'Tệp sao lưu trên Drive bị hỏng (không đọc được JSON).'); }
  if (obj?.schema !== SCHEMA || obj.data === undefined) throw new DriveError('corrupt', 'Tệp trên Drive không phải bản sao lưu của ứng dụng.');
  if (stub.archive.md5) { const m = crypto.createHash('md5').update(Buffer.from(text, 'utf8')).digest('hex'); if (m !== stub.archive.md5) throw new DriveError('corrupt', 'Tệp sao lưu trên Drive đã bị thay đổi (MD5 không khớp).'); }
  return obj.data;
}

export async function listArchive(pageToken?: string, pageSize = 50): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const folder = await ensureFolder();
  return listFiles(folder, "(appProperties has { key='kind' and value='archive' } or appProperties has { key='kind' and value='copy' })", pageToken, pageSize);
}

export type ImportResult = { imported: number; rehydrated: number; skipped: number; failed: number; errors: string[]; nextPageToken?: string };
// Nạp tệp sao lưu từ Drive vào Supabase (hai chiều: Drive -> Supabase).
export async function importFromDrive(o: { fileIds?: string[]; all?: boolean; pageToken?: string; overwrite?: boolean }): Promise<ImportResult> {
  const db = supabase(); if (!db) throw new DriveError('no_supabase', 'Chưa cấu hình Supabase nên không có nơi để nạp dữ liệu.');
  const out: ImportResult = { imported: 0, rehydrated: 0, skipped: 0, failed: 0, errors: [] };
  let ids = o.fileIds || [];
  if (o.all) { const l = await listArchive(o.pageToken, 25); ids = l.files.sort((a, b) => (Number(a.appProperties.ver) || 0) - (Number(b.appProperties.ver) || 0)).map((f) => f.id); out.nextPageToken = l.nextPageToken; }
  for (const fid of ids.slice(0, 50)) {
    try {
      const obj: any = JSON.parse(await downloadText(fid));
      if (obj?.schema !== SCHEMA || !obj.document_id || obj.data === undefined) { out.skipped++; continue; }
      const docId = canonicalId(String(obj.document_id)); const user = String(obj.user_id || 'anonymous'); const ver = Number(obj.version) || 0;
      const ex = await db.from('form_records').select('id,version,data,document_id').in('document_id', idVariants(docId)).eq('user_id', user).order('updated_at', { ascending: false }).limit(1);
      if (ex.error) throw new Error(explainSupabaseError(ex.error));
      const cur = ex.data?.[0] as any;
      if (!cur) {
        const base = { document_id: docId, form_id: obj.form_id ?? null, user_id: user, data: obj.data, created_at: obj.created_at || undefined, updated_at: obj.updated_at || new Date().toISOString() };
        let ins: any = await db.from('form_records').insert({ ...base, version: ver || 1 }).select('id');
        if (ins.error) ins = await db.from('form_records').insert(base).select('id'); // bảng cũ chưa có cột version
        if (ins.error) throw new Error(explainSupabaseError(ins.error));
        out.imported++; continue;
      }
      const curVer = Number(cur.version) || 0;
      if (isStub(cur.data)) { // thay con trỏ bằng nội dung thật, giữ nguyên số phiên bản
        if (ver < (Number(cur.data.archive.version) || curVer) && !o.overwrite) { out.skipped++; continue; } // tệp cũ hơn bản đang lưu trữ: bỏ qua
        const up = await db.from('form_records').update({ data: obj.data }).eq('id', cur.id).select('id');
        if (up.error) throw new Error(explainSupabaseError(up.error));
        out.rehydrated++; continue;
      }
      if (ver > curVer || o.overwrite) {
        const up = await db.from('form_records').update({ data: obj.data, version: Math.max(curVer, ver) + (o.overwrite && ver <= curVer ? 1 : 0), updated_at: new Date().toISOString() }).eq('id', cur.id).select('id');
        if (up.error) throw new Error(explainSupabaseError(up.error));
        out.imported++;
      } else out.skipped++;
    } catch (e) { out.failed++; if (out.errors.length < 5) out.errors.push(e instanceof Error ? e.message : String(e)); if (e instanceof DriveError && ['invalid_grant', 'network', 'not_connected'].includes(e.code)) break; }
  }
  await auditLog('data', 'drive_import', { imported: out.imported, rehydrated: out.rehydrated, skipped: out.skipped, failed: out.failed }).catch(() => {});
  return out;
}
