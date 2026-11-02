import { NextRequest, NextResponse } from 'next/server';
import { ensureFolder, uploadJson } from '@/lib/drive';
import { driveErrorResponse } from '@/lib/driveApi';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
// Sao lưu dữ liệu đang giữ trong IndexedDB của trình duyệt (kể cả thay đổi chưa đẩy được lên Supabase) lên Drive.
export async function POST(req: NextRequest) {
  const b: any = await req.json().catch(() => null);
  const recs = Array.isArray(b?.records) ? b.records : null;
  if (!recs) return NextResponse.json({ ok: false, error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 });
  try {
    const folder = await ensureFolder(); const ts = new Date().toISOString();
    const up = await uploadJson('trinh-duyet__' + ts.replace(/[:.]/g, '-') + '.json', { schema: 'smartlab-qms-browser-backup-v1', saved_at: ts, count: recs.length, records: recs }, { kind: 'browser' }, folder);
    return NextResponse.json({ ok: true, fileId: up.id, bytes: up.size, count: recs.length });
  } catch (e) { return driveErrorResponse(e); }
}
