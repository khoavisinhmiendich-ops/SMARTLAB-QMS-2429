import { NextRequest, NextResponse } from 'next/server';
import { runArchive } from '@/lib/archive';
import { driveErrorResponse } from '@/lib/driveApi';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
// Sao lưu lên Drive: mode=due (bản ghi cũ hơn N ngày -> giải phóng Supabase) hoặc mode=copy (chép bản sao, giữ nguyên Supabase).
export async function POST(req: NextRequest) {
  const b: any = await req.json().catch(() => ({}));
  try {
    const run = await runArchive({ mode: b.mode === 'copy' ? 'copy' : 'due', limit: Number(b.limit) || 40, afterDays: b.afterDays ? Math.max(0, Number(b.afterDays)) : undefined });
    return NextResponse.json({ ok: true, run });
  } catch (e) { return driveErrorResponse(e); }
}
