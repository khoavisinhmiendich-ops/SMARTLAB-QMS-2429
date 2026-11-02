import { runArchive } from './archive';
import { driveConnection } from './drive';
import { supabaseConfig } from './storage';
// Khi chạy bằng máy chủ Node liên tục (npm start / Docker): mỗi 6 giờ kiểm tra và tự chuyển các bản ghi cũ hơn N ngày lên Google Drive.
// Trên Vercel (serverless) dùng vercel.json (cron) thay thế. Tắt bằng DRIVE_AUTO_ARCHIVE=0.
const G = globalThis as unknown as { __qmsArchiveTimer?: ReturnType<typeof setInterval> };
async function tick() {
  try {
    const sb = supabaseConfig(); const c = await driveConnection();
    if (!(sb.hasUrl && sb.hasKey) || !c.hasClient || !c.connected) return;
    await runArchive({ mode: 'due', limit: 60, maxMs: 45000 });
  } catch (e) { console.warn('[archive] lần chạy tự động lỗi:', e instanceof Error ? e.message : e); }
}
export function startArchiveScheduler() {
  if (process.env.DRIVE_AUTO_ARCHIVE === '0' || G.__qmsArchiveTimer || process.env.VERCEL) return;
  const first = setTimeout(() => { void tick(); }, 2 * 60 * 1000);
  const iv = setInterval(() => { void tick(); }, 6 * 60 * 60 * 1000);
  (first as any).unref?.(); (iv as any).unref?.();
  G.__qmsArchiveTimer = iv;
}
