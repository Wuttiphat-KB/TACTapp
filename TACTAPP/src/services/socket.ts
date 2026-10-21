// C:\Users\Asus\Documents\TACT\TACTAPP\src\services\socket.ts
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config/api';

// ดึง base URL (ตัด /api ออก)
const SOCKET_URL = API_BASE_URL.replace('/api', '');

let socket: Socket | null = null;
let socketUserId: string | null = null;

// session room ที่แอปต้องอยู่ — server ลืม room ทุกครั้งที่ socket หลุด (เน็ตสะดุด / แอปไป background)
// จึงต้อง join ใหม่ทุกครั้งที่ต่อติด ไม่งั้น meterUpdate จะหยุดมาเงียบ ๆ
const joinedSessions = new Set<string>();

interface MeterUpdateData {
  sessionId: string;
  soc: number;
  powerKw: number;
  energyCharged: number;
  chargingTime: number;
  totalPrice: number;
  carbonReduce: number;
  voltage?: number;
  currentA?: number;
  timestamp: string;
}

interface ChargingStartedData {
  sessionId: string;
  transactionId: number;
  state: string;
  connectorId: number;
}

interface ChargingStoppedData {
  sessionId: string;
  energyCharged: number;
  chargingTime: number;
  totalPrice: number;
  carbonReduce: number;
  reason?: string;
}

interface ChargingFaultedData {
  sessionId: string;
  connectorId: number;
  errorCode: string;
}

interface ConnectorStatusData {
  cpId: string;
  connectorId: number;
  status: string;
  errorCode?: string;
}

interface AcMeterUpdateData {
  cpId: string;
  acMeter: {
    powerKw: number | null;
    energyTotal: number | null;
    voltage: number | null;
    current: number | null;
    frequency: number | null;
    updatedAt: string;
    stale: boolean;
  };
}

interface GeneratorUpdateData {
  cpId: string;
  generator: {
    status: 'Running' | 'Stopped' | 'Unknown';
    fuelLevel: number | null;
    frequency: number | null;
    rpm: number | null;
    batteryVoltage: number | null;
    coolantTemp: number | null;
    voltageL1N: number | null;
    updatedAt: string;
    stale: boolean;
  };
}

type EventCallback<T> = (data: T) => void;

/**
 * เชื่อมต่อ Socket.IO
 */
export function connectSocket(userId: string): Socket {
  // มี socket ของ user นี้อยู่แล้ว (ต่ออยู่ หรือกำลัง reconnect) → ใช้ตัวเดิม
  // เดิมเช็คแค่ .connected → ระหว่างกำลังต่อจะสร้าง socket ซ้อน และ listener ที่ผูกกับตัวเดิมจะไม่ทำงาน
  if (socket && socketUserId === userId) {
    if (!socket.connected) socket.connect();
    return socket;
  }
  if (socket) {
    // เปลี่ยน user โดยไม่ได้ logout → ทิ้ง socket และ room ของคนเดิม
    socket.disconnect();
    socket = null;
    joinedSessions.clear();
  }

  console.log(`[Socket] Connecting to ${SOCKET_URL}...`);

  socketUserId = userId;
  socket = io(SOCKET_URL, {
    auth: { userId },
    transports: ['websocket'],
    reconnection: true,
    // เดิม 10 ครั้ง (~50 วิ) แล้วเลิกถาวร → เน็ตหน้างานหลุดนานกว่านั้น = ไม่มีค่า real-time อีกเลยจนกว่าจะปิดแอป
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log(`✅ [Socket] Connected: ${socket?.id}`);
    // join session room ใหม่ทุกครั้งที่ต่อติด (รวมครั้งแรก — กรณี joinSession ถูกเรียกก่อน socket ต่อเสร็จ)
    joinedSessions.forEach((sessionId) => {
      socket?.emit('joinSession', sessionId);
      console.log(`[Socket] (Re)joined session: ${sessionId}`);
    });
  });

  socket.on('disconnect', (reason) => {
    console.log(`⚠️ [Socket] Disconnected: ${reason}`);
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message);
  });

  return socket;
}

/**
 * ตัดการเชื่อมต่อ Socket.IO
 */
export function disconnectSocket(): void {
  joinedSessions.clear();
  if (socket) {
    socket.disconnect();
    socket = null;
    socketUserId = null;
    console.log('[Socket] Disconnected manually');
  }
}

