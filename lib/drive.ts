import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
// Truy cập Google Drive từ máy chủ bằng OAuth (quyền drive.file: chỉ thấy tệp do chính ứng dụng tạo) — không cần thư viện ngoài.
// Cần: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (tạo ở Google Cloud Console) rồi bấm "Kết nối Google Drive" ở trang /backup.
// Refresh token được lưu trong .data/drive.json (hoặc đặt GOOGLE_DRIVE_REFRESH_TOKEN nếu máy chủ không ghi được đĩa).
export class DriveError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
const clean = (v?: string) => { const s = (v ?? '').trim().replace(/^["']|["']$/g, '').trim(); return !s || /^(your[_-]|<|xxx|changeme|replace|todo)/i.test(s) ? '' : s; };
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
export function driveEnv() {
  return {
    clientId: clean(process.env.GOOGLE_CLIENT_ID),
    clientSecret: clean(process.env.GOOGLE_CLIENT_SECRET),
    envRefresh: clean(process.env.GOOGLE_DRIVE_REFRESH_TOKEN),
    folderName: clean(process.env.GOOGLE_DRIVE_FOLDER_NAME) || 'SMARTLAB-QMS-2429-Backup',
    redirectUri: clean(process.env.GOOGLE_REDIRECT_URI),
    afterDays: clamp(Number(process.env.DRIVE_ARCHIVE_AFTER_DAYS) || 60, 30, 180), // mặc định 60 ngày (2 tháng), tối đa 180
  };
}

// ---- trạng thái lưu trên đĩa (refresh token, thư mục, lần chạy gần nhất) ----
export type DriveState = { refreshToken?: string; folderId?: string; email?: string; connectedAt?: string; lastRun?: unknown };
const stateDir = () => (process.env.QMS_STATE_DIR ? path.resolve(process.env.QMS_STATE_DIR) : path.join(process.cwd(), '.data'));
const stateFile = () => path.join(stateDir(), 'drive.json');
export async function readState(): Promise<DriveState> {
  try { return JSON.parse(await fs.readFile(stateFile(), 'utf8')) as DriveState; } catch { return {}; }
}
export async function writeState(patch: Partial<DriveState>): Promise<boolean> {
  try {
    const next = { ...(await readState()), ...patch };
    await fs.mkdir(stateDir(), { recursive: true });
    const tmp = stateFile() + '.' + process.pid + '.' + Date.now() + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(tmp, stateFile());
    return true;
  } catch { return false; }
}
export async function driveConnection() {
  const env = driveEnv(); const st = await readState();
  const refresh = env.envRefresh || st.refreshToken || '';
  return { hasClient: !!(env.clientId && env.clientSecret), connected: !!refresh, source: env.envRefresh ? 'env' : st.refreshToken ? 'file' : null, state: st, env };
}

// ---- gọi mạng có giới hạn thời gian ----
async function timedFetch(url: string, init: RequestInit, ms: number): Promise<Response> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); }
  catch { throw new DriveError('network', 'Không kết nối được tới Google (kiểm tra mạng/tường lửa của máy chủ, hoặc Google đang chậm).'); }
  finally { clearTimeout(t); }
}

