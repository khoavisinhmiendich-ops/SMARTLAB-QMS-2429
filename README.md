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


## Passkey cho thư mục "Các BM khác"
Bấm vào mục **Các BM khác** sẽ hiện hộp nhập passkey; đúng mới mở được. Passkey được kiểm tra ở máy chủ, tệp và trang chi tiết trong thư mục này bị chặn (403) cho tới khi nhập đúng, quyền mở hết hạn sau 8 giờ hoặc khi bấm **Khóa**. Đổi passkey bằng biến `QMS_BM_PASSKEY` trong `.env.local` / Vercel (không đặt thì dùng passkey mặc định đã băm trong `lib/gateServer.ts`). Muốn bảo vệ thư mục khác, thêm tên thư mục vào `GATED_NAMES` trong `lib/gate.ts`.

## Thêm tệp mới / sửa mã nguồn mà không mất dữ liệu
- Dữ liệu nhập gắn với đường dẫn tệp tài liệu, nên thêm tệp mới hoặc sửa mã nguồn không ảnh hưởng dữ liệu cũ. **Không đổi tên/di chuyển tệp đã có dữ liệu** (dữ liệu sẽ không còn khớp tệp).
- Mỗi lần lưu, hệ thống tự ghi **bản sao lưu phụ** ở 2 nơi độc lập: `../qms-backup-2429` (ngoài dự án, đổi bằng `QMS_BACKUP_DIR`) và `.data/backup`, kèm 30 phiên bản cũ gần nhất của từng tài liệu. Nếu `.data/records` bị mất/hỏng, dữ liệu tự khôi phục từ bản phụ.
- `npm run dev`, `npm run build`, `npm start` tự chạy bước đồng bộ/sao lưu trước khi khởi động (`scripts/qms-data.mjs auto`).
- Thêm tệp an toàn: `npm run add-file -- "D:\\duong-dan\\tep.docx" "Các BM khác"` (không ghi đè nếu trùng tên; thêm `--replace` để thay, tệp cũ được lưu vào `replaced-files`). Cũng có thể chép thẳng tệp vào `public/2429.2026/<thư mục>` bằng VS Code.
- Lệnh khác: `npm run data:status` (xem trạng thái), `npm run data:list` (liệt kê dữ liệu đã nhập), `npm run data:restore` (đồng bộ lại từ bản phụ).
- Khi dùng Supabase, mỗi lần lưu thành công cũng được sao lưu phụ ra tệp như trên.

## Cảnh báo bảo mật
- Đăng nhập và passkey: sai 5 lần trong 10 phút thì tạm khóa 5 phút; thông báo cho biết còn bao nhiêu lần thử.
- Mọi sự kiện đáng ngờ (đăng nhập/passkey sai, tạm khóa, mở khóa) được ghi vào `.data/security.log` và console máy chủ (`[QMS-SECURITY]`).
- Khi khởi động, hệ thống kiểm tra cấu hình và in cảnh báo: mật khẩu yếu, `QMS_AUTH_SECRET` ngắn, còn dùng passkey mặc định, biến bí mật bị đặt tiền tố `NEXT_PUBLIC_`, không có nơi sao lưu ghi được.
- Không đưa `.env.local` vào Git hoặc gửi cho người khác; nếu đã lộ khóa API/Supabase, hãy tạo khóa mới.


## Kết nối trợ lý AI (SMARTLAB AI)
- Mở tệp **`ai.config.ts`** trong VS Code để chọn nhà cung cấp, model và thứ tự thử: Gemini, OpenAI, Claude (Anthropic) hoặc model chạy tại máy (Ollama / LM Studio). Khóa API đặt trong `.env.local` (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).
- Hệ thống thử lần lượt từng kết nối; nếu một kết nối hết hạn mức (lỗi 429), sai khóa hoặc lỗi mạng thì tự chuyển sang kết nối kế tiếp. Lỗi 429 kèm thời gian chờ ngắn (≤ 8 giây) được chờ rồi thử lại.
- Kiểm tra nhanh: mở `/api/chat` (đã đăng nhập) để xem kết nối nào đang dùng được (không hiện khóa). Lỗi chi tiết từng kết nối in ở terminal (`SMARTLAB AI: kết nối lỗi …`).
- Khi gặp lỗi hết hạn mức Gemini: chờ hạn mức làm mới, bật thanh toán cho khóa, hoặc thêm kết nối dự phòng như trên.

## Nút "Thêm tệp" và "Thay tệp"
- Ở trang danh mục, nút **Thêm tệp**: chọn hoặc kéo thả tệp. Tệp **trùng tên** với tệp đã có (không phân biệt hoa/thường, bỏ qua hậu tố như " (1)") sẽ tự thay tệp cũ ở đúng vị trí; tệp mới được thêm vào thư mục đã chọn. Hộp thoại báo trước tệp nào sẽ thay, tệp nào là mới.
- Ở trang chi tiết tài liệu, nút **Thay tệp** thay đúng tài liệu đang xem bằng tệp cùng định dạng (tên tệp mới tùy ý).
- Tệp cũ được lưu vào bản sao lưu (`replaced-files`); nội dung đã sửa trên web của tệp cũ vẫn nằm trong dữ liệu/bản sao lưu nhưng không phủ lên tệp mới. Tệp mới hiển thị đầy đủ, dùng được toàn bộ công cụ Word/Excel, kể cả khi chạy bản build (`npm run build` + `npm start`).
- Giới hạn: .docx, .pdf, .xlsx, .jpg, .png; tối đa 50 MB mỗi tệp, 20 tệp mỗi lần. Máy chủ chỉ đọc (ví dụ Vercel) không ghi được tệp: dùng nút này khi chạy ứng dụng tại máy.

## Công cụ Word / Excel bổ sung
Thanh công cụ có thêm: gạch ngang, chọn màu chữ/màu nền tùy ý, tăng/giảm thụt lề, chèn liên kết, chèn ảnh, cỡ chữ/giãn dòng tùy chọn ("Khác…"), thêm phông chữ, thu phóng 40–300%, tạo bảng tối đa 200 hàng × 50 cột, **Tải bản đã sửa** (Excel → .xlsx mọi trang tính; Word → .doc mở được bằng Word), và Excel hiển thị nhanh số ô/tổng/trung bình/nhỏ nhất/lớn nhất khi bôi chọn nhiều ô.
