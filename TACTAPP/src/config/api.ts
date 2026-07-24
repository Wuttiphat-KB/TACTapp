//TACTAPP\src\config\api.ts
/**
 * API Configuration
 * เปลี่ยน LOCAL_IP เป็น IP เครื่องคุณ
 * 
 * หา IP ด้วย: ipconfig (Windows) → ดู IPv4 Address ของ WiFi
 */

const DEV_MODE = true;

// ⬇️ backend server จริง — รันอยู่ที่ 212.80.215.42:5000 (firewall :5000 เปิดแล้ว)
//    ใช้ได้ทั้ง Android emulator / Expo Go บนมือถือจริง / APK (เป็น public IP)
const LOCAL_IP = '212.80.215.42';

export const API_BASE_URL = DEV_MODE
  ? `http://${LOCAL_IP}:5000/api`
  : 'https://api.tactcharger.com/api'; // Production URL

export const API_TIMEOUT = 10000; // 10 seconds