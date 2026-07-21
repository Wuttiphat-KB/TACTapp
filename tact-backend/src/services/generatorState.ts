// C:\Users\Asus\Documents\TACT\tact-backend\src\services\generatorState.ts
//
// Generator telemetry state (sidecar channel — NOT OCPP).
// รับค่าจาก EdgeBox (gen_telemetry.py) ผ่าน POST /api/telemetry/generator
// เก็บค่าล่าสุดใน memory + stamp เวลาฝั่ง server เอง (ไม่เชื่อ device clock)
// + staleness watchdog: ถ้าไม่ได้รับค่าเกิน STALE_MS → บังคับ status = 'Unknown'
//   เพื่อไม่ให้ App ค้างค่าเก่าตอน EdgeBox/poller ตาย
import { Server as SocketIOServer } from 'socket.io';
import Station from '../models/Station';

// poller ส่งทุก ~5s → ถือว่า stale ถ้าเงียบเกิน 35s (พลาดได้ ~6 รอบ)
const STALE_MS = 35_000;
const WATCHDOG_INTERVAL_MS = 15_000;

export type GeneratorStatus = 'Running' | 'Stopped' | 'Unknown';

export interface GeneratorSnapshot {
  status: GeneratorStatus;
  fuelLevel: number | null;      // %
  frequency: number | null;      // Hz
  rpm: number | null;
  batteryVoltage: number | null; // V
  coolantTemp: number | null;    // °C
  voltageL1N: number | null;     // V (gen L1-N เป็นตัวแทนแรงดัน gen)
  updatedAt: string;             // ISO — server-stamped
  stale: boolean;
}

interface Entry {
  snap: GeneratorSnapshot;
  readAt: number; // Date.now() ตอนรับค่า (ใช้คิด staleness)
}

const store = new Map<string, Entry>();

let ioRef: SocketIOServer | null = null;
let watchdog: NodeJS.Timeout | null = null;

/** running ถ้า gen ผลิตไฟจริง (freq ใกล้ nominal). ใช้ freq เป็นหลัก, rpm เป็น fallback */
export function deriveStatus(freq: number | null, rpm: number | null): GeneratorStatus {
  if (freq != null) return freq >= 45 ? 'Running' : 'Stopped';
  if (rpm != null) return rpm >= 400 ? 'Running' : 'Stopped';
  return 'Unknown';
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** แปลง payload ดิบจาก gen_telemetry.py → snapshot (server stamp เวลาเอง) */
export function buildSnapshot(body: Record<string, unknown>): GeneratorSnapshot {
  const frequency = num(body.freq_hz ?? body.frequency);
  const rpm = num(body.rpm);
  return {
    status: deriveStatus(frequency, rpm),
    fuelLevel: num(body.fuel_pct ?? body.fuelLevel),
    frequency,
    rpm,
    batteryVoltage: num(body.battery_v ?? body.batteryVoltage),
    coolantTemp: num(body.coolant_c ?? body.coolantTemp),
    voltageL1N: num(body.l1n_v ?? body.voltageL1N),
    updatedAt: new Date().toISOString(),
    stale: false,
  };
}

/** ค่าล่าสุดของ cpId (คิด staleness สดตอนอ่าน) */
export function getGenerator(cpId: string): GeneratorSnapshot | null {
  const e = store.get(cpId);
  if (!e) return null;
  const stale = Date.now() - e.readAt > STALE_MS;
  return { ...e.snap, stale, status: stale ? 'Unknown' : e.snap.status };
}

/**
 * ผสมค่า generator ที่สดที่สุดเข้าไปใน station object ตอน serve REST
 * deployment นี้มี generator ตัวเดียว → ถ้ามีค่าสดใน memory ใช้ตัวนั้น
 * ไม่งั้น fallback ไปค่าที่ persist ไว้ (เผื่อ backend เพิ่ง restart) พร้อมคิด staleness จาก updatedAt
 * NOTE: ถ้าในอนาคตมีหลาย station/หลาย gen ต้องเพิ่ม cpId บน Station แล้ว match ตรง ๆ
 */
export function withGeneratorFreshness(stationObj: any): any {
  const liveKeys = [...store.keys()];
  const live = liveKeys.length === 1 ? getGenerator(liveKeys[0]) : null;

  let gen: GeneratorSnapshot | null = null;
  if (live) {
    gen = live;
  } else if (stationObj.generator?.updatedAt) {
    const p = stationObj.generator;
    const stale = Date.now() - new Date(p.updatedAt).getTime() > STALE_MS;
    gen = {
      status: stale ? 'Unknown' : (p.status ?? 'Unknown'),
      fuelLevel: p.fuelLevel ?? null,
      frequency: p.frequency ?? null,
      rpm: p.rpm ?? null,
      batteryVoltage: p.batteryVoltage ?? null,
      coolantTemp: p.coolantTemp ?? null,
      voltageL1N: p.voltageL1N ?? null,
      updatedAt: new Date(p.updatedAt).toISOString(),
      stale,
    };
  }

  stationObj.generator = gen; // null ถ้าไม่เคยมีค่าเลย → App แสดง "ไม่ทราบสถานะ"
  return stationObj;
}

async function persistGenerator(cpId: string, snap: GeneratorSnapshot): Promise<void> {
  const set: Record<string, unknown> = {
    'generator.status': snap.status,
    'generator.fuelLevel': snap.fuelLevel,
    'generator.frequency': snap.frequency,
    'generator.rpm': snap.rpm,
    'generator.batteryVoltage': snap.batteryVoltage,
    'generator.coolantTemp': snap.coolantTemp,
    'generator.voltageL1N': snap.voltageL1N,
    'generator.updatedAt': snap.updatedAt,
  };
  try {
    const r = await Station.updateOne({ cpId }, { $set: set });
    // seed เดิมไม่มี cpId → fallback ไปที่ station เดียวที่มี (deployment นี้มี station เดียว)
    if (r.matchedCount === 0) {
      const count = await Station.countDocuments();
      if (count === 1) await Station.updateOne({}, { $set: set });
    }
  } catch (e) {
    console.error('[GEN] persist error:', e);
  }
}

/** เรียกจาก route: update memory + persist + broadcast */
export async function ingestGenerator(cpId: string, snap: GeneratorSnapshot): Promise<void> {
  store.set(cpId, { snap, readAt: Date.now() });
  await persistGenerator(cpId, snap);
  ioRef?.emit('generatorUpdate', { cpId, generator: snap });
}

/** ตั้งค่า io + เริ่ม staleness watchdog (เรียกครั้งเดียวจาก index.ts) */
export function initGeneratorState(io: SocketIOServer): void {
  ioRef = io;
  if (watchdog) return;
  watchdog = setInterval(() => {
    const now = Date.now();
    for (const [cpId, e] of store.entries()) {
      if (now - e.readAt > STALE_MS && e.snap.status !== 'Unknown') {
        const stale: GeneratorSnapshot = { ...e.snap, status: 'Unknown', stale: true };
        e.snap = stale; // freeze เป็น Unknown เพื่อไม่ emit ซ้ำทุกรอบ
        ioRef?.emit('generatorUpdate', { cpId, generator: stale });
        persistGenerator(cpId, stale).catch(() => {});
        console.warn(`[GEN] ${cpId} telemetry stale (>${STALE_MS / 1000}s) → Unknown`);
      }
    }
  }, WATCHDOG_INTERVAL_MS);
}
