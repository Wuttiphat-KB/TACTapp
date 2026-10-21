// C:\Users\Asus\Documents\TACT\tact-backend\src\services\csmsListener.ts
import WebSocket from 'ws';
import { Server as SocketIOServer } from 'socket.io';
import ChargingSession from '../models/ChargingSession';
import Station from '../models/Station';
import { triggerAllConnectorStatus, remoteStop, dataTransfer } from './ocppBridge';
import { getCsmsCookie, clearCsmsCookie } from './csmsAuth';

const CSMS_WS = process.env.CSMS_WS_URL || 'ws://127.0.0.1:8080/ws';

// Mapping: idTag → userId (เก็บตอน start charging)
export const idTagToUser = new Map<string, string>();

// Mapping: transactionId → sessionId (เก็บตอนได้ StartTransaction)
export const txnToSession = new Map<number, string>();

// Mapping: sessionId → startTime (สำหรับคำนวณ chargingTime)
const sessionStartTime = new Map<string, Date>();

// Mapping: sessionId → เวลาที่ได้ MeterValues ล่าสุด (ใช้พิสูจน์ว่า "ยังชาร์จอยู่จริง")
const lastMeterAt = new Map<string, number>();

// Mapping: sessionId → timer ที่รอ finalize (กัน schedule ซ้ำ)
const pendingFinalize = new Map<string, NodeJS.Timeout>();

// ถือว่ายังชาร์จอยู่ถ้าได้ MeterValues ภายในกี่ ms (CP ส่งทุก ~4-6s)
const METER_ACTIVE_MS = 30_000;
// หน่วงก่อน finalize ผ่าน fallback เพื่อรอดูว่า MeterValues หยุดจริงมั้ย
const FINALIZE_GRACE_MS = 30_000;

// session DC ที่ค้าง Preparing (ตู้ไม่ส่ง StartTransaction) นานเกินนี้ → ยกเลิกให้อัตโนมัติ
// ปกติ: Start_Gen 15 วิ + remote_start + รถ handshake ≈ 30–60 วิ
const PREPARING_TIMEOUT_MS = 4 * 60_000;
const PREPARING_WATCHDOG_MS = 30_000;
// ตู้ส่ง StartTransaction มาหลัง session ถูกยกเลิกไปแล้วภายในเวลานี้ → สั่งหยุดทันที (กันชาร์จไม่มีเจ้าของ)
const LATE_START_WINDOW_MS = 30 * 60_000;
// error code ของ session ที่ไม่เคยเริ่มชาร์จจริง (ผู้ใช้ยกเลิก / ตู้ไม่ตอบ)
export const ABORTED_START_CODES = ['CANCELLED', 'START_TIMEOUT'];

let ioRef: SocketIOServer | null = null;

/**
 * หา sessionId จาก transactionId — ใช้ map ใน RAM ก่อน ถ้าไม่มี (backend restart) หาใน DB แล้ว cache
 * (เดิม restart ระหว่างชาร์จ = MeterValues/StopTransaction จับคู่ไม่ได้ → แอปค้างหน้า "กรุณาถอดสาย")
 */
async function sessionIdForTxn(txnId: number): Promise<string | undefined> {
  const cached = txnToSession.get(txnId);
  if (cached) return cached;
  if (txnId === undefined || txnId === null) return undefined;

  const session = await ChargingSession.findOne({ transactionId: txnId, status: 'Active' });
  if (!session) return undefined;

  const sessionId = session._id.toString();
  txnToSession.set(txnId, sessionId);
  if (!sessionStartTime.has(sessionId)) sessionStartTime.set(sessionId, session.startTime);
  console.log(`[CSMS] txnId ${txnId} → session ${sessionId} (recovered from DB)`);
  return sessionId;
}

/**
 * ดับ generator ถ้าไม่มี session อื่นที่ยังใช้ไฟอยู่ (ทั้ง DC และ AC ใช้เครื่องเดียวกัน)
 * ใช้ DataTransfer StopGen ตัวเดียวกับปุ่มหยุด AC (CP.py กันไว้อีกชั้นถ้าหัว DC ยังมี transaction)
 */
