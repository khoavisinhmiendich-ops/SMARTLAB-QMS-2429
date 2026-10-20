import {NextRequest,NextResponse} from 'next/server'; import {getDocuments} from '@/lib/documents';
import {isGatedName} from '@/lib/gate'; import {hasGate} from '@/lib/gateServer'; import {readReplaced} from '@/lib/backup';
export const dynamic='force-dynamic';
// Chưa nhập passkey: tài liệu trong thư mục được bảo vệ chỉ trả số lượng, không lộ tên/đường dẫn.
export async function GET(req:NextRequest){
 const docs=getDocuments(await readReplaced()); if(hasGate(req))return NextResponse.json(docs);
 return NextResponse.json(docs.map((d,i)=>isGatedName(d.chapter)?{...d,id:'locked-'+i,title:'Tài liệu được bảo vệ',path:'',category:'',counterpart:undefined}:d));
}
