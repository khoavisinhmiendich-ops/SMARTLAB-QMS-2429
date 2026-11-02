import { NextRequest, NextResponse } from 'next/server';
import { driveAbout, driveConnection, ensureFolder, writeState } from '@/lib/drive';
import { driveErrorResponse } from '@/lib/driveApi';
import { supabaseConfig } from '@/lib/storage';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Trạng thái kết nối Google Drive (check=1: kiểm tra thật bằng cách gọi Google) và Supabase.
export async function GET(req: NextRequest) {
  const c = await driveConnection(); const sb = supabaseConfig();
  const base = { hasClient: c.hasClient, connected: c.connected, source: c.source, folderName: c.env.folderName, afterDays: c.env.afterDays, lastRun: c.state.lastRun || null, email: c.state.email || '', connectedAt: c.state.connectedAt || null, supabaseConfigured: sb.hasUrl && sb.hasKey, cronConfigured: !!process.env.CRON_SECRET };
  if (req.nextUrl.searchParams.get('check') !== '1' || !c.hasClient || !c.connected) return NextResponse.json({ ok: true, ...base });
  try {
    const me = await driveAbout(); await ensureFolder();
    if (me.email && me.email !== c.state.email) await writeState({ email: me.email });
    return NextResponse.json({ ok: true, ...base, email: me.email || base.email, live: true });
  } catch (e) {
    const r = driveErrorResponse(e); const j = await r.json();
    return NextResponse.json({ ok: true, ...base, live: false, driveError: j.error, driveErrorCode: j.code });
  }
}
