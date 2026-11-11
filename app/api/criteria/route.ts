import {NextResponse} from 'next/server';
import {getDocuments} from '@/lib/documents';
import {isGatedName} from '@/lib/gate';
import {readReplaced} from '@/lib/backup';
import {CRITERIA,evaluate} from '@/lib/criteria';
export const dynamic='force-dynamic';
// Chấm điểm 169 tiêu chí theo thư viện hồ sơ hiện có. Đọc lại thư mục mỗi lần gọi nên thêm/xóa/đổi tên tệp là kết quả tự cập nhật.
// Tài liệu trong thư mục được bảo vệ bằng passkey vẫn được tính vào kết quả nhưng không trả tên/đường dẫn.
export async function GET(){
 const docs=getDocuments(await readReplaced());
 const ev=evaluate(docs.map(d=>({id:d.id,title:d.title,path:d.path,chapter:d.chapter,hidden:isGatedName(d.chapter)})));
 return NextResponse.json({generatedAt:new Date().toISOString(),docCount:docs.length,criteria:CRITERIA.map(c=>({id:c.id,ch:c.ch,n:c.n,pts:c.pts,mark:c.mark,title:c.title,site:c.site,req:c.req.map(r=>r.label)})),...ev},{headers:{'Cache-Control':'no-store'}});
}
