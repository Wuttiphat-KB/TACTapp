//TACTAPP\src\config\api.ts
/**
 * API Configuration
 * เปลี่ยน LOCAL_IP เป็น IP เครื่องคุณ
 * 
 * หา IP ด้วย: ipconfig (Windows) → ดู IPv4 Address ของ WiFi
 */

const DEV_MODE = true;

// ⬇️ เปลี่ยนตรงนี้เป็น IP เครื่องคุณ
const LOCAL_IP = '212.80.215.42';  // ← เปลี่ยนเป็น IP นี้

export const API_BASE_URL = DEV_MODE
  ? `http://${LOCAL_IP}:5000/api`
  : 'https://api.tactcharger.com/api'; // Production URL

export const API_TIMEOUT = 10000; // 10 seconds