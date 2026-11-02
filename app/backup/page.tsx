'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { idbAll, idbConflicts, type IdbRecord } from '@/lib/idb';
import { bus, docLabel, flushPending, probe, refreshPending } from '@/lib/sync';

type DriveStatus = { hasClient: boolean; connected: boolean; source: string | null; folderName: string; afterDays: number; lastRun: any; email: string; connectedAt: string | null; supabaseConfigured: boolean; cronConfigured: boolean; live?: boolean; driveError?: string; driveErrorCode?: string };
type DFile = { id: string; name: string; size: number; modifiedTime: string; appProperties: Record<string, string> };
const MSG: Record<string, string> = {
  connected: 'Đã kết nối Google Drive thành công.', denied: 'Bạn đã từ chối cấp quyền cho Google Drive.', badstate: 'Phiên kết nối hết hạn hoặc không hợp lệ: hãy bấm "Kết nối Google Drive" lại.',
  nocode: 'Google không trả về mã xác thực.', noclient: 'Chưa cấu hình GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.',
  norefresh: 'Google không cấp mã làm mới (ứng dụng đã được cấp quyền trước đó). Vào myaccount.google.com/permissions, thu hồi quyền của ứng dụng rồi kết nối lại.',
};
const fmtBytes = (n: number) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
const fmtTime = (s?: string | number | null) => { if (!s) return '—'; const d = new Date(s); return isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN'); };

async function api<T = any>(url: string, init?: RequestInit): Promise<T & { ok?: boolean; error?: string }> {
  let r: Response;
  try { r = await fetch(url, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } }); }
  catch { return { ok: false, error: navigator.onLine === false ? 'Mất kết nối mạng/Wi-Fi.' : 'Không kết nối được máy chủ ứng dụng.' } as any; }
  if (r.redirected || !(r.headers.get('content-type') || '').includes('json')) return { ok: false, error: 'Phiên đăng nhập đã hết hạn: hãy đăng nhập lại.' } as any;
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { ...j, ok: false, error: j.error || 'Lỗi HTTP ' + r.status };
}

