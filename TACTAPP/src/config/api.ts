//TACTAPP\src\config\api.ts
/**
 * API Configuration
 * เปลี่ยน LOCAL_IP เป็น IP เครื่องคุณ
 * 
 * หา IP ด้วย: ipconfig (Windows) → ดู IPv4 Address ของ WiFi
 */

const DEV_MODE = true;

// ⬇️ เปลี่ยนตรงนี้ตามที่จะรันแอป:
//   - Android emulator (AVD)      → '10.0.2.2'      (alias ของ localhost เครื่อง host)
//   - Expo Go บนมือถือจริง (WiFi)  → '192.168.70.63' (IPv4 WiFi ของเครื่องนี้ — จาก ipconfig)
//   - prod backend                → '212.80.215.42' (ตอนนี้ port 5000 ไม่ได้รัน)
const LOCAL_IP = '10.0.2.2';  // emulator → local backend (localhost:5000)

export const API_BASE_URL = DEV_MODE
  ? `http://${LOCAL_IP}:5000/api`
  : 'https://api.tactcharger.com/api'; // Production URL

export const API_TIMEOUT = 10000; // 10 seconds