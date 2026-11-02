import { NextRequest, NextResponse } from 'next/server';
import { listArchive } from '@/lib/archive';
import { driveErrorResponse } from '@/lib/driveApi';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try { const r = await listArchive(req.nextUrl.searchParams.get('pageToken') || undefined, 50); return NextResponse.json({ ok: true, ...r }); }
  catch (e) { return driveErrorResponse(e); }
}