export default function BackupPage() {
  const s = useSyncExternalStore(bus.subscribe, bus.get, bus.getServer);
  const [st, setSt] = useState<DriveStatus | null>(null);
  const [net, setNet] = useState<{ ok: boolean; message?: string; kind?: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [files, setFiles] = useState<DFile[] | null>(null);
  const [nextTok, setNextTok] = useState<string | undefined>();
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [overwrite, setOverwrite] = useState(false);
  const [local, setLocal] = useState<IdbRecord[]>([]);
  const [conflicts, setConflicts] = useState(0);
  const [banner, setBanner] = useState('');
  const add = (m: string) => setLog((l) => [new Date().toLocaleTimeString('vi-VN') + ' — ' + m, ...l].slice(0, 40));

  const loadLocal = useCallback(async () => { try { setLocal((await idbAll()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))); setConflicts((await idbConflicts()).length); } catch { setLocal([]); } await refreshPending(); }, []);
  const loadStatus = useCallback(async (check = true) => { const j = await api<DriveStatus>('/api/drive/status' + (check ? '?check=1' : '')); if (j.ok !== false) setSt(j as DriveStatus); }, []);
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('drive');
    if (q) setBanner(q.startsWith('error') ? 'Kết nối Google Drive lỗi: ' + (new URLSearchParams(location.search).get('msg') || '') : MSG[q] || '');
    void loadStatus(); void loadLocal(); void probe().then(setNet);
    const f = () => { void loadLocal(); }; window.addEventListener('qms-idb-changed', f); return () => window.removeEventListener('qms-idb-changed', f);
  }, [loadStatus, loadLocal]);

  const run = async (name: string, fn: () => Promise<void>) => { setBusy(name); try { await fn(); } catch (e) { add('Lỗi: ' + (e instanceof Error ? e.message : String(e))); } finally { setBusy(''); void loadStatus(); } };

  const archive = (mode: 'due' | 'copy') => run(mode, async () => {
    let tot = { archived: 0, copied: 0, skipped: 0, raced: 0, failed: 0, bytes: 0, scanned: 0 };
    for (let i = 0; i < 25; i++) {
      const j: any = await api('/api/drive/archive', { method: 'POST', body: JSON.stringify({ mode, limit: 30 }) });
      if (j.ok === false) { add((mode === 'due' ? 'Lưu trữ' : 'Sao lưu') + ' dừng: ' + j.error); break; }
      const r = j.run; for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += Number(r[k]) || 0;
      if (r.errors?.length) add('Cảnh báo: ' + r.errors.join(' | '));
      if (r.done || (r.archived + r.copied) === 0) break;
    }
    add((mode === 'due' ? 'Đã chuyển ' + tot.archived + ' bản ghi cũ lên Drive (giải phóng Supabase ~' + fmtBytes(tot.bytes) + ')' : 'Đã chép ' + tot.copied + ' bản sao lên Drive') + '; bỏ qua ' + tot.skipped + ', có người vừa sửa ' + tot.raced + ', lỗi ' + tot.failed + '.');
  });

  const listFiles = (more = false) => run('list', async () => {
    const j: any = await api('/api/drive/list' + (more && nextTok ? '?pageToken=' + encodeURIComponent(nextTok) : ''));
    if (j.ok === false) { add('Không tải được danh sách: ' + j.error); return; }
    setFiles((f) => (more && f ? [...f, ...j.files] : j.files)); setNextTok(j.nextPageToken);
    if (!j.files.length && !more) add('Thư mục sao lưu trên Drive chưa có tệp nào.');
  });
  const restore = (ids: string[]) => run('restore', async () => {
    const j: any = await api('/api/drive/restore', { method: 'POST', body: JSON.stringify({ fileIds: ids, overwrite }) });
    add(j.ok === false ? 'Nạp từ Drive lỗi: ' + j.error : 'Đã nạp ' + (j.imported + j.rehydrated) + ' bản ghi vào Supabase (mới ' + j.imported + ', thay con trỏ ' + j.rehydrated + '), bỏ qua ' + j.skipped + ', lỗi ' + j.failed + (j.errors?.length ? ' — ' + j.errors.join(' | ') : '') + '.');
  });
  const restoreAll = () => run('restoreAll', async () => {
    let tok: string | undefined; let imp = 0, reh = 0, skip = 0, fail = 0; const errs: string[] = [];
    for (let i = 0; i < 40; i++) {
      const j: any = await api('/api/drive/restore', { method: 'POST', body: JSON.stringify({ all: true, pageToken: tok, overwrite }) });
      if (j.ok === false) { errs.push(j.error); break; }
      imp += j.imported; reh += j.rehydrated; skip += j.skipped; fail += j.failed; errs.push(...(j.errors || []));
      tok = j.nextPageToken; if (!tok) break;
    }
    add('Nạp tất cả từ Drive: mới ' + imp + ', thay con trỏ ' + reh + ', bỏ qua ' + skip + ', lỗi ' + fail + (errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : '') + '.');
  });
  const flushNow = () => run('flush', async () => {
    const p = await probe(); setNet(p);
    if (!p.ok) { bus.fail((p.kind as any) || 'server', p.message || 'Lỗi kết nối.'); add('Chưa đẩy được: ' + p.message); return; }
    const r = await flushPending(); await loadLocal();
    add(r.pushed ? 'Đã đẩy ' + r.pushed + ' thay đổi lên máy chủ.' : r.remaining ? 'Còn ' + r.remaining + ' thay đổi chưa đẩy được (xem thông báo lỗi).' : 'Không còn thay đổi nào chờ đồng bộ.');
  });
  const backupLocal = () => run('local', async () => {
    const all = await idbAll(); const conf = await idbConflicts();
    const j: any = await api('/api/drive/local-backup', { method: 'POST', body: JSON.stringify({ records: all, conflicts: conf }) });
    add(j.ok === false ? 'Sao lưu dữ liệu trình duyệt lên Drive lỗi: ' + j.error : 'Đã sao lưu ' + j.count + ' bản ghi từ trình duyệt lên Google Drive (' + fmtBytes(j.bytes) + ').');
  });
  const exportLocal = async () => {
    const blob = new Blob([JSON.stringify({ schema: 'smartlab-qms-browser-backup-v1', saved_at: new Date().toISOString(), records: await idbAll(), conflicts: await idbConflicts() })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'smartlab-qms-trinh-duyet-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const pending = local.filter((r) => r.unsynced);
  const chosen = Object.keys(pick).filter((k) => pick[k]);
  const lr = st?.lastRun;
  return (
    <main className="main backup-page">
      <div className="viewer-head" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Link className="btn" href="/">← Quay lại</Link><div><strong>Sao lưu &amp; Đồng bộ dữ liệu</strong><div className="meta">Supabase · Google Drive · IndexedDB (bộ nhớ ngoại tuyến của trình duyệt)</div></div></div>
      </div>
      {banner && <div className="backup-note">{banner}</div>}

      <section className="backup-card">
        <h3>1. Kết nối &amp; đồng bộ</h3>
        <div className="backup-grid">
          <div><span className={'dot ' + (net ? (net.ok ? 'ok' : 'bad') : '')} /> Mạng / máy chủ / Supabase: <b>{net ? (net.ok ? 'bình thường' : net.kind === 'offline' ? 'mất mạng/Wi-Fi' : net.kind === 'supabase' ? 'lỗi Supabase' : 'lỗi kết nối') : 'đang kiểm tra…'}</b>{net && !net.ok && <div className="meta">{net.message}</div>}</div>
          <div>Thay đổi chờ đồng bộ (IndexedDB): <b>{pending.length}</b>{conflicts > 0 && <> · bản bị thay thế đã giữ lại: <b>{conflicts}</b></>}{s.error && <div className="meta" style={{ color: '#b3261e' }}>Lỗi gần nhất: {s.error.message}</div>}</div>
        </div>
        <div className="backup-actions"><button className="btn" disabled={!!busy} onClick={() => { void probe().then(setNet); void loadLocal(); }}>Kiểm tra lại kết nối</button><button className="btn primary" disabled={!!busy || !pending.length} onClick={flushNow}>Đẩy dữ liệu chờ ngay ({pending.length})</button></div>
        <p className="meta">Khi mất mạng/Wi-Fi hoặc Supabase lỗi, mọi chỉnh sửa vẫn được lưu trong IndexedDB của trình duyệt; khi kết nối lại hệ thống tự đẩy lên và hiển thị đúng ở tài liệu đã sửa. Thông báo lỗi hiện ở góc dưới bên trái mọi trang.</p>
      </section>

      <section className="backup-card">
        <h3>2. Sao lưu lên Google Drive (Supabase → Drive)</h3>
        {!st ? <p className="meta">Đang tải…</p> : !st.hasClient ? (
          <div className="backup-note">Chưa cấu hình Google. Thêm vào <code>.env.local</code>: <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> (tạo ở Google Cloud Console → OAuth client "Web application", Authorized redirect URI = <code>{typeof location !== 'undefined' ? location.origin : ''}/api/drive/callback</code>, bật Google Drive API), rồi khởi động lại. Xem README mục "Sao lưu Google Drive".</div>
        ) : !st.connected ? (
          <div className="backup-actions"><a className="btn primary" href="/api/drive/connect">Kết nối Google Drive</a></div>
        ) : (
          <>
            <div className="backup-grid">
              <div><span className={'dot ' + (st.live === false ? 'bad' : st.live ? 'ok' : '')} /> Google Drive: <b>{st.live === false ? 'lỗi' : st.live ? 'đã kết nối' : 'đang kiểm tra…'}</b>{st.email && <> · {st.email}</>}{st.driveError && <div className="meta" style={{ color: '#b3261e' }}>{st.driveError}{st.driveErrorCode === 'invalid_grant' && <> <a href="/api/drive/connect">Kết nối lại</a></>}</div>}</div>
              <div>Thư mục: <b>{st.folderName}</b> · tự động lưu trữ bản ghi không sửa quá <b>{st.afterDays} ngày</b></div>
            </div>
            <div className="backup-actions">
              <button className="btn primary" disabled={!!busy || !st.supabaseConfigured} onClick={() => archive('due')}>{busy === 'due' ? 'Đang lưu trữ…' : 'Lưu trữ ngay bản ghi cũ (giải phóng Supabase)'}</button>
              <button className="btn" disabled={!!busy || !st.supabaseConfigured} onClick={() => archive('copy')}>{busy === 'copy' ? 'Đang sao lưu…' : 'Sao lưu bản sao toàn bộ (giữ nguyên Supabase)'}</button>
              <a className="btn" href="/api/drive/connect">Kết nối lại</a>
            </div>
            {!st.supabaseConfigured && <p className="meta">Chưa cấu hình Supabase nên chưa có dữ liệu để lưu trữ.</p>}
            {lr && <p className="meta">Lần chạy gần nhất ({fmtTime(lr.at)}, {lr.mode === 'due' ? 'lưu trữ' : 'sao lưu bản sao'}): xem {lr.scanned}, chuyển {lr.archived}, chép {lr.copied}, bỏ qua {lr.skipped}, lỗi {lr.failed}{lr.errors?.length ? ' — ' + lr.errors[0] : ''}.</p>}
            <p className="meta">Tự động: máy chủ Node kiểm tra mỗi 6 giờ; trên Vercel dùng lịch trong <code>vercel.json</code> (cần đặt <code>CRON_SECRET</code>{st.cronConfigured ? ' — đã đặt' : ' — chưa đặt'}). Mở lại tài liệu đã lưu trữ thì nội dung tự lấy về từ Drive.</p>
          </>
        )}
      </section>

      <section className="backup-card">
        <h3>3. Nạp từ Google Drive về Supabase (Drive → Supabase)</h3>
        <div className="backup-actions">
          <button className="btn" disabled={!!busy || !st?.connected} onClick={() => listFiles(false)}>Tải danh sách tệp trên Drive</button>
          <button className="btn primary" disabled={!!busy || !st?.connected || !st?.supabaseConfigured} onClick={restoreAll}>{busy === 'restoreAll' ? 'Đang nạp…' : 'Nạp tất cả (bỏ qua bản cũ hơn)'}</button>
          <button className="btn" disabled={!!busy || !chosen.length || !st?.supabaseConfigured} onClick={() => restore(chosen)}>Nạp mục đã chọn ({chosen.length})</button>
          <label className="meta" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Cho phép ghi đè cả bản mới hơn trong Supabase</label>
        </div>
        {files && (
          <div className="backup-table">
            <table><thead><tr><th /><th>Tệp</th><th>Loại</th><th>Phiên bản</th><th>Dung lượng</th><th>Thời gian</th></tr></thead>
              <tbody>{files.map((f) => (
                <tr key={f.id}><td><input type="checkbox" checked={!!pick[f.id]} onChange={(e) => setPick((p) => ({ ...p, [f.id]: e.target.checked }))} /></td><td>{f.name}</td><td>{f.appProperties.kind === 'copy' ? 'bản sao' : f.appProperties.kind === 'browser' ? 'trình duyệt' : 'lưu trữ'}</td><td>{f.appProperties.ver || '—'}</td><td>{fmtBytes(f.size)}</td><td>{fmtTime(f.modifiedTime)}</td></tr>
              ))}</tbody></table>
            {nextTok && <button className="btn" disabled={!!busy} onClick={() => listFiles(true)}>Tải thêm</button>}
          </div>
        )}
      </section>

      <section className="backup-card">
        <h3>4. Dữ liệu trong trình duyệt này (IndexedDB)</h3>
        <div className="backup-actions"><button className="btn" disabled={!!busy || !st?.connected || !local.length} onClick={backupLocal}>Sao lưu lên Google Drive</button><button className="btn" disabled={!local.length} onClick={exportLocal}>Tải về tệp JSON</button></div>
        {!local.length ? <p className="meta">Chưa có dữ liệu nào trong trình duyệt này.</p> : (
          <div className="backup-table"><table><thead><tr><th>Tài liệu</th><th>Trạng thái</th><th>Phiên bản máy chủ</th><th>Lưu lúc</th></tr></thead>
            <tbody>{local.slice(0, 60).map((r) => (<tr key={r.id}><td><Link href={'/documents/' + encodeURIComponent(r.id)}>{docLabel(r.id)}</Link></td><td>{r.conflict ? 'xung đột — cần chọn bản' : r.unsynced ? 'chờ đồng bộ' : 'đã đồng bộ'}</td><td>{r.rev ?? '—'}</td><td>{fmtTime(r.savedAt || r.updatedAt)}</td></tr>))}</tbody></table></div>
        )}
      </section>

      {log.length > 0 && <section className="backup-card"><h3>Nhật ký</h3><div className="backup-log">{log.map((l, i) => <div key={i}>{l}</div>)}</div></section>}
    </main>
  );
}
