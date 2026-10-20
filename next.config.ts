import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'standalone',
  // Cho phép tải tệp tài liệu lớn hơn 10 MB qua nút "Thêm tệp" (mặc định Next.js cắt ở 10 MB khi đi qua middleware).
  experimental: { middlewareClientMaxBodySize: '60mb' },
  // Tệp tài liệu mới thêm sau khi build không nằm trong danh sách public: chuyển về trình phục vụ đọc từ ổ đĩa.
  async rewrites() {
    return { beforeFiles: [], afterFiles: [], fallback: [{ source: '/2429.2026/:path*', destination: '/api/files/get/:path*' }] };
  },
};
export default nextConfig;
