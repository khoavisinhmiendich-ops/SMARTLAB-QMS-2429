# SMARTLAB QMS 2429 — ứng dụng Next.js

Ứng dụng đọc danh mục hồ sơ trực tiếp từ `public/2429.2026`, có tìm kiếm/lọc, mở và tải tệp gốc, trang chi tiết tài liệu, đồng hồ thời gian thực múi giờ Việt Nam và trợ lý AI tra cứu Internet qua máy chủ.

## Chạy tại máy
1. Cài Node.js LTS.
2. Mở thư mục `app2429` trong VS Code.
3. Chạy `npm install`, sau đó `npm run dev`.
4. Mở `http://localhost:3000`.

## Bật trợ lý AI Internet
Tạo file `.env.local` từ `.env.example`, sau đó điền `OPENAI_API_KEY` ở phía máy chủ. Có thể đặt `OPENAI_MODEL` nếu muốn dùng model khác được tài khoản API hỗ trợ. API key không được đưa vào mã trình duyệt hoặc biến `NEXT_PUBLIC_*`. Trợ lý sử dụng OpenAI Responses API với công cụ `web_search`; việc sử dụng API có thể phát sinh chi phí và phụ thuộc hạn mức tài khoản.

## Lưu dữ liệu nghiệp vụ lâu dài
Để lưu dữ liệu giữa các máy/trình duyệt và sau khi triển khai, cấu hình Supabase theo `.env.example`, đặt `SUPABASE_SERVICE_ROLE_KEY` ở máy chủ/Vercel Environment Variables (không đưa khóa này vào client hoặc Git), và chạy `supabase/schema.sql` trong Supabase SQL Editor. Nếu chưa cấu hình Supabase, nội dung được tự lưu vào thư mục `.data/records` trên máy chủ (đổi vị trí bằng biến `QMS_DATA_DIR`) đồng thời vào localStorage của trình duyệt; bản mới hơn luôn được ưu tiên khi mở lại, nên chạy lại `npm run dev` hoặc Ctrl+F5 vẫn giữ nguyên dữ liệu đã nhập, và thay/thêm tệp tài liệu khác không ảnh hưởng dữ liệu của các tài liệu còn lại (dữ liệu gắn với đường dẫn tệp). Nếu máy chủ chỉ đọc (ví dụ Vercel không có Supabase) hệ thống tự quay về lưu trên trình duyệt và báo rõ trạng thái. Với Excel, nội dung chỉnh sửa được lưu riêng cho từng trang tính. Khi đã cấu hình, thay đổi được tự lưu sau khoảng 1 giây và đồng bộ qua máy chủ.

## Build / triển khai
`npm run build` rồi `npm start`. Trên Vercel, import repository và đặt các biến môi trường ở Project Settings → Environment Variables. Không commit `.env.local` hoặc API key vào Git.


## Khóa/đăng nhập hệ thống
Tạo `.env.local` từ `.env.example` và đặt `QMS_LOGIN_USERNAME`, `QMS_LOGIN_PASSWORD`, `QMS_AUTH_SECRET` (chuỗi bí mật ngẫu nhiên dài ít nhất 32 ký tự). Nếu dùng Vercel, đặt cả ba biến trong Project Settings → Environment Variables rồi triển khai lại. Không dùng mật khẩu mẫu cho hệ thống thật và không commit `.env.local`. Khi đăng nhập thành công, phiên được lưu bằng cookie HttpOnly, hết hạn sau 8 giờ; nút **Khóa** ở thanh đầu trang sẽ kết thúc phiên hiện tại.
