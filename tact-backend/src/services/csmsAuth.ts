// C:\Users\Asus\Documents\TACT\tact-backend\src\services\csmsAuth.ts
//
// CSMS ใช้ cookie-session login (csms_web_ui_flexxfast.py):
//   POST /login (form username/password จาก env CSMS_USER/CSMS_PASS) → Set-Cookie: csms_session=<token>
//   ทุก /api/* และ /ws ต้องแนบ cookie นี้ ไม่งั้น 401 Unauthorized
//   session หมดอายุ 8 โมงเช้าครั้งถัดไป → ต้อง re-login
// module นี้: login, cache cookie, แนบให้ axios อัตโนมัติ, re-login เมื่อเจอ 401
import axios, { AxiosInstance, AxiosError } from 'axios';

const CSMS_URL = process.env.CSMS_HTTP_URL || 'http://127.0.0.1:8080';
const CSMS_USER = process.env.CSMS_USER || '';
const CSMS_PASS = process.env.CSMS_PASS || '';

let sessionCookie: string | null = null;     // "csms_session=<token>"
let loginInFlight: Promise<string> | null = null;

async function performLogin(): Promise<string> {
  if (!CSMS_USER || !CSMS_PASS) {
    throw new Error('CSMS_USER/CSMS_PASS ไม่ได้ตั้งใน .env — auth เข้า CSMS ไม่ได้');
  }
  const body = new URLSearchParams({ username: CSMS_USER, password: CSMS_PASS }).toString();
  // ใช้ axios ดิบ (ไม่ผ่าน interceptor) เพื่อเลี่ยง recursion
  const resp = await axios.post(`${CSMS_URL}/login`, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    maxRedirects: 0,  // ไม่ตาม 302 เพื่ออ่าน Set-Cookie
    timeout: 10000,
    validateStatus: (s) => s === 302 || s === 200 || s === 401 || s === 429,
  });
  if (resp.status === 429) throw new Error('CSMS login โดนล็อก (login ผิดหลายครั้ง) — รอ ~15 นาที');
  if (resp.status === 401) throw new Error('CSMS login ถูกปฏิเสธ — ตรวจ CSMS_USER/CSMS_PASS ใน .env');

  const setCookie: string[] = resp.headers['set-cookie'] || [];
  let token: string | null = null;
  for (const c of setCookie) {
    const m = /csms_session=([^;]+)/.exec(c);
    if (m) { token = m[1]; break; }
  }
  if (!token) throw new Error('CSMS login: ไม่พบ csms_session cookie ใน response');

  sessionCookie = `csms_session=${token}`;
  console.log('✅ [CSMS] login สำเร็จ — ได้ session cookie');
  return sessionCookie;
}

/** ได้ cookie ปัจจุบัน (login ถ้ายังไม่มี). forceRelogin = ทิ้งตัวเก่าแล้ว login ใหม่ */
export async function getCsmsCookie(forceRelogin = false): Promise<string> {
  if (forceRelogin) sessionCookie = null;
  if (sessionCookie) return sessionCookie;
  // กัน login พร้อมกันหลายเส้น (HTTP + WS) → แชร์ promise เดียว
  if (!loginInFlight) {
    loginInFlight = performLogin().finally(() => { loginInFlight = null; });
  }
  return loginInFlight;
}

export function clearCsmsCookie(): void {
  sessionCookie = null;
}

// axios instance ที่แนบ cookie อัตโนมัติ + re-login เมื่อ 401 (ให้ ocppBridge ใช้)
export const csmsAxios: AxiosInstance = axios.create({ timeout: 15000 });

csmsAxios.interceptors.request.use(async (config) => {
  const cookie = await getCsmsCookie();
  (config.headers as any)['Cookie'] = cookie;
  return config;
});

csmsAxios.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const cfg = error.config as any;
    // 401 = cookie หมดอายุ (8 โมงเช้า) → re-login แล้วลองซ้ำครั้งเดียว
    if (error.response?.status === 401 && cfg && !cfg.__reauth) {
      cfg.__reauth = true;
      const cookie = await getCsmsCookie(true);
      cfg.headers['Cookie'] = cookie;
      return csmsAxios(cfg);
    }
    return Promise.reject(error);
  }
);
