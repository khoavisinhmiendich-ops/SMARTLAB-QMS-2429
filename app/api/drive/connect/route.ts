import { NextRequest, NextResponse } from 'next/server';
import { authUrl, driveEnv, signState } from '@/lib/drive';
import { redirectUriOf } from '@/lib/driveApi';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Bắt đầu kết nối Google Drive (chuyển sang trang đồng ý của Google).
export async function GET(req: NextRequest) {
  const env = driveEnv();
  if (!env.clientId || !env.clientSecret) return NextResponse.redirect(new URL('/backup?drive=noclient', req.url));
  return NextResponse.redirect(authUrl(redirectUriOf(req), signState()));
}
