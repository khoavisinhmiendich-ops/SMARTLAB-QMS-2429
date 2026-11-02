import { NextResponse } from 'next/server';
import { supabase, supabaseConfig, explainSupabaseError } from '@/lib/storage';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Kiểm tra nhanh: máy chủ ứng dụng sống, Supabase cấu hình và truy cập được (không đọc nội dung bản ghi).
export async function GET() {
  const t0 = Date.now();
  const db = supabase();
  if (!db) {
    const c = supabaseConfig();
    return NextResponse.json({ ok: true, store: 'file', supabase: { configured: false, hasUrl: c.hasUrl, hasKey: c.hasKey }, ms: Date.now() - t0 });
  }
  try {
    const r = await Promise.race([
      db.from('form_records').select('id').limit(1),
      new Promise<{ error: { message: string } }>((res) => setTimeout(() => res({ error: { message: 'Supabase không phản hồi sau 12 giây (fetch failed: timeout)' } }), 12000)),
    ]);
    if ((r as any).error) return NextResponse.json({ ok: false, store: 'supabase', supabase: { configured: true, ok: false }, error: explainSupabaseError((r as any).error), ms: Date.now() - t0 }, { status: 500 });
    return NextResponse.json({ ok: true, store: 'supabase', supabase: { configured: true, ok: true }, ms: Date.now() - t0 });
  } catch (e) {
    return NextResponse.json({ ok: false, store: 'supabase', supabase: { configured: true, ok: false }, error: explainSupabaseError({ message: e instanceof Error ? e.message : String(e) }), ms: Date.now() - t0 }, { status: 500 });
  }
}
