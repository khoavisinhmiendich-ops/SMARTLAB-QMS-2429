import { createClient } from '@supabase/supabase-js';
// This module is imported by server API routes only. Prefer the server-only service role
// key so autosave can write under RLS without exposing privileged credentials to browsers.
export function supabase(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key) return null;
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
