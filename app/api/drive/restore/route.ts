import { NextRequest, NextResponse } from 'next/server';
import { importFromDrive } from '@/lib/archive';
import { driveErrorResponse } from '@/lib/driveApi';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
// Nạp ngược từ Drive vào Supabase: fileIds (chọn tệp) hoặc all=true (lần lượt theo trang, trả nextPageToken).
export async function POST(req: NextRequest) {
  const b: any = await req.json().catch(() => ({}));
  try {
    const r = await importFromDrive({ fileIds: Array.isArray(b.fileIds) ? b.fileIds.filter((x: unknown) => typeof x === 'string').slice(0, 50) : undefined, all: !!b.all, pageToken: typeof b.pageToken === 'string' ? b.pageToken : undefined, overwrite: !!b.overwrite });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) { return driveErrorResponse(e); }
}
