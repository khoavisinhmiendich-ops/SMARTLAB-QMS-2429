/* Service worker tối giản cho QMS 2429: giúp trình duyệt cho phép "Cài đặt ứng dụng".
   KHÔNG lưu đệm (cache) bất kỳ dữ liệu nào - hồ sơ chất lượng luôn được lấy mới từ máy chủ sau khi đăng nhập. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mất kết nối</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#eaf3ff;color:#0b3d91;text-align:center"><div><h2>Không có kết nối mạng</h2><p>Vui lòng kiểm tra Internet rồi mở lại ứng dụng.</p><button onclick="location.reload()" style="padding:10px 18px;border:0;border-radius:10px;background:#0b3d91;color:#fff;font-size:15px">Thử lại</button></div>';
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