/**
 * ต่อ socket ใหม่ถ้าหลุดอยู่ (เรียกตอนแอปกลับมาจาก background)
 */
export function ensureSocketConnected(): void {
  if (socket && !socket.connected) {
    socket.connect();
  }
}

/**
 * เรียก callback เมื่อ socket ต่อกลับมาได้หลังหลุด — ใช้ sync สถานะที่อาจพลาดไประหว่างหลุด
 */
export function onSocketReconnect(callback: () => void): () => void {
  if (!socket) return () => {};

  const manager = socket.io;
  manager.on('reconnect', callback);
  return () => manager.off('reconnect', callback);
}

/**
 * ดึง Socket instance
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Join session room (รับ meterUpdate)
 */
export function joinSession(sessionId: string): void {
  // จำไว้เสมอ — ถ้ายังไม่ต่อ จะ join ให้ตอน 'connect' (เดิมถ้ายังไม่ต่อ = ไม่ join เลย ค่าไม่อัปเดต)
  joinedSessions.add(sessionId);
  if (socket?.connected) {
    socket.emit('joinSession', sessionId);
    console.log(`[Socket] Joined session: ${sessionId}`);
  }
}

/**
 * Leave session room
 */
export function leaveSession(sessionId: string): void {
  joinedSessions.delete(sessionId);
  if (socket?.connected) {
    socket.emit('leaveSession', sessionId);
    console.log(`[Socket] Left session: ${sessionId}`);
  }
}

/**
 * Listen for meter updates (real-time charging data)
 */
export function onMeterUpdate(callback: EventCallback<MeterUpdateData>): () => void {
  if (!socket) return () => {};
  
  socket.on('meterUpdate', callback);
  return () => socket?.off('meterUpdate', callback);
}

/**
 * Listen for charging started event
 */
export function onChargingStarted(callback: EventCallback<ChargingStartedData>): () => void {
  if (!socket) return () => {};
  
  socket.on('chargingStarted', callback);
  return () => socket?.off('chargingStarted', callback);
}

/**
 * Listen for charging stopped event
 */
export function onChargingStopped(callback: EventCallback<ChargingStoppedData>): () => void {
  if (!socket) return () => {};
  
  socket.on('chargingStopped', callback);
  return () => socket?.off('chargingStopped', callback);
}

/**
 * Listen for charging faulted event
 */
export function onChargingFaulted(callback: EventCallback<ChargingFaultedData>): () => void {
  if (!socket) return () => {};
  
  socket.on('chargingFaulted', callback);
  return () => socket?.off('chargingFaulted', callback);
}

/**
 * Listen for connector status changes
 */
export function onConnectorStatus(callback: EventCallback<ConnectorStatusData>): () => void {
  if (!socket) return () => {};

  socket.on('connectorStatus', callback);
  return () => socket?.off('connectorStatus', callback);
}

/**
 * Listen for generator telemetry updates (station-scoped, broadcast)
 */
export function onGeneratorUpdate(callback: EventCallback<GeneratorUpdateData>): () => void {
  if (!socket) return () => {};

  socket.on('generatorUpdate', callback);
  return () => socket?.off('generatorUpdate', callback);
}

/**
 * Listen for AC meter updates (DTSU666 — ส่งเฉพาะตอน generator ทำงาน)
 */
export function onAcMeterUpdate(callback: EventCallback<AcMeterUpdateData>): () => void {
  if (!socket) return () => {};

  socket.on('acMeterUpdate', callback);
  return () => socket?.off('acMeterUpdate', callback);
}

/**
 * Ping server to test connection
 */
export function pingServer(): Promise<{ pong: boolean; timestamp: number }> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Socket not connected'));
      return;
    }

    socket.emit('ping', (response: { pong: boolean; timestamp: number }) => {
      resolve(response);
    });

    // Timeout after 5 seconds
    setTimeout(() => reject(new Error('Ping timeout')), 5000);
  });
}

export default {
  connectSocket,
  disconnectSocket,
  ensureSocketConnected,
  onSocketReconnect,
  getSocket,
  joinSession,
  leaveSession,
  onMeterUpdate,
  onChargingStarted,
  onChargingStopped,
  onChargingFaulted,
  onConnectorStatus,
  onGeneratorUpdate,
  onAcMeterUpdate,
  pingServer,
};