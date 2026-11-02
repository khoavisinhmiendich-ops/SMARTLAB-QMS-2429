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


## Lưu tự động và đồng bộ nhiều thiết bị
- Mỗi lần lưu, bản ghi trên máy chủ (Supabase hoặc thư mục `.data/records`) tăng **số phiên bản**. Mỗi thiết bị nhớ số phiên bản nó đã nhận; khi lưu, máy chủ chỉ chấp nhận nếu số này còn khớp. Nếu thiết bị khác đã lưu trước, lần lưu bị chặn (409) thay vì ghi đè âm thầm, và người dùng được hỏi: dùng bản mới nhất từ máy chủ (bản của mình vẫn được giữ trong trình duyệt) hoặc giữ bản của mình và ghi đè (bản kia còn trong lịch sử sao lưu của máy chủ).
- Các thiết bị tự cập nhật nội dung mới của nhau: kiểm tra mỗi 10 giây khi đang mở trang, và ngay khi quay lại cửa sổ/thẻ hoặc có mạng lại. Chỉ tự cập nhật khi thiết bị đó không còn thay đổi chưa lưu.
- Việc chọn bản không phụ thuộc đồng hồ của từng máy (điện thoại lệch giờ vẫn đúng). Mất mạng: thay đổi được giữ trong trình duyệt và tự gửi lên khi có mạng lại.
- Bảng Supabase cần cột `version` (có sẵn trong `supabase/schema.sql`). Bảng cũ chưa có cột này vẫn lưu được nhưng không kiểm tra xung đột.
- Giới hạn: nội dung một tài liệu gửi lên tối đa khoảng 4 MB trên Vercel; vượt quá sẽ chỉ lưu trong trình duyệt và có thông báo.

## Bản cập nhật: hiển thị đúng tệp gốc và đồng bộ ổn định