// ---- OAuth ----
let cache: { token: string; exp: number } | null = null;
export function resetTokenCache() { cache = null; }
async function accessToken(force = false): Promise<string> {
  const env = driveEnv();
  if (!env.clientId || !env.clientSecret) throw new DriveError('not_configured', 'Chưa cấu hình GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET trong .env.local (xem hướng dẫn trong README).');
  const st = await readState(); const rt = env.envRefresh || st.refreshToken;
  if (!rt) throw new DriveError('not_connected', 'Chưa kết nối Google Drive: mở trang Sao lưu và bấm "Kết nối Google Drive".');
  if (!force && cache && cache.exp > Date.now() + 60000) return cache.token;
  const r = await timedFetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.clientId, client_secret: env.clientSecret, refresh_token: rt, grant_type: 'refresh_token' }) }, 20000);
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (j.error === 'invalid_grant') throw new DriveError('invalid_grant', 'Quyền truy cập Google Drive đã hết hạn hoặc bị thu hồi (thường do ứng dụng Google Cloud còn ở chế độ "Testing": token hết hạn sau 7 ngày). Hãy chuyển ứng dụng sang "In production" rồi kết nối lại.');
    throw new DriveError('token', 'Không lấy được quyền truy cập Google: ' + (j.error_description || j.error || 'HTTP ' + r.status));
  }
  cache = { token: String(j.access_token), exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return cache.token;
}
export function authUrl(redirectUri: string, state: string): string {
  const env = driveEnv();
  const p = new URLSearchParams({ client_id: env.clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent', state });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}
export async function exchangeCode(code: string, redirectUri: string): Promise<{ refresh_token?: string }> {
  const env = driveEnv();
  const r = await timedFetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.clientId, client_secret: env.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) }, 20000);
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new DriveError('token', 'Google từ chối mã xác thực: ' + (j.error_description || j.error || 'HTTP ' + r.status) + '. Kiểm tra "Authorized redirect URI" khớp chính xác với địa chỉ ứng dụng.');
  cache = j.access_token ? { token: String(j.access_token), exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 } : null;
  return j;
}
// Chuỗi "state" ký bằng QMS_AUTH_SECRET để chống giả mạo yêu cầu (CSRF) khi Google gọi lại.
export function signState(): string {
  const secret = process.env.QMS_AUTH_SECRET || 'dev'; const ts = Date.now().toString(), nonce = crypto.randomBytes(8).toString('hex');
  return ts + '.' + nonce + '.' + crypto.createHmac('sha256', secret).update(ts + '.' + nonce).digest('base64url');
}
export function verifyState(s: string): boolean {
  const secret = process.env.QMS_AUTH_SECRET || 'dev'; const [ts, nonce, sig] = String(s || '').split('.');
  if (!ts || !nonce || !sig || Date.now() - Number(ts) > 15 * 60000) return false;
  const exp = crypto.createHmac('sha256', secret).update(ts + '.' + nonce).digest('base64url');
  return exp.length === sig.length && crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(sig));
}

