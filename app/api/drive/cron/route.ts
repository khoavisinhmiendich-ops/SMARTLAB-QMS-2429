import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { runArchive } from '@/lib/archive';
import { driveErrorResponse } from '@/lib/driveApi';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
// Lịch tự động (Vercel Cron hoặc dịch vụ lập lịch bên ngoài): gửi kèm "Authorization: Bearer <CRON_SECRET>".
// middleware cho phép đúng đường dẫn này khi mật khẩu bí mật khớp; API tự kiểm tra lại lần nữa.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || ''; const got = req.headers.get('authorization') || '';
  const ok = secret.length >= 16 && got.length === ('Bearer ' + secret).length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from('Bearer ' + secret));
  if (!ok) return NextResponse.json({ ok: false, error: 'Không có quyền.' }, { status: 401 });
  try { return NextResponse.json({ ok: true, run: await runArchive({ mode: 'due', limit: 60, maxMs: 45000 }) }); }
  catch (e) { return driveErrorResponse(e); }
}
