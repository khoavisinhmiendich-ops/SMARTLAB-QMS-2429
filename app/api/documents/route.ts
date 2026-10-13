import {NextResponse} from 'next/server'; import {getDocuments} from '@/lib/documents';
export const dynamic='force-dynamic';
export async function GET(){return NextResponse.json(getDocuments());}
