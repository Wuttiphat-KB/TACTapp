// C:\Users\Asus\Documents\TACT\TACTAPP\src\services\socket.ts
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config/api';

// ดึง base URL (ตัด /api ออก)
const SOCKET_URL = API_BASE_URL.replace('/api', '');

let socket: Socket | null = null;

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

type EventCallback<T> = (data: T) => void;

/**
 * เชื่อมต่อ Socket.IO
 */
export function connectSocket(userId: string): Socket {
  if (socket?.connected) {
    console.log('[Socket] Already connected');
    return socket;
  }

  console.log(`[Socket] Connecting to ${SOCKET_URL}...`);

  socket = io(SOCKET_URL, {
    auth: { userId },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log(`✅ [Socket] Connected: ${socket?.id}`);
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
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log('[Socket] Disconnected manually');
  }
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
  if (socket?.connected) {
    socket.emit('joinSession', sessionId);
    console.log(`[Socket] Joined session: ${sessionId}`);
  }
}

/**
 * Leave session room
 */
export function leaveSession(sessionId: string): void {
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
  getSocket,
  joinSession,
  leaveSession,
  onMeterUpdate,
  onChargingStarted,
  onChargingStopped,
  onChargingFaulted,
  onConnectorStatus,
  pingServer,
};