- **Word:** sửa lỗi căn lề sai ở 102 tệp (`w:trPr/w:jc` bị hiểu thành căn chữ), ảnh không còn bị hỏng sau khi lưu/mở lại (ảnh tạm hợp lệ + tự khôi phục), hình vẽ DrawingML (sơ đồ, lưu đồ, khung chữ, đường nối, mũi tên) được vẽ lại bằng canvas trong bộ nhớ (`lib/docxShapes.ts`). Tệp gốc trên đĩa không bị thay đổi.
- **Excel:** giữ phông, đậm/nghiêng, màu nền, viền, căn lề, ô gộp và ảnh chèn (`lib/xlsxStyles.ts`, dùng thêm thư viện `jszip` → chạy `npm install`).
- **Đồng bộ:** mã tài liệu (`lib/docId.ts`) nay giống nhau ở mọi máy/hệ điều hành (không phụ thuộc `\` hay `/`, NFC/NFD, `#UXXXX`). Dữ liệu đã lưu theo mã cũ tự được chuyển sang mã chuẩn khi mở lại (cả file `.data` lẫn Supabase). Bản sao lưu/khôi phục giữ cả số phiên bản; máy khách "đi trước" máy chủ không còn bị báo xung đột sai.
- Máy chạy riêng lẻ không dùng chung Supabase hoặc thư mục `QMS_DATA_DIR` chung thì vẫn không thấy dữ liệu của nhau; tệp tài liệu mới chỉ có trên máy/máy chủ nơi tệp được thêm.

- **Ảnh:** ảnh gốc, ảnh do hình vẽ tạo ra và ảnh người dùng chèn được lưu/khôi phục riêng; ảnh hỏng (rỗng, blob chết, lỗi tải) tự được gắn lại ảnh gốc.
- **Bảng nổi (Word):** bảng rộng gần kín trang được đặt lại giữa/trái/phải đúng như Word, không còn tràn mép phải khổ A4.
- **Hình vẽ tự chèn (tab "Hình vẽ"):** bấm vào hình để hiện tay nắm: kéo chấm vuông đổi dài/ngắn/to/nhỏ (Shift giữ tỉ lệ), chấm tròn xoay tự do, nút ✥ di chuyển, phím mũi tên nhích từng bước; đường thẳng/mũi tên kéo từng đầu.
- **Excel khi chỉnh sửa:** Enter hoặc Tab (kể cả mã kết thúc của máy quét mã vạch) chuyển sang ô bên phải, hết hàng xuống ô đầu hàng kế, màn hình tự cuộn theo ô đang nhập; Shift+Enter/Shift+Tab sang trái; Alt+Enter xuống dòng trong ô.


## Bản cập nhật: hình vẽ & ảnh linh hoạt, vá bảo mật
- **Hình vẽ và ảnh trong Word:** bấm vào bất kỳ hình tự chèn, ảnh hoặc hình vẽ (sơ đồ, lưu đồ) lấy từ tệp Word để hiện tay nắm: kéo chấm vuông đổi dài/ngắn/to/nhỏ (ảnh tự giữ tỉ lệ ở 4 góc; hình thường giữ Shift), chấm tròn phía trên để xoay, ✥ để di chuyển, phím mũi tên để nhích. Hoạt động đúng ở mọi mức thu phóng và khi hình đã xoay.
- Sửa lỗi ảnh nhảy vị trí khi di chuyển (vị trí Word lưu theo pt, không phải px) và ảnh nằm cùng dòng chữ không dịch được.
- Bỏ nút ✥ cũ trong hình (di chuyển lệch khi thu phóng ≠ 100%), thay bằng tay nắm di chuyển chung.
- Bảo mật: `/api/records` bắt buộc có `document_id` (trước đây có thể đọc bản ghi gần nhất của thư mục đã khóa); thêm giới hạn thử sai **toàn cục** cho đăng nhập/passkey (chống né khóa bằng cách giả mạo `X-Forwarded-For`); chặn chuyển hướng mở sau đăng nhập (`/\\site-khac`).
- **Ảnh trong Word (vd. chữ ký) bị hỏng:** ảnh nay được nạp dạng `data:` (base64) thay vì địa chỉ tạm `blob:` nên không còn "chết" giữa chừng; ảnh vẫn được quét và gắn lại ảnh gốc 2 lần sau khi mở (sau 0,7 và 3,2 giây).
- **Gạch đỏ chính tả:** đã tắt hoàn toàn trong Word và Excel (thuộc tính spellcheck=false trên toàn bộ nội dung).
- **Bỏ gạch đỏ chính tả** trong Word và Excel (tắt kiểm tra chính tả của trình duyệt).
- **Sửa độc lập từng ô:** khi bật chỉnh sửa, bảng Word được cố định lưới cột; gõ/sửa chữ ở một ô không làm các cột, ô khác trong hàng co giãn theo (chữ dài tự xuống dòng trong chính ô đó). Kéo mép cột chỉ đổi đúng cột đó, kể cả khi có ô gộp.
- **Số trang chân trang (vd. "Trang: 4/4"):** tệp Word chỉ lưu sẵn một số cho mọi trang nên trình xem hiện "Trang: 2/4" ở trang cuối. Nay số trang và tổng số trang được tính lại theo từng trang hiển thị (chỉ áp dụng cho tệp có 1 phân đoạn và khi mọi chân trang đang hiện cùng một số; tệp nhiều phân đoạn giữ nguyên).
- **Tệp giấy ngang bị ép chữ / cắt mép phải** (vd. Sổ theo dõi lưu và hủy mẫu bệnh phẩm Vi sinh): bản đã lưu từ trước còn giữ dạng bảng nổi nên tiêu đề bị bẻ "THE/O/DÕI/LƯU" và bảng tràn mép phải; nay tự đổi về bảng thường căn giữa khi mở (cả bản đã lưu lẫn bản mới dựng).
- **Chia trang nhóm SOP/QT giống PDF:** tệp Word lưu sẵn vị trí ngắt trang của lần xuất cuối (trùng điểm ngắt của bản PDF) nhưng trình xem bỏ qua, nhất là trong bảng, nên các trang bị dồn dài và lệch so với PDF. Nay tài liệu thuộc nhóm SOP/QT (cùng quy tắc phân nhóm ở trang chủ) được chia trang đúng các điểm đó: đoạn văn được tách đoạn, bảng được tách hàng (hàng bị cắt giữa chừng thành hai phần như Word/PDF), mỗi trang mới có đầu/chân trang như trang cũ. Bản đã lưu từ trước cũng được chia lại theo ngữ cảnh chữ; không có điểm ngắt phù hợp thì giữ nguyên. Các nhóm BM và tài liệu khác không bị ảnh hưởng.
- **Số trang chân trang đếm đúng thứ tự (cập nhật):** áp dụng cho mọi tệp Word, kể cả tệp nhiều phân đoạn đặt lại số trang từ phần thân (vd. XN-QTQL 5.12.3 trước đây hiện 4/5 ở trang cuối). Nay số trang theo vị trí thật của trang: trang cuối là 5/5, các trang trước 4/5, 3/5…; trang bìa không có chân trang vẫn giữ nguyên. Phần "/tổng" giữ nguyên số trong tệp, chỉ nâng lên khi số trang hiển thị nhiều hơn.


## Đồng bộ ngoại tuyến (IndexedDB) và sao lưu Google Drive
### Mất mạng / lỗi Supabase
- Mọi chỉnh sửa được lưu ngay vào **IndexedDB** của trình duyệt (chịu được tài liệu nhiều ảnh, vượt giới hạn ~5 MB của localStorage cũ; dữ liệu cũ trong localStorage tự được chuyển sang).
- Khi mất mạng/Wi-Fi hoặc Supabase/máy chủ lỗi: hiện **thông báo ở góc dưới bên trái mọi trang**, nêu đúng nguyên nhân (mất mạng/Wi-Fi, không kết nối được máy chủ, lỗi Supabase kèm gợi ý sửa, lỗi Google Drive, hết phiên đăng nhập, xung đột phiên bản, quá dung lượng) và số thay đổi đang chờ.
- Khi kết nối lại, hệ thống **tự đẩy lên** ngay (kể cả tài liệu không còn mở và cả sau khi đóng/mở lại trình duyệt) và tài liệu đang sửa tự hiện "Đã đồng bộ…". Nếu thiết bị khác đã sửa trước, hệ thống không ghi đè âm thầm mà hỏi chọn bản (bản của bạn vẫn được giữ).
- Trang **/backup** (nút "☁ Sao lưu" ở đầu trang chủ) cho kiểm tra kết nối, đẩy dữ liệu chờ ngay, xem/tải/sao lưu dữ liệu trong IndexedDB.

### Sao lưu hai chiều với Google Drive
1. Tạo khóa: Google Cloud Console → tạo dự án → bật **Google Drive API** → OAuth consent screen (loại External, **đặt "In production"**; nếu để "Testing" mã kết nối hết hạn sau 7 ngày) → Credentials → OAuth client ID loại **Web application** với Authorized redirect URI `https://<tên-miền>/api/drive/callback` (và `http://localhost:3000/api/drive/callback`). Điền `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` vào `.env.local`, khởi động lại.
2. Mở **/backup** → "Kết nối Google Drive" → đồng ý. Ứng dụng chỉ có quyền `drive.file` (chỉ thấy tệp do chính nó tạo), lưu vào thư mục `SMARTLAB-QMS-2429-Backup`. Mã kết nối lưu ở `.data/drive.json` (hoặc đặt `GOOGLE_DRIVE_REFRESH_TOKEN` nếu không ghi được ổ đĩa).
3. **Supabase → Drive (giảm dung lượng):** bản ghi không được sửa quá `DRIVE_ARCHIVE_AFTER_DAYS` ngày (mặc định 60) được chép lên Drive, kiểm tra toàn vẹn MD5, rồi nội dung trong Supabase được thay bằng một "con trỏ" nhỏ (giữ nguyên số phiên bản và thời gian). Chạy **tự động**: máy chủ Node kiểm tra mỗi 6 giờ; trên Vercel dùng lịch trong `vercel.json` (đặt `CRON_SECRET`). Có nút chạy ngay và nút "sao lưu bản sao" (giữ nguyên Supabase).
4. **Drive → Supabase:** mở lại tài liệu đã lưu trữ thì nội dung **tự lấy về từ Drive** (nếu Drive lỗi sẽ báo lỗi rõ, không bao giờ coi là rỗng). Trang /backup còn cho nạp từng tệp hoặc nạp tất cả từ Drive vào Supabase (thêm mới, thay con trỏ bằng nội dung thật, bỏ qua bản cũ hơn; có tùy chọn ghi đè).
5. Chỉ áp dụng khi dùng Supabase; khi lưu bằng tệp trên máy chủ (không có Supabase) không có gì để chuyển lên Drive.
- **Tệp Word giấy ngang hiển thị đủ nội dung (vd. Nhật ký ra vào phòng xét nghiệm 31 ngày):** trình duyệt buộc mỗi cột phải rộng ít nhất bằng chữ + lề ô nên bảng nhiều cột hẹp bị nới rộng, cột tên bị ép hẹp và bảng tràn mép phải trang (mất cột ngày 25–31 và "Ghi chú"). Nay bảng được dựng lại đúng lưới cột, thụt lề và khổ trang của Word; bảng vẫn rộng hơn trang thì thu nhỏ đều cho lọt trang. Với bảng bố cục cố định trên trang ngang, cột lệch quá 15% so với Word cũng được chỉnh lại; các bảng đang hiển thị đúng không bị đổi. Cột rất hẹp (< 36 px) bỏ lề ô để số không bị xuống dòng từng ký tự.