async function stopGenIfIdle(cpId: string, exceptSessionId: string): Promise<void> {
  const other = await ChargingSession.findOne({
    cpId,
    status: 'Active',
    state: { $in: ['Preparing', 'Charging'] },
    _id: { $ne: exceptSessionId },
  });
  if (other) {
    console.log(`[CSMS] StopGen skipped — session ${other._id} still uses the generator`);
    return;
  }
  const r = await dataTransfer('StopGen');
  console.log(`[CSMS] StopGen after aborted start: ${r.success ? 'sent' : `failed (${r.error || r.status})`}`);
}

/**
 * ยกเลิก session DC ที่ยังไม่เริ่มชาร์จจริง (ผู้ใช้กดยกเลิก / ตู้ไม่ตอบภายในเวลา)
 * - ปิด session + แจ้งแอป (chargingStopped reason Cancelled/StartTimeout → แอปกลับหน้า Charger ไม่ใช่หน้าสรุป)
 * - ดับ generator ที่ CP.py สั่งติดไปแล้ว (CP.py ไม่มีทางดับเองถ้ารถไม่เคยเริ่มชาร์จ)
 */
export async function abortPreparingSession(session: any, reason: 'Cancelled' | 'StartTimeout'): Promise<void> {
  session.state = 'Stopped';
  session.status = 'Inactive';
  session.endTime = new Date();
  session.errorCode = reason === 'Cancelled' ? 'CANCELLED' : 'START_TIMEOUT';
  await session.save();
  idTagToUser.delete(String(session.idTag).toUpperCase());

  const sessionId = session._id.toString();
  console.log(`[CSMS] Session ${sessionId} aborted before charging started (${reason})`);
  ioRef?.to(sessionRooms(session)).emit('chargingStopped', {
    sessionId,
    energyCharged: 0,
    chargingTime: 0,
    totalPrice: 0,
    carbonReduce: 0,
    reason,
  });

  try {
    await stopGenIfIdle(session.cpId, sessionId);
  } catch (e) {
    console.error('[CSMS] stopGenIfIdle error:', e);
  }
}

/**
 * ห้องที่ต้องส่ง event ของ session ไป: ห้องของ session + ห้องของเจ้าของ session
 * - ห้อง user: แอป join อัตโนมัติตอนต่อ socket → ยังได้ event แม้ join ห้อง session ไม่ทัน/หลุดแล้ว server ลืมห้อง
 * - userId เอาจาก session ใน DB (ไม่ใช้ idTagToUser ใน RAM ที่หายเมื่อ backend restart)
 * ส่ง io.to([...]) ครั้งเดียว → socket ที่อยู่ทั้ง 2 ห้องได้ event ครั้งเดียว ไม่ซ้ำ
 */
function sessionRooms(session: { _id: unknown; userId: unknown }): string[] {
  return [`session:${String(session._id)}`, `user:${String(session.userId)}`];
}

/**
 * Parse ค่าจาก MeterValues string เช่น "45 Percent" → 45
 */