// ---- Drive API ----
const API = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
async function dfetch(url: string, init: RequestInit = {}, ms = 30000): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(attempt > 0);
    const r = await timedFetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: 'Bearer ' + token } }, ms);
    if (r.status === 401 && attempt === 0) continue;
    if (r.ok) return r;
    const j: any = await r.clone().json().catch(() => ({}));
    const reason = String(j?.error?.errors?.[0]?.reason || ''); const msg = String(j?.error?.message || 'HTTP ' + r.status);
    if (r.status === 404) throw new DriveError('notfound', 'Không tìm thấy trên Google Drive: ' + msg);
    if (reason === 'storageQuotaExceeded' || /quota/i.test(reason)) throw new DriveError('quota', 'Google Drive đã đầy dung lượng: hãy giải phóng chỗ trống hoặc nâng gói lưu trữ.');
    if (r.status === 403 && /accessNotConfigured|has not been used|disabled/i.test(msg + reason)) throw new DriveError('api_disabled', 'Chưa bật Google Drive API trong dự án Google Cloud: vào APIs & Services → Library → bật "Google Drive API".');
    throw new DriveError('api', 'Google Drive báo lỗi (' + r.status + '): ' + msg);
  }
  throw new DriveError('api', 'Google Drive từ chối truy cập.');
}
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export async function driveAbout(): Promise<{ email: string; name: string }> {
  const r = await dfetch(API + '/about?fields=user(emailAddress,displayName)');
  const j: any = await r.json();
  return { email: String(j?.user?.emailAddress || ''), name: String(j?.user?.displayName || '') };
}
export async function ensureFolder(): Promise<string> {
  const env = driveEnv(); const st = await readState();
  if (st.folderId) {
    try { const j: any = await (await dfetch(API + '/files/' + encodeURIComponent(st.folderId) + '?fields=id,trashed')).json(); if (!j.trashed) return st.folderId; }
    catch (e) { if (!(e instanceof DriveError && e.code === 'notfound')) throw e; }
  }
  const q = "mimeType='application/vnd.google-apps.folder' and name='" + esc(env.folderName) + "' and trashed=false";
  const found: any = await (await dfetch(API + '/files?q=' + encodeURIComponent(q) + '&fields=files(id)&pageSize=1')).json();
  let id = found?.files?.[0]?.id as string | undefined;
  if (!id) {
    const c: any = await (await dfetch(API + '/files?fields=id', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: env.folderName, mimeType: 'application/vnd.google-apps.folder' }) })).json();
    id = c.id;
  }
  if (!id) throw new DriveError('api', 'Không tạo được thư mục sao lưu trên Google Drive.');
  await writeState({ folderId: id });
  return id;
}
export type DriveFile = { id: string; name: string; size: number; modifiedTime: string; appProperties: Record<string, string> };
export async function listFiles(folderId: string, extraQ = '', pageToken?: string, pageSize = 100): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const q = "'" + esc(folderId) + "' in parents and trashed=false" + (extraQ ? ' and ' + extraQ : '');
  const url = API + '/files?q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent('nextPageToken,files(id,name,size,modifiedTime,appProperties)') + '&pageSize=' + pageSize + '&orderBy=' + encodeURIComponent('modifiedTime desc') + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
  const j: any = await (await dfetch(url)).json();
  return { files: (j.files || []).map((f: any) => ({ id: f.id, name: f.name, size: Number(f.size) || 0, modifiedTime: f.modifiedTime, appProperties: f.appProperties || {} })), nextPageToken: j.nextPageToken };
}
export async function uploadJson(name: string, obj: unknown, props: Record<string, string>, folderId: string): Promise<{ id: string; md5: string; size: number; localMd5: string }> {
  const content = JSON.stringify(obj); const bytes = Buffer.from(content, 'utf8');
  const b = 'qms' + crypto.randomBytes(8).toString('hex');
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: 'application/json', appProperties: props });
  const body = Buffer.concat([Buffer.from('--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n', 'utf8'), bytes, Buffer.from('\r\n--' + b + '--', 'utf8')]);
  const r = await dfetch(UPLOAD + '/files?uploadType=multipart&fields=id,md5Checksum,size', { method: 'POST', headers: { 'content-type': 'multipart/related; boundary=' + b }, body }, 180000);
  const j: any = await r.json();
  return { id: String(j.id), md5: String(j.md5Checksum || ''), size: Number(j.size) || bytes.length, localMd5: crypto.createHash('md5').update(bytes).digest('hex') };
}
// Tải nguyên tệp (Word/Excel/PDF) lên Drive, giữ đúng định dạng gốc, KHÔNG chuyển đổi: Drive mở ra giống hệt tệp gốc.
export async function uploadFile(name: string, bytes: Buffer, mime: string, props: Record<string, string>, folderId: string): Promise<{ id: string }> {
  const b = 'qms' + crypto.randomBytes(8).toString('hex');
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: mime, appProperties: props });
  const body = Buffer.concat([Buffer.from('--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + b + '\r\nContent-Type: ' + mime + '\r\n\r\n', 'utf8'), bytes, Buffer.from('\r\n--' + b + '--', 'utf8')]);
  const r = await dfetch(UPLOAD + '/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'content-type': 'multipart/related; boundary=' + b }, body }, 180000);
  const j: any = await r.json();
  return { id: String(j.id) };
}
// Bản XEM ĐƯỢC: chuyển HTML của tài liệu thành Google Docs (mở trên Drive thấy bảng biểu, định dạng như tài liệu thật, không phải chuỗi JSON).
export async function uploadHtmlAsDoc(name: string, html: string, props: Record<string, string>, folderId: string): Promise<{ id: string }> {
  const bytes = Buffer.from(html, 'utf8'); const b = 'qms' + crypto.randomBytes(8).toString('hex');
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: 'application/vnd.google-apps.document', appProperties: props });
  const body = Buffer.concat([Buffer.from('--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + b + '\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n', 'utf8'), bytes, Buffer.from('\r\n--' + b + '--', 'utf8')]);
  const r = await dfetch(UPLOAD + '/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'content-type': 'multipart/related; boundary=' + b }, body }, 180000);
  const j: any = await r.json();
  return { id: String(j.id) };
}
export async function downloadText(fileId: string): Promise<string> {
  const r = await dfetch(API + '/files/' + encodeURIComponent(fileId) + '?alt=media', {}, 120000);
  return await r.text();
}
