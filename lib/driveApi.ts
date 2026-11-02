import { NextRequest, NextResponse } from 'next/server';
import { DriveError, driveEnv } from './drive';
// Tiện ích dùng chung cho các API /api/drive/*.
export function driveErrorResponse(e: unknown) {
  if (e instanceof DriveError) {
    const status = ['not_configured', 'not_connected', 'no_supabase'].includes(e.code) ? 400 : e.code === 'busy' ? 409 : e.code === 'invalid_grant' ? 401 : 502;
    return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status });
  }
  return NextResponse.json({ ok: false, code: 'unknown', error: e instanceof Error ? e.message : String(e) }, { status: 500 });
}
// Địa chỉ gốc của ứng dụng (đúng cả khi chạy sau proxy/Vercel).
export function originOf(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '') || 'http';
  return proto + '://' + host;
}
export const redirectUriOf = (req: NextRequest) => driveEnv().redirectUri || originOf(req) + '/api/drive/callback';