function parseVal(str: string | undefined): number {
  if (!str) return 0;
  const match = str.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

/**
 * คำนวณ chargingTime (วินาที)
 */
function calcChargingTime(sessionId: string): number {
  const start = sessionStartTime.get(sessionId);
  if (!start) return 0;
  return Math.floor((Date.now() - start.getTime()) / 1000);
}

/**
 * ตรวจซ้ำหลังพ้น grace period ว่าควรปิด session มั้ย
 * ปิดเฉพาะเมื่อ "MeterValues หยุดไหลจริง" — ถ้ายังไหลอยู่แปลว่ายังชาร์จ ปล่อยไว้
 */
async function recheckFinalize(sessionId: string, io: SocketIOServer): Promise<void> {
  const session = await ChargingSession.findById(sessionId);
  if (!session || session.status !== 'Active') return;   // ถูกปิดไปแล้วทางอื่น (StopTransaction)

  const meterAge = Date.now() - (lastMeterAt.get(sessionId) ?? 0);
  if (meterAge < METER_ACTIVE_MS) {
    console.log(`[CSMS] recheck: session ${sessionId} ยังชาร์จอยู่ (MeterValues ${Math.round(meterAge / 1000)}s ที่แล้ว) — ไม่ปิด`);
    return;
  }

  console.log(`[CSMS] recheck: session ${sessionId} เงียบเกิน ${METER_ACTIVE_MS / 1000}s — ปิด session`);
  const chargingTime = calcChargingTime(sessionId) ||
    Math.floor((Date.now() - session.startTime.getTime()) / 1000);
  session.state = 'Stopped';
  session.status = 'Inactive';
  session.chargingTime = chargingTime;
  session.totalPrice = session.energyCharged * session.pricePerKwh;
  session.carbonReduce = session.energyCharged * 0.5;
  session.endTime = new Date();
  await session.save();

  const stopData = {
    sessionId,
    energyCharged: session.energyCharged,
    chargingTime,
    totalPrice: session.totalPrice,
    carbonReduce: session.carbonReduce,
    reason: 'ConnectorAvailable',
  };
  io.to(sessionRooms(session)).emit('chargingStopped', stopData);

  if (session.transactionId) txnToSession.delete(session.transactionId);
  sessionStartTime.delete(sessionId);
  lastMeterAt.delete(sessionId);
}

/**
 * เริ่มฟัง CSMS WebSocket และ emit events ไป App ผ่าน Socket.IO
 */
export function initCSMSListener(io: SocketIOServer): void {
  let ws: WebSocket;
  let reconnectAttempts = 0;
  ioRef = io;

  // ===== Watchdog: session DC ที่ค้าง Preparing นานเกิน → ยกเลิกให้ (ครอบกรณีแอปถูกปิดไปแล้วด้วย) =====
  setInterval(async () => {
    try {
      const stuck = await ChargingSession.find({
        state: 'Preparing',
        status: 'Active',
        chargerType: { $ne: 'AC' },
        startTime: { $lt: new Date(Date.now() - PREPARING_TIMEOUT_MS) },
      });
      for (const session of stuck) {
        await abortPreparingSession(session, 'StartTimeout');
      }
    } catch (e) {
      console.error('[CSMS] Preparing watchdog error:', e);
    }
  }, PREPARING_WATCHDOG_MS);

  // เดิม: เลิกต่อใหม่ถาวรหลัง 10 ครั้ง → CSMS ล่มไม่กี่นาที = backend ไม่รับ event อีกเลย
  // ทุก session ค้าง "กำลังเริ่มชาร์จ" จนกว่าจะ restart backend → ตอนนี้ลองใหม่ไปเรื่อย ๆ (ห่างสุด 30 วิ)
  function scheduleReconnect() {
    reconnectAttempts++;
    const delay = Math.min(5000 * reconnectAttempts, 30000);
    console.log(`[CSMS] Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts})`);
    setTimeout(connect, delay);
  }

  async function connect() {
    // CSMS ต้อง login ก่อน (cookie-session) → แนบ cookie ใน WS handshake
    let cookie: string;
    try {
      cookie = await getCsmsCookie();
    } catch (e: any) {
      console.error(`[CSMS] login ล้มเหลว: ${e.message}`);
      // creds ผิด/โดนล็อก/ยังไม่ตั้ง → หยุด retry (กันโดน CSMS ล็อก IP)
      if (/ปฏิเสธ|โดนล็อก|ไม่ได้ตั้ง/.test(e.message)) {
        console.error('[CSMS] หยุด retry — แก้ CSMS_USER/CSMS_PASS ใน .env แล้ว restart');
        return;
      }
      scheduleReconnect();
      return;
    }

    console.log(`[CSMS] Connecting to ${CSMS_WS}...`);

    ws = new WebSocket(CSMS_WS, { headers: { Cookie: cookie } });

    ws.on('open', () => {
      console.log('✅ [CSMS] WebSocket connected');
      reconnectAttempts = 0;
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        
        // ข้าม message ที่ไม่ใช่ log
        if (msg.type !== 'log') {
          // Handle init message (ได้ list charge points)
          if (msg.type === 'init') {
            console.log('[CSMS] Init received, charge points:', msg.charge_points?.length || 0);
            
            // ขอ StatusNotification จากทุก connector เพื่อให้รู้สถานะปัจจุบัน
            setTimeout(async () => {
              try {
                await triggerAllConnectorStatus();
              } catch (err) {
                console.error('[CSMS] Failed to trigger status:', err);
              }
            }, 2000);  // รอ 2 วินาทีให้ connection stable
          }
          return;
        }

        const { action, cp_id, data, direction } = msg.data;
        
        // Log ทุก action สำหรับ debug
        console.log(`[CSMS] ${direction} ${action}:`, JSON.stringify(data).slice(0, 200));

        switch (action) {
          // ========== StartTransaction ==========
          case 'StartTransaction': {
            const { txnId, idTag, connector, meterStart } = data;
            const upperIdTag = idTag?.toUpperCase();

            if (!upperIdTag) {
              console.log('[CSMS] StartTransaction: missing idTag');
              break;
            }

            // หา session ที่รอ transaction จาก DB โดยตรง
            // (เดิมต้องมี idTag ใน idTagToUser ที่อยู่ใน RAM ก่อน → backend restart ระหว่างรอ
            //  = session ค้าง Preparing ตลอดไป แอปเปิดใหม่ก็ติดหน้า "กำลังเริ่มชาร์จ")
            const session = await ChargingSession.findOne({
              idTag: upperIdTag,
              state: 'Preparing',
              status: 'Active',
            });

            if (!session) {
              // ตู้เพิ่งเริ่มชาร์จหลังจาก session ถูกยกเลิกไปแล้ว (ผู้ใช้กดยกเลิก / timeout)
              // → ไม่มีใครเห็นหรือหยุดได้จากแอป และ generator วิ่งต่อ → สั่งหยุดทันที
              const aborted = await ChargingSession.findOne({
                idTag: upperIdTag,
                errorCode: { $in: ABORTED_START_CODES },
                endTime: { $gt: new Date(Date.now() - LATE_START_WINDOW_MS) },
              });
              if (aborted && txnId != null) {
                console.log(`[CSMS] StartTransaction txn ${txnId} arrived after session ${aborted._id} was ${aborted.errorCode} → RemoteStop`);
                const r = await remoteStop(txnId);
                console.log(`[CSMS] RemoteStop for late start: ${r.success ? r.result?.status : r.error}`);
              } else {
                console.log(`[CSMS] StartTransaction: No preparing session for ${idTag}`);
              }
              break;
            }

            // อัพเดท session
            session.transactionId = txnId;
            session.state = 'Charging';
            session.meterStart = meterStart; // Wh
            await session.save();

            // เก็บ mapping
            txnToSession.set(txnId, session._id.toString());
            sessionStartTime.set(session._id.toString(), new Date());

            console.log(`[CSMS] Session ${session._id} started, txnId=${txnId}`);

            // Emit ไป App
            io.to(sessionRooms(session)).emit('chargingStarted', {
              sessionId: session._id.toString(),
              transactionId: txnId,
              state: 'Charging',
              connectorId: connector,
            });
            break;
          }

          // ========== MeterValues ==========
          case 'MeterValues': {
            const { txnId, values, connector } = data;
            const sessionId = await sessionIdForTxn(txnId);
            if (sessionId) lastMeterAt.set(sessionId, Date.now());

            if (!sessionId) {
              // ลอง match จาก connector ถ้าไม่มี txnId
              break;
            }

            const session = await ChargingSession.findById(sessionId);
            if (!session) break;

            // Parse meter values
            const soc = parseVal(values?.['SoC']);
            const powerKw = parseVal(values?.['Power.Active.Import']);
            const energyKwh = parseVal(values?.['Energy.Active.Import.Register']);
            const voltage = parseVal(values?.['Voltage']);
            const currentA = parseVal(values?.['Current.Import']);

            // คำนวณ energy charged (จาก meterStart)
            const meterStartKwh = (session.meterStart || 0) / 1000;
            const energyCharged = Math.max(0, energyKwh - meterStartKwh);

            // คำนวณ charging time
            const chargingTime = calcChargingTime(sessionId);

            // คำนวณ total price
            const totalPrice = energyCharged * session.pricePerKwh;

            // คำนวณ carbon reduce (สมมติ 0.5 kg CO2 per kWh)
            const carbonReduce = energyCharged * 0.5;

            // อัพเดท MongoDB
            session.soc = soc;
            session.powerKw = powerKw;
            session.energyCharged = energyCharged;
            session.chargingTime = chargingTime;
            session.totalPrice = totalPrice;
            session.carbonReduce = carbonReduce;
            await session.save();

            // Emit ไป App (ห้อง session + ห้อง user — กลับเข้าแอปใหม่/เน็ตหลุดแล้วต่อใหม่ ค่ายังมาถึง)
            io.to(sessionRooms(session)).emit('meterUpdate', {
              sessionId,
              soc,
              powerKw,
              energyCharged,
              chargingTime,
              totalPrice,
              carbonReduce,
              voltage,
              currentA,
              timestamp: new Date().toISOString(),
            });
            break;
          }

          // ========== StopTransaction ==========
          case 'StopTransaction': {
            const { txnId, meterStop, energy, reason } = data;
            const sessionId = await sessionIdForTxn(txnId);
            
            if (!sessionId) {
              console.log(`[CSMS] StopTransaction: Unknown txnId ${txnId}`);
              break;
            }

            const session = await ChargingSession.findById(sessionId);
            if (!session) break;

            // คำนวณ final values
            const energyWh = parseInt(energy) || 0;
            const energyCharged = energyWh / 1000;
            const chargingTime = calcChargingTime(sessionId);
            const totalPrice = energyCharged * session.pricePerKwh;
            const carbonReduce = energyCharged * 0.5;

            // อัพเดท session
            session.state = 'Stopped';
            session.status = 'Inactive';
            session.meterStop = meterStop;
            session.energyCharged = energyCharged;
            session.chargingTime = chargingTime;
            session.totalPrice = totalPrice;
            session.carbonReduce = carbonReduce;
            session.endTime = new Date();
            await session.save();

            console.log(`[CSMS] Session ${sessionId} stopped, reason=${reason}`);

            // Emit ไป App
            io.to(sessionRooms(session)).emit('chargingStopped', {
              sessionId,
              energyCharged,
              chargingTime,
              totalPrice,
              carbonReduce,
              reason,
            });

            // Cleanup
            txnToSession.delete(txnId);
            sessionStartTime.delete(sessionId);
            lastMeterAt.delete(sessionId);
            const pending = pendingFinalize.get(sessionId);
            if (pending) {
              clearTimeout(pending);          // ปิดด้วย StopTransaction แล้ว ไม่ต้อง finalize ซ้ำ
              pendingFinalize.delete(sessionId);
            }
            break;
          }

          // ========== StatusNotification ==========
          case 'StatusNotification': {
            const { connector, status, error } = data;
            
            console.log(`[CSMS] Connector ${connector} status: ${status}`);

            // อัพเดท Station ใน MongoDB
            try {
              await Station.updateOne(
                { 'chargers.id': `connector-${connector}` },
                { $set: { 'chargers.$.status': status } }
              );
            } catch (e) {
              // Ignore if station not found
            }

            // Broadcast ไปทุก client
            io.emit('connectorStatus', {
              cpId: cp_id,
              connectorId: connector,
              status,
              errorCode: error,
            });

            // ===== Fallback: ถ้า connector กลับเป็น Available/Finishing ขณะมี active session =====
            if (status === 'Available' || status === 'Finishing') {
              const connectorNum = parseInt(connector) || connector;
              console.log(`[CSMS] Fallback check: Looking for active session on connector ${connectorNum}`);
              
              // หา active session ของ connector นี้ (รองรับทั้ง int และ string)
              // ยกเว้น AC: AC ไม่ใช่ OCPP connector แต่ session ถูกบันทึก connectorId=1 ซ้ำกับหัว DC
              // → status ของหัว DC (เช่น Available) เคยไปปิด session AC ที่ยังจ่ายไฟอยู่
              const session = await ChargingSession.findOne({
                $or: [
                  { connectorId: connectorNum },
                  { connectorId: connector.toString() },
                ],
                chargerType: { $ne: 'AC' },
                state: { $in: ['Preparing', 'Charging'] },
                status: 'Active',
              });

              console.log(`[CSMS] Fallback: Found session:`, session ? `${session._id} (connectorId=${session.connectorId})` : 'none');

              // ⚠️ อย่าปิด session ทันที — StatusNotification อาจเป็น blip ชั่วคราวจาก PLC
              //    ขณะที่รถยังชาร์จอยู่จริง (เคยเกิดจริง: แอปเด้งไปหน้า Finishing ทั้งที่ยังชาร์จ)
              //    ถ้ายังมี MeterValues ไหลอยู่ = ยังชาร์จจริง → เลื่อนไปตรวจซ้ำ ไม่ปิดตอนนี้
              //    เคสหยุดจริงมี StopTransaction ปิดให้อยู่แล้ว fallback เป็นแค่ตาข่ายกันเหนียว
              if (session) {
                const sid = session._id.toString();
                const meterAge = Date.now() - (lastMeterAt.get(sid) ?? 0);

                if (meterAge < METER_ACTIVE_MS) {
                  if (!pendingFinalize.has(sid)) {
                    console.log(`[CSMS] Fallback: session ${sid} ยังมี MeterValues (${Math.round(meterAge / 1000)}s ที่แล้ว) — เลื่อนตรวจซ้ำอีก ${FINALIZE_GRACE_MS / 1000}s`);
                    pendingFinalize.set(
                      sid,
                      setTimeout(() => {
                        pendingFinalize.delete(sid);
                        recheckFinalize(sid, io).catch(err =>
                          console.error('[CSMS] recheckFinalize error:', err)
                        );
                      }, FINALIZE_GRACE_MS)
                    );
                  }
                  break;
                }

                console.log(`[CSMS] Fallback: Finalizing session ${session._id} (connector ${connector} became ${status})`);

                // คำนวณ chargingTime
                const chargingTime = calcChargingTime(session._id.toString()) || 
                  Math.floor((Date.now() - session.startTime.getTime()) / 1000);
                const totalPrice = session.energyCharged * session.pricePerKwh;
                const carbonReduce = session.energyCharged * 0.5;

                // Finalize session
                session.state = 'Stopped';
                session.status = 'Inactive';
                session.chargingTime = chargingTime;
                session.totalPrice = totalPrice;
                session.carbonReduce = carbonReduce;
                session.endTime = new Date();
                await session.save();

                // Emit ไป App
                const stopData = {
                  sessionId: session._id.toString(),
                  energyCharged: session.energyCharged,
                  chargingTime,
                  totalPrice,
                  carbonReduce,
                  reason: 'ConnectorAvailable',
                };

                console.log(`[CSMS] Emitting chargingStopped to ${sessionRooms(session).join(', ')}`);
                io.to(sessionRooms(session)).emit('chargingStopped', stopData);

                // Cleanup
                if (session.transactionId) {
                  txnToSession.delete(session.transactionId);
                }
                sessionStartTime.delete(session._id.toString());
                
                console.log(`[CSMS] Session ${session._id} finalized via fallback`);
              }
            }
            // ===============================================================================

            // ถ้า Faulted ให้ emit chargingFaulted
            if (status === 'Faulted') {
              // หา active session ของ connector นี้
              const session = await ChargingSession.findOne({
                connectorId: connector,
                chargerType: { $ne: 'AC' },   // AC ไม่ใช่ OCPP connector (ดู fallback ด้านบน)
                state: 'Charging',
                status: 'Active',
              });

              if (session) {
                session.state = 'Faulted';
                session.errorCode = error || 'CONNECTOR_FAULT';
                await session.save();

                io.to(sessionRooms(session)).emit('chargingFaulted', {
                  sessionId: session._id.toString(),
                  connectorId: connector,
                  errorCode: error || 'CONNECTOR_FAULT',
                });
              }
            }
            break;
          }
        }
      } catch (err) {
        console.error('[CSMS] Message parse error:', err);
      }
    });

    ws.on('close', () => {
      console.log('⚠️ [CSMS] WebSocket disconnected');
      scheduleReconnect();
    });

    ws.on('error', (err) => {
      console.error('[CSMS] WebSocket error:', err.message);
      // 401 = cookie หมดอายุ/ไม่ถูกต้อง → ทิ้ง cookie ให้ connect รอบหน้า login ใหม่
      if (err.message.includes('401')) {
        clearCsmsCookie();
      }
    });
  }

  connect();
}

/**
 * ลงทะเบียน mapping idTag → userId
 */
export function registerIdTagUser(idTag: string, userId: string): void {
  idTagToUser.set(idTag.toUpperCase(), userId);
}

/**
 * ลบ mapping idTag
 */
export function unregisterIdTag(idTag: string): void {
  idTagToUser.delete(idTag.toUpperCase());
}