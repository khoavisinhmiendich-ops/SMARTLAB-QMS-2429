import {NextRequest,NextResponse} from 'next/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type ChatMessage={role:'user'|'assistant';content:string};
export async function POST(req:NextRequest){
 try{
  const key=process.env.OPENAI_API_KEY;
  if(!key)return NextResponse.json({error:'Trợ lý AI chưa được cấu hình trên máy chủ. Hãy thêm OPENAI_API_KEY vào Environment Variables của Vercel và .env.local khi chạy tại máy.'},{status:503});
  const body=await req.json();
  const message=typeof body.message==='string'?body.message.trim():'';
  if(!message)return NextResponse.json({error:'Vui lòng nhập câu hỏi.'},{status:400});
  if(message.length>4000)return NextResponse.json({error:'Câu hỏi quá dài (tối đa 4.000 ký tự).'}, {status:413});
  const history:ChatMessage[]=Array.isArray(body.history)?body.history.filter((m:any)=>['user','assistant'].includes(m?.role)&&typeof m?.content==='string').slice(-8).map((m:any)=>({role:m.role,content:m.content.slice(0,4000)})):[];
  const input=history.length?history: [{role:'user' as const,content:message}];
  const model=process.env.OPENAI_MODEL||'gpt-5.5';
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,tools:[{type:'web_search'}],instructions:'Bạn là SMARTLAB AI, trợ lý tiếng Việt cho quản lý chất lượng phòng xét nghiệm y tế. Trả lời rõ ràng, có cấu trúc, phân biệt thông tin từ nguồn chính thức với nhận định. Khi câu hỏi cần thông tin mới, hãy sử dụng web_search và nêu nguồn liên quan. Ưu tiên Bộ Y tế Việt Nam, WHO, ISO, cơ quan quản lý và nhà xuất bản chính thức. Không tự bịa điều khoản, văn bản hay trích dẫn. Không thay thế quyết định của chuyên gia y tế. Nhắc người dùng không cung cấp dữ liệu định danh người bệnh.',input,store:false})});
  const data=await response.json();
  if(!response.ok){const status=response.status===429?429:502;return NextResponse.json({error:response.status===429?'Dịch vụ AI đang hết hạn mức hoặc giới hạn tốc độ. Kiểm tra hạn mức API.':'Dịch vụ AI trả về lỗi. Kiểm tra API key, quyền truy cập model và cấu hình thanh toán.'},{status});}
  const answer=typeof data.output_text==='string'?data.output_text:'';
  const sources:{title:string;url:string}[]=[];
  for(const item of data.output||[])for(const c of item.content||[])for(const a of c.annotations||[])if(a.type==='url_citation'&&a.url&&!sources.some(s=>s.url===a.url))sources.push({title:a.title||a.url,url:a.url});
  if(!answer)return NextResponse.json({error:'AI chưa trả về nội dung. Vui lòng thử lại.'},{status:502});
  return NextResponse.json({answer,sources:sources.slice(0,8)});
 }catch(error){console.error('SMARTLAB AI error',error);return NextResponse.json({error:'Không kết nối được dịch vụ AI. Kiểm tra kết nối mạng máy chủ và thử lại.'},{status:500});}
}
