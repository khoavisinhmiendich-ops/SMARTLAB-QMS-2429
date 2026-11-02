import { NextRequest, NextResponse } from 'next/server';
import { driveAbout, ensureFolder, exchangeCode, resetTokenCache, verifyState, writeState } from '@/lib/drive';
import { redirectUriOf } from '@/lib/driveApi';
import { auditLog } from '@/lib/security';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const page = (title: string, body: string) => new NextResponse('<!doctype html><meta charset="utf-8"><title>' + title + '</title><body style="font-family:system-ui;max-width:680px;margin:40px auto;padding:0 16px;line-height:1.5">' + body + '</body>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
// Google gọi lại sau khi người dùng đồng ý: đổi mã lấy refresh token và lưu.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams; const back = (m: string) => NextResponse.redirect(new URL('/backup?drive=' + m, req.url));
  if (q.get('error')) return back('denied');
  if (!verifyState(q.get('state') || '')) return back('badstate');
  const code = q.get('code'); if (!code) return back('nocode');
  try {
    const tok = await exchangeCode(code, redirectUriOf(req));
    if (!tok.refresh_token) return back('norefresh'); // đã cấp quyền trước đó: cần thu hồi rồi kết nối lại
    resetTokenCache();
    const saved = await writeState({ refreshToken: tok.refresh_token, connectedAt: new Date().toISOString(), folderId: undefined });
    if (!saved) return page('Lưu mã kết nối', '<h2>Kết nối thành công, nhưng máy chủ không ghi được tệp lưu</h2><p>Hãy đặt giá trị sau vào biến môi trường <b>GOOGLE_DRIVE_REFRESH_TOKEN</b> (chỉ ở máy chủ/Vercel) rồi khởi động lại. <b>Không chia sẻ mã này.</b></p><pre style="white-space:pre-wrap;word-break:break-all;background:#f3f6fa;padding:12px;border-radius:8px">' + tok.refresh_token.replace(/[<&]/g, '') + '</pre><p><a href="/backup">Về trang Sao lưu</a></p>');
    try { const me = await driveAbout(); await writeState({ email: me.email }); await ensureFolder(); } catch { /* sẽ hiện lỗi ở trang Sao lưu */ }
    await auditLog('data', 'drive_connected', {}).catch(() => {});
    return back('connected');
  } catch (e) { return back('error&msg=' + encodeURIComponent(e instanceof Error ? e.message : String(e))); }
}
