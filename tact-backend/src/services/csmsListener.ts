// C:\Users\Asus\Documents\TACT\tact-backend\src\services\csmsListener.ts
import WebSocket from 'ws';
import { Server as SocketIOServer } from 'socket.io';
import ChargingSession from '../models/ChargingSession';
import Station from '../models/Station';
import { triggerAllConnectorStatus } from './ocppBridge';

const CSMS_WS = process.env.CSMS_WS_URL || 'ws://212.80.215.42:8080/ws';

// Mapping: idTag → userId (เก็บตอน start charging)
export const idTagToUser = new Map<string, string>();

// Mapping: transactionId → sessionId (เก็บตอนได้ StartTransaction)
export const txnToSession = new Map<number, string>();

// Mapping: sessionId → startTime (สำหรับคำนวณ chargingTime)
const sessionStartTime = new Map<string, Date>();

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
 * เริ่มฟัง CSMS WebSocket และ emit events ไป App ผ่าน Socket.IO
 */
export function initCSMSListener(io: SocketIOServer): void {
  let ws: WebSocket;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;

  function connect() {
    console.log(`[CSMS] Connecting to ${CSMS_WS}...`);
    
    ws = new WebSocket(CSMS_WS);

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
            const userId = idTagToUser.get(upperIdTag);
            
            if (!userId) {
              console.log(`[CSMS] StartTransaction: Unknown idTag ${idTag}`);
              break;
            }

            // หา session ที่รอ transaction
            const session = await ChargingSession.findOne({
              idTag: upperIdTag,
              state: 'Preparing',
              status: 'Active',
            });

            if (!session) {
              console.log(`[CSMS] StartTransaction: No preparing session for ${idTag}`);
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
            io.to(`user:${userId}`).emit('chargingStarted', {
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
            const sessionId = txnToSession.get(txnId);
            
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

            // Emit ไป App
            io.to(`session:${sessionId}`).emit('meterUpdate', {
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
            const sessionId = txnToSession.get(txnId);
            
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

            // หา userId
            const userId = idTagToUser.get(session.idTag);

            console.log(`[CSMS] Session ${sessionId} stopped, reason=${reason}`);

            // Emit ไป App
            if (userId) {
              io.to(`user:${userId}`).emit('chargingStopped', {
                sessionId,
                energyCharged,
                chargingTime,
                totalPrice,
                carbonReduce,
                reason,
              });
            }
            io.to(`session:${sessionId}`).emit('chargingStopped', {
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
              const session = await ChargingSession.findOne({
                $or: [
                  { connectorId: connectorNum },
                  { connectorId: connector.toString() },
                ],
                state: { $in: ['Preparing', 'Charging'] },
                status: 'Active',
              });

              console.log(`[CSMS] Fallback: Found session:`, session ? `${session._id} (connectorId=${session.connectorId})` : 'none');

              if (session) {
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

                // หา userId
                const userId = idTagToUser.get(session.idTag);

                // Emit ไป App
                const stopData = {
                  sessionId: session._id.toString(),
                  energyCharged: session.energyCharged,
                  chargingTime,
                  totalPrice,
                  carbonReduce,
                  reason: 'ConnectorAvailable',
                };

                if (userId) {
                  console.log(`[CSMS] Emitting chargingStopped to user:${userId}`);
                  io.to(`user:${userId}`).emit('chargingStopped', stopData);
                }
                console.log(`[CSMS] Emitting chargingStopped to session:${session._id.toString()}`);
                io.to(`session:${session._id.toString()}`).emit('chargingStopped', stopData);

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
                state: 'Charging',
                status: 'Active',
              });

              if (session) {
                session.state = 'Faulted';
                session.errorCode = error || 'CONNECTOR_FAULT';
                await session.save();

                const userId = idTagToUser.get(session.idTag);
                if (userId) {
                  io.to(`user:${userId}`).emit('chargingFaulted', {
                    sessionId: session._id.toString(),
                    connectorId: connector,
                    errorCode: error || 'CONNECTOR_FAULT',
                  });
                }
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
      
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = Math.min(5000 * reconnectAttempts, 30000);
        console.log(`[CSMS] Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts})`);
        setTimeout(connect, delay);
      } else {
        console.error('[CSMS] Max reconnect attempts reached');
      }
    });

    ws.on('error', (err) => {
      console.error('[CSMS] WebSocket error:', err.message);
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