// C:\Users\Asus\Documents\TACT\tact-backend\src\services\acMeterState.ts
//
// AC energy meter (DTSU666-H) telemetry — sidecar channel เหมือน generator (ไม่ผ่าน OCPP)
// EdgeBox: CP.py อ่านมิเตอร์ผ่าน Modbus (slave 11 บนบัสเดียวกับ DC meter) แล้ว POST เข้ามา
//   → อ่านเฉพาะตอน generator ทำงาน (มิเตอร์กินไฟจาก gen) ดังนั้นช่วง gen ดับจะเงียบเป็นปกติ
//   → staleness ที่นี่จึงแปลว่า "ไม่มีข้อมูลสด" ไม่ได้แปลว่าระบบพัง
import { Server as SocketIOServer } from 'socket.io';
import Station from '../models/Station';

const STALE_MS = 35_000;            // CP.py ส่งทุก ~5s → เงียบเกินนี้ = ไม่สด
const WATCHDOG_INTERVAL_MS = 15_000;

export interface AcMeterSnapshot {
  powerKw: number | null;       // กำลังที่จ่ายอยู่ (kW)
  energyTotal: number | null;   // kWh สะสมของมิเตอร์ (ใช้คิดเงิน: ค่าท้าย - ค่าต้น)
  voltage: number | null;       // V
  current: number | null;       // A
  frequency: number | null;     // Hz
  updatedAt: string;            // ISO — server stamp เอง ไม่เชื่อ device clock
  stale: boolean;
}

interface Entry { snap: AcMeterSnapshot; readAt: number; }

const store = new Map<string, Entry>();
let ioRef: SocketIOServer | null = null;
let watchdog: NodeJS.Timeout | null = null;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** แปลง payload ดิบจาก CP.py → snapshot */
export function buildAcSnapshot(body: Record<string, unknown>): AcMeterSnapshot {
  return {
    powerKw: num(body.powerKw),
    energyTotal: num(body.energyTotal),
    voltage: num(body.voltage),
    current: num(body.current),
    frequency: num(body.freq ?? body.frequency),
    updatedAt: new Date().toISOString(),
    stale: false,
  };
}

/** ค่าล่าสุดของ cpId (คิด staleness สดตอนอ่าน) */
export function getAcMeter(cpId: string): AcMeterSnapshot | null {
  const e = store.get(cpId);
  if (!e) return null;
  const stale = Date.now() - e.readAt > STALE_MS;
  return { ...e.snap, stale };
}

/**
 * ผสมค่า AC meter ที่สดที่สุดเข้า station object ตอน serve REST
 * deployment นี้มีตู้เดียว → ถ้ามีค่าสดใน memory ใช้ตัวนั้น ไม่งั้น fallback ค่าที่ persist ไว้
 */
export function withAcMeterFreshness(stationObj: any): any {
  const liveKeys = [...store.keys()];
  const live = liveKeys.length === 1 ? getAcMeter(liveKeys[0]) : null;

  let ac: AcMeterSnapshot | null = null;
  if (live) {
    ac = live;
  } else if (stationObj.acMeter?.updatedAt) {
    const p = stationObj.acMeter;
    ac = {
      powerKw: p.powerKw ?? null,
      energyTotal: p.energyTotal ?? null,
      voltage: p.voltage ?? null,
      current: p.current ?? null,
      frequency: p.frequency ?? null,
      updatedAt: new Date(p.updatedAt).toISOString(),
      stale: Date.now() - new Date(p.updatedAt).getTime() > STALE_MS,
    };
  }

  stationObj.acMeter = ac;   // null = ยังไม่เคยได้รับค่าเลย
  return stationObj;
}

async function persistAcMeter(cpId: string, snap: AcMeterSnapshot): Promise<void> {
  const set: Record<string, unknown> = {
    'acMeter.powerKw': snap.powerKw,
    'acMeter.energyTotal': snap.energyTotal,
    'acMeter.voltage': snap.voltage,
    'acMeter.current': snap.current,
    'acMeter.frequency': snap.frequency,
    'acMeter.updatedAt': snap.updatedAt,
  };
  try {
    const r = await Station.updateOne({ cpId }, { $set: set });
    if (r.matchedCount === 0) {
      const count = await Station.countDocuments();
      if (count === 1) await Station.updateOne({}, { $set: set });
    }
  } catch (e) {
    console.error('[ACMETER] persist error:', e);
  }
}

/** เรียกจาก route: update memory + persist + broadcast */
export async function ingestAcMeter(cpId: string, snap: AcMeterSnapshot): Promise<void> {
  store.set(cpId, { snap, readAt: Date.now() });
  await persistAcMeter(cpId, snap);
  ioRef?.emit('acMeterUpdate', { cpId, acMeter: snap });
}

/** ตั้งค่า io + staleness watchdog (เรียกครั้งเดียวจาก index.ts) */
export function initAcMeterState(io: SocketIOServer): void {
  ioRef = io;
  if (watchdog) return;
  watchdog = setInterval(() => {
    const now = Date.now();
    for (const [cpId, e] of store.entries()) {
      if (now - e.readAt > STALE_MS && !e.snap.stale) {
        e.snap = { ...e.snap, stale: true };
        ioRef?.emit('acMeterUpdate', { cpId, acMeter: e.snap });
        // ไม่ persist ตรงนี้ — gen ดับแล้วเงียบเป็นเรื่องปกติ ไม่ใช่ error
      }
    }
  }, WATCHDOG_INTERVAL_MS);
}
