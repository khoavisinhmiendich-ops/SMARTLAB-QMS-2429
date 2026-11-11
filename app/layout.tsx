import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import SyncCenter from '@/components/SyncCenter';
import PwaRegister from '@/components/PwaRegister';
export const viewport:Viewport={themeColor:'#0b3d91',width:'device-width',initialScale:1,viewportFit:'cover'};
export const metadata:Metadata={applicationName:'QMS 2429',appleWebApp:{capable:true,title:'QMS 2429',statusBarStyle:'default'},formatDetection:{telephone:false},icons:{icon:[{url:'/favicon.ico',sizes:'any'},{url:'/icon/icon-32.png',sizes:'32x32',type:'image/png'},{url:'/icon/icon-192.png',sizes:'192x192',type:'image/png'}],apple:[{url:'/icon/icon-180.png',sizes:'180x180',type:'image/png'}]},title:'SMARTLAB QMS | Quản lý chất lượng 2429',description:'Hệ thống quản lý chất lượng phòng xét nghiệm - Khoa Vi sinh, Miễn dịch, Bệnh viện Phong - Da liễu Trung ương Quy Hòa.'};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="vi"><body>{children}<SyncCenter/><PwaRegister/></body></html>}
