import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'SMARTLAB QMS – Quản lý chất lượng 2429',
    short_name: 'QMS 2429',
    description: 'Quản lý chất lượng QĐ-2429/QĐ-BYT – Khoa Vi sinh - Miễn dịch.',
    lang: 'vi',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#eaf3ff',
    theme_color: '#0b3d91',
    icons: [
      { src: '/icon/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
