import fs from 'node:fs/promises';
import path from 'node:path';
import {backupDirs} from './backup';
import {usingDefaultPasskey} from './gateServer';
import {activeProviders,providerStatus} from './ai';
// Kiểm tra cấu hình bảo mật khi khởi động và in cảnh báo ra console máy chủ (không in giá trị bí mật).
const g=globalThis as unknown as {__qmsAudited?:boolean};
const WEAK=new Set(['123456','12345678','password','admin','admin123','qms2429','qms@2429','matkhau','123456789']);
export async function auditConfig(){
  if(g.__qmsAudited)return;g.__qmsAudited=true;
  const w=(m:string)=>console.warn('[QMS-SECURITY] CẢNH BÁO: '+m);
  const e=process.env;
  if(!e.QMS_LOGIN_USERNAME||!e.QMS_LOGIN_PASSWORD||!e.QMS_AUTH_SECRET)w('Chưa đặt đủ QMS_LOGIN_USERNAME / QMS_LOGIN_PASSWORD / QMS_AUTH_SECRET: không đăng nhập được.');
  else{
    if(e.QMS_AUTH_SECRET.length<32)w('QMS_AUTH_SECRET ngắn hơn 32 ký tự: hãy dùng chuỗi ngẫu nhiên dài hơn.');
    if(e.QMS_LOGIN_PASSWORD.length<10||WEAK.has(e.QMS_LOGIN_PASSWORD.toLowerCase())||e.QMS_LOGIN_PASSWORD===e.QMS_LOGIN_USERNAME)w('Mật khẩu đăng nhập yếu: nên dài từ 10 ký tự, có chữ hoa, chữ thường, số và ký hiệu.');
  }
  if(usingDefaultPasskey())w('Đang dùng passkey mặc định của thư mục “Các BM khác”: nên đặt QMS_BM_PASSKEY riêng trong .env.local / Vercel.');
  for(const k of Object.keys(e))if(/^NEXT_PUBLIC_.*(SECRET|SERVICE_ROLE|OPENAI|PASSWORD|PASSKEY)/i.test(k))w(`Biến ${k} có tiền tố NEXT_PUBLIC_ nên bị lộ ra trình duyệt. Hãy đổi tên bỏ tiền tố này.`);
  if(!activeProviders().length)w('Trợ lý AI chưa có kết nối nào dùng được: đặt GEMINI_API_KEY (hoặc OPENAI_API_KEY / ANTHROPIC_API_KEY) trong .env.local hoặc bật kết nối cục bộ trong ai.config.ts.');
  for(const p of providerStatus())if(p.inlineKey)w(`Kết nối AI “${p.name}” ghi API key trực tiếp trong ai.config.ts: nên chuyển sang .env.local để tránh lộ khi đưa mã lên Git.`);
  let okBackup=0;
  for(const d of backupDirs()){try{await fs.mkdir(d,{recursive:true});await fs.access(d,2);okBackup++;}catch{}}
  if(!okBackup)w('Không có thư mục sao lưu nào ghi được: dữ liệu sẽ không có bản phụ. Đặt QMS_BACKUP_DIR tới thư mục ghi được.');
  else if(okBackup<2)w('Chỉ có 1 nơi sao lưu ghi được; nên bảo đảm cả '+path.basename(backupDirs()[0])+' và .data/backup đều ghi được.');
}
