import { createClient } from '@supabase/supabase-js';
// This module is imported by server API routes only. Prefer the server-only service role
// key so autosave can write under RLS without exposing privileged credentials to browsers.

// Treat empty values and copy-pasted placeholders from .env.example ("your_...", "xxx", "changeme"...) as "not set".
const clean=(v?:string)=>{
 const s=(v??'').trim().replace(/^["']|["']$/g,'').trim();
 if(!s||/^(your[_-]|<|xxx|changeme|replace|todo)/i.test(s)||/your[_-]?(supabase|project|service|anon)/i.test(s)) return '';
 return s;
};
// Accept "https://abc.supabase.co", "abc.supabase.co", or a URL pasted with /rest/v1 or a trailing slash.
const normalizeUrl=(v?:string)=>{
 let s=clean(v); if(!s) return '';
 if(!/^https?:\/\//i.test(s)) s='https://'+s;
 try{const u=new URL(s);return u.origin;}catch{return '';}
};
export function supabaseConfig(){
 const url=normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)||normalizeUrl(process.env.SUPABASE_URL);
 const serviceKey=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
 const anonKey=clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)||clean(process.env.SUPABASE_ANON_KEY);
 const key=serviceKey||anonKey;
 return {url,key,usingServiceRole:!!serviceKey,hasUrl:!!url,hasKey:!!key};
}
export function supabase(){
 const {url,key}=supabaseConfig();
 if(!url||!key) return null;
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
// Turn raw Supabase/network errors into an actionable Vietnamese hint.
export function explainSupabaseError(err:{message?:string;code?:string;details?:string}|null|undefined):string{
 if(!err) return '';
 const msg=String(err.message||''),code=String(err.code||'');
 const {usingServiceRole}=supabaseConfig();
 if(/fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo|network|Failed to fetch/i.test(msg)) return 'Không kết nối được tới Supabase: kiểm tra NEXT_PUBLIC_SUPABASE_URL (dạng https://<project-ref>.supabase.co) và kết nối mạng của máy chủ.';
 if(/invalid api key|invalid jwt|JWT|apikey/i.test(msg)||code==='PGRST301') return 'Khóa Supabase không hợp lệ: kiểm tra SUPABASE_SERVICE_ROLE_KEY (hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY) đã dán đúng khóa của project, không còn giá trị mẫu.';
 if(code==='PGRST205'||code==='42P01'||/schema cache|does not exist|Could not find the table/i.test(msg)) return 'Chưa có bảng public.form_records: hãy chạy file supabase/schema.sql trong Supabase → SQL Editor.';
 if(code==='42501'||/row-level security|permission denied/i.test(msg)) return usingServiceRole?'Bị chặn bởi quyền/RLS: chạy lại supabase/schema.sql để cấp quyền cho bảng form_records.':'Đang dùng khóa anon nên bị RLS chặn: hãy đặt SUPABASE_SERVICE_ROLE_KEY (chỉ ở máy chủ/Vercel) rồi khởi động lại.';
 return msg||'Lỗi Supabase không xác định.';
}
