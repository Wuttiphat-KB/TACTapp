// C:\Users\Asus\Documents\TACT\tact-backend\src\services\acMeterState.ts
//
// AC energy meter (DTSU666-H) telemetry — sidecar channel เหมือน generator (ไม่ผ่าน OCPP)
// EdgeBox: CP.py อ่านมิเตอร์ผ่าน Modbus (slave 11 บนบัสเดียวกับ DC meter) แล้ว POST เข้ามา
//   → อ่านเฉพาะตอน generator ทำงาน (มิเตอร์กินไฟจาก gen) ดังนั้นช่วง gen ดับจะเงียบเป็นปกติ
//   → staleness ที่นี่จึงแปลว่า "ไม่มีข้อมูลสด" ไม่ได้แปลว่าระบบพัง
import { Server as SocketIOServer } from 'socket.io';
import Station from '../models/Station';
import ChargingSession from '../models/ChargingSession';

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

/**
 * อัปเดต session AC ที่กำลังทำงานจากค่ามิเตอร์
 * AC ไม่มี MeterValues ทาง OCPP → พลังงาน/เวลา/ค่าไฟต้องคิดจากมิเตอร์ตัวนี้แทน
 *   - ค่าแรกที่ได้หลังเริ่ม session = meterStart (baseline)
 *   - energyCharged = ค่าปัจจุบัน - baseline
 * emit 'meterUpdate' ห้อง session เดียวกับ DC เพื่อให้แอปอัปเดตเหมือนกัน
 */
async function updateAcSession(cpId: string, snap: AcMeterSnapshot): Promise<void> {
  if (snap.energyTotal == null) return;
  try {
    const session = await ChargingSession.findOne({
      cpId,
      chargerType: 'AC',
      status: 'Active',
      state: { $in: ['Preparing', 'Charging'] },
    });
    if (!session) return;

    // meterStart เก็บเป็น Wh (เหมือน DC) — ค่าแรกหลัง gen ติดคือ baseline
    if (session.meterStart == null) {
      session.meterStart = Math.round(snap.energyTotal * 1000);
    }
    const startKwh = (session.meterStart || 0) / 1000;
    const energyCharged = Math.max(0, snap.energyTotal - startKwh);
    const chargingTime = Math.max(0, Math.floor((Date.now() - session.startTime.getTime()) / 1000));

    session.state = 'Charging';
    session.powerKw = snap.powerKw ?? 0;
    session.energyCharged = energyCharged;
    session.chargingTime = chargingTime;
    session.totalPrice = energyCharged * session.pricePerKwh;
    session.carbonReduce = energyCharged * 0.5;
    await session.save();

    ioRef?.to(`session:${session._id.toString()}`).emit('meterUpdate', {
      sessionId: session._id.toString(),
      soc: null,                       // AC ไม่มี SoC (ไม่มีสาย CP)
      powerKw: session.powerKw,
      energyCharged,
      chargingTime,
      totalPrice: session.totalPrice,
      carbonReduce: session.carbonReduce,
      voltage: snap.voltage ?? undefined,
      currentA: snap.current ?? undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[ACMETER] session update error:', e);
  }
}

/** เรียกจาก route: update memory + persist + broadcast + อัปเดต session AC ที่วิ่งอยู่ */
export async function ingestAcMeter(cpId: string, snap: AcMeterSnapshot): Promise<void> {
  store.set(cpId, { snap, readAt: Date.now() });
  await persistAcMeter(cpId, snap);
  ioRef?.emit('acMeterUpdate', { cpId, acMeter: snap });
  await updateAcSession(cpId, snap);
}

/**
 * ส่ง chargingStopped ให้ session AC (ใช้ ioRef ที่นี่ เลี่ยง circular import จาก routes → index)
 */
export function emitAcChargingStopped(userId: string, sessionId: string, payload: any): void {
  ioRef?.to(`user:${userId}`).emit('chargingStopped', payload);
  ioRef?.to(`session:${sessionId}`).emit('chargingStopped', payload);
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
