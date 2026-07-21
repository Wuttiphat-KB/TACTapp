// C:\Users\Asus\Documents\TACT\tact-backend\src\routes\telemetry.ts
//
// ช่องรับ telemetry จากอุปกรณ์ฝั่ง charger (ไม่ผ่าน OCPP)
// ตอนนี้ใช้กับ generator (DSE4620) ที่ EdgeBox อ่านผ่าน Modbus แล้ว POST เข้ามา
import { Router, Request, Response } from 'express';
import { buildSnapshot, ingestGenerator, getGenerator } from '../services/generatorState';

const router = Router();

// shared secret ระหว่าง EdgeBox ↔ backend. ถ้าไม่ตั้ง env → allow แต่ warn (dev เท่านั้น)
const DEVICE_KEY = process.env.DEVICE_API_KEY;
let warnedNoKey = false;

// @route   POST /api/telemetry/generator
// @desc    รับค่า live ของ generator จาก EdgeBox (gen_telemetry.py)
// @access  Device (shared secret ผ่าน header X-Device-Key)
router.post('/generator', async (req: Request, res: Response): Promise<void> => {
  if (DEVICE_KEY) {
    if (req.header('X-Device-Key') !== DEVICE_KEY) {
      res.status(401).json({ success: false, message: 'Invalid device key' });
      return;
    }
  } else if (!warnedNoKey) {
    console.warn('[GEN] ⚠️ DEVICE_API_KEY not set — /api/telemetry/generator is UNAUTHENTICATED. ตั้งค่าใน .env ก่อนขึ้น production');
    warnedNoKey = true;
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const cpId = String(body.cpId || process.env.CSMS_CP_ID || 'TACT30KW');
  const snap = buildSnapshot(body);
  await ingestGenerator(cpId, snap);
  res.json({ success: true, data: snap });
});

// @route   GET /api/telemetry/generator/:cpId
// @desc    ดูค่า generator ล่าสุด (debug)
// @access  Public
router.get('/generator/:cpId', (req: Request, res: Response): void => {
  res.json({ success: true, data: getGenerator(req.params.cpId) });
});

export default router;
