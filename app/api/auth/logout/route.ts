import { NextResponse } from 'next/server';
export async function POST(){const r=NextResponse.json({ok:true});r.cookies.set('qms_session','',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0});return r}
