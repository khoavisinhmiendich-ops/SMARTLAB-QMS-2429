'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { bus, flushPending, probe, refreshPending, docLabel } from '@/lib/sync';

// Chạy ở mọi trang (trừ đăng nhập): theo dõi mạng, tự đẩy các thay đổi chờ trong IndexedDB khi có mạng lại
// và hiện thông báo rõ ràng khi mất mạng/Wi-Fi hoặc Supabase/máy chủ lỗi.
export default function SyncCenter() {
  const path = usePathname() || '/';
  const s = useSyncExternalStore(bus.subscribe, bus.get, bus.getServer);
  const [toast, setToast] = useState(false);
  const [hidden, setHidden] = useState<number>(0); // thời điểm lỗi đã bị người dùng ẩn
  const off = path === '/login';
  const lastOk = useRef<number | null>(null);

  useEffect(() => {
    if (off) return;
    let stopped = false;
    bus.setOnline(navigator.onLine);
    const sync = async () => {
      if (stopped) return;
      await refreshPending();
      const st = bus.get();
      if (!navigator.onLine) { if (!st.error || st.error.kind !== 'offline') bus.fail('offline', 'Mất kết nối mạng/Wi-Fi.'); return; }
      const needsProbe = !!st.error && ['offline', 'server', 'supabase', 'drive', 'config', 'auth'].includes(st.error.kind);
      if (needsProbe || st.pending > 0) {
        const p = await probe();
        if (stopped) return;
        if (!p.ok) { bus.fail(p.kind || 'server', p.message || 'Lỗi kết nối.'); return; }
        if (needsProbe && st.pending === 0) bus.ok(0);
      }
      if (bus.get().pending > 0) await flushPending();
    };
    const onOnline = () => { bus.setOnline(true); void sync(); };
    const onOffline = () => { bus.setOnline(false); bus.fail('offline', 'Mất kết nối mạng/Wi-Fi.'); };
    const onIdb = () => { void refreshPending(); };
    const onVis = () => { if (document.visibilityState === 'visible') void sync(); };
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    window.addEventListener('qms-idb-changed', onIdb); document.addEventListener('visibilitychange', onVis);
    void sync();
    const iv = setInterval(() => { void sync(); }, 15000);
    return () => { stopped = true; clearInterval(iv); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); window.removeEventListener('qms-idb-changed', onIdb); document.removeEventListener('visibilitychange', onVis); };
  }, [off]);

  // Thông báo "đã đồng bộ" tự tắt sau 6 giây.
  useEffect(() => {
    if (s.okCount > (lastOk.current || 0)) { lastOk.current = s.okCount; setToast(true); const t = setTimeout(() => setToast(false), 6000); return () => clearTimeout(t); }
  }, [s.okCount]);

  if (off) return null;
  const e = s.error;
  const showErr = !!e && e.at !== hidden;
  const retry = () => { setHidden(0); void (async () => { const p = await probe(); if (!p.ok) bus.fail(p.kind || 'server', p.message || 'Lỗi kết nối.'); else { if (bus.get().error && !['conflict', 'storage'].includes(bus.get().error!.kind)) bus.clearError(); await flushPending(); } })(); };
  const tone = !e ? 'info' : e.kind === 'offline' ? 'warn' : e.kind === 'conflict' ? 'conflict' : 'error';
  const title = !e ? '' : e.kind === 'offline' ? 'Mất mạng / Wi-Fi' : e.kind === 'supabase' ? 'Lỗi đồng bộ Supabase' : e.kind === 'drive' ? 'Lỗi Google Drive' : e.kind === 'server' ? 'Không kết nối được máy chủ' : e.kind === 'auth' ? 'Hết phiên đăng nhập' : e.kind === 'conflict' ? 'Xung đột phiên bản' : e.kind === 'storage' ? 'Không lưu được' : e.kind === 'config' ? 'Chưa cấu hình lưu trữ' : 'Cần xử lý';
  const pendingLine = s.pending > 0 ? s.pending + ' thay đổi đang chờ đồng bộ — đã lưu an toàn trong trình duyệt (IndexedDB), sẽ tự đẩy lên khi kết nối được.' : '';

  if (showErr && e) {
    return (
      <div className={'sync-banner ' + tone} role="alert" aria-live="assertive">
        <div className="sync-banner-main">
          <strong>{title}</strong>
          <span>{e.message}</span>
          {pendingLine && <small>{pendingLine}</small>}
          {e.kind === 'offline' && <small>Dữ liệu đã nhập không bị mất; khi có mạng lại hệ thống tự đẩy lên và hiển thị đúng ở tài liệu đã chỉnh sửa.</small>}
        </div>
        <div className="sync-banner-actions">
          {e.kind === 'auth' && <a className="btn" href="/login">Đăng nhập lại</a>}
          {e.kind === 'conflict' && e.docId && <a className="btn" href={'/documents/' + encodeURIComponent(e.docId)}>Mở {docLabel(e.docId).slice(0, 24)}</a>}
          <button className="btn" type="button" onClick={retry}>Thử lại ngay</button>
          <a className="btn" href="/backup">Chi tiết</a>
          <button className="btn" type="button" aria-label="Ẩn thông báo" onClick={() => setHidden(e.at)}>×</button>
        </div>
      </div>
    );
  }
  if (s.pending > 0) {
    return (
      <div className="sync-banner info" role="status">
        <div className="sync-banner-main"><strong>{s.syncing ? 'Đang đồng bộ…' : 'Chờ đồng bộ'}</strong><span>{pendingLine}</span></div>
      </div>
    );
  }
  if (toast) {
    return <div className="sync-banner ok" role="status"><div className="sync-banner-main"><strong>Đã đồng bộ</strong><span>Các thay đổi lưu khi chưa có kết nối đã được đẩy lên máy chủ lúc {new Date(s.okAt || Date.now()).toLocaleTimeString('vi-VN')}.</span></div></div>;
  }
  return null;
}
