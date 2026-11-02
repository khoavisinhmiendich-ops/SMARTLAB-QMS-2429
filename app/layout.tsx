import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import SyncCenter from '@/components/SyncCenter';
export const metadata:Metadata={title:'SMARTLAB QMS | Quản lý chất lượng 2429',description:'Hệ thống quản lý chất lượng phòng xét nghiệm - Khoa Vi sinh, Miễn dịch, Bệnh viện Phong - Da liễu Trung ương Quy Hòa.'};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="vi"><body>{children}<SyncCenter/></body></html>}
