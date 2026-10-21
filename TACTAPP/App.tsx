// C:\Users\Asus\Documents\TACT\TACTAPP\App.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, SafeAreaView, StatusBar, Alert, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LanguageProvider, useLanguage } from './src/contexts/LanguageContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import {
  LoadingScreen,
  LoginScreen,
  RegisterScreen,
  ForgotPasswordScreen,
  MainScreen,
  ChargerScreen,
  ChargingScreen,
  FinishingScreen,
  ChargingHistoryScreen,
  ContactScreen,
  ProfileScreen,
  FaultScreen,
} from './src/screens';
import { BottomTabs, TabName } from './src/components/BottomTabs';
import { Station, Charger, ChargingSession } from './src/types';
import { apiClient, ApiResponse } from './src/services/api';
import {
  connectSocket,
  disconnectSocket,
  ensureSocketConnected,
  onSocketReconnect,
  joinSession,
  leaveSession,
  onMeterUpdate,
  onChargingStarted,
  onChargingStopped,
  onChargingFaulted,
  onConnectorStatus,
  onGeneratorUpdate,
  onAcMeterUpdate,
} from './src/services/socket';

import './global.css';

type AppScreen =
  | 'Loading'
  | 'Login'
  | 'Register'
  | 'ForgotPassword'
  | 'MainTabs'
  | 'StationDetail'
  | 'Charging'
  | 'Finishing'
  | 'ChargingHistory';

// ========== Session restore helpers ==========
// เก็บ id ของ session ล่าสุดไว้ในเครื่อง → ถ้า session จบระหว่างที่แอปถูกปัดทิ้ง
// เปิดแอปใหม่ยังพาไปหน้าสรุป (Finishing) ของ transaction นั้นได้ — ล้างเมื่อผู้ใช้กด Finish
const LAST_SESSION_KEY = 'tact_last_session_id';
// session ที่จบนานเกินนี้แล้ว (และไม่ได้เปิดค้างไว้ในแอป) ไม่ต้องเด้งหน้าสรุปแล้ว
const SUMMARY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// ระหว่างรอตู้ (เริ่มชาร์จ / หยุดชาร์จ) เช็คกับ server เป็นระยะ เผื่อพลาด event จาก socket
const WAITING_POLL_MS = 8000;
// session ที่ไม่เคยเริ่มชาร์จจริง (ผู้ใช้ยกเลิก / ตู้ไม่ตอบภายในเวลา — backend ยกเลิกให้)
type AbortedStartReason = 'Cancelled' | 'StartTimeout';
const ABORTED_START_CODES: Record<string, AbortedStartReason> = {
  CANCELLED: 'Cancelled',
  START_TIMEOUT: 'StartTimeout',
};

const saveLastSessionId = async (sessionId: string) => {
  try {
    await AsyncStorage.setItem(LAST_SESSION_KEY, sessionId);
  } catch (error) {
    console.warn('[App] Save last session id failed:', error);
  }
};

const loadLastSessionId = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(LAST_SESSION_KEY);
  } catch {
    return null;
  }
};

const clearLastSessionId = async () => {
  try {
    await AsyncStorage.removeItem(LAST_SESSION_KEY);
  } catch {
    // ignore
  }
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// เรียกซ้ำเฉพาะตอนไม่ได้คำตอบจาก server (เน็ตมือถือหน้างานสะดุด) — ถ้า server ตอบ error มาแล้วไม่ retry
async function withRetry<T>(call: () => Promise<ApiResponse<T>>, attempts: number): Promise<ApiResponse<T>> {
  let res = await call();
  for (let i = 1; i < attempts && !res.success && res.networkError; i++) {
    await sleep(1500 * i);
    res = await call();
  }
  return res;
}

// stationId ใน session อาจเป็น id ตรง ๆ หรือ object ที่ populate มาแล้ว
const sessionStationId = (s: any): string | null => {
  const st = s?.stationId;
  if (!st) return null;
  return String(typeof st === 'object' ? st._id : st);
};

// แปลง session จาก backend → ChargingSession ของแอป
const toClientSession = (s: any): ChargingSession => ({
  id: String(s._id),
  chargerId: s.chargerId,
  stationId: sessionStationId(s) ?? '',
  userId: String(s.userId),
  soc: s.chargerType === 'AC' ? null : s.soc ?? 0,
  state: s.state,
  powerKw: s.powerKw || 0,
  chargingTime: s.chargingTime || 0,
  energyCharged: s.energyCharged || 0,
  status: s.status,
  carbonReduce: s.carbonReduce || 0,
  fuelUsed: s.fuelUsed || 0,
  totalPrice: s.totalPrice || 0,
  startTime: new Date(s.startTime),
  endTime: s.endTime ? new Date(s.endTime) : undefined,
});

// หา "หัวชาร์จของ session" ในข้อมูลสถานี — ห้ามล้มแค่เพราะ id ไม่ตรง
// (เดิม: หาด้วย id อย่างเดียว ไม่เจอ → selectedCharger = null → หน้า Charging ไม่ render
//  → ตกไปหน้า Charger ที่หัวชาร์จเป็นสีเทากดไม่ได้ และกลับเข้า transaction เดิมไม่ได้)
const resolveSessionCharger = (station: Station | null, s: any): Charger => {
  const chargers: Charger[] = station?.chargers ?? [];
  const type: Charger['type'] = s.chargerType === 'AC' ? 'AC' : 'CCS2';
  const sameType = chargers.filter((c) => c.type === type);
  const found =
    chargers.find((c) => c.id === s.chargerId) ||
    // AC ไม่ใช่ OCPP connector (connectorId ใน session ไม่มีความหมาย) → เทียบ connector เฉพาะ DC
    (type === 'CCS2' ? sameType.find((c) => c.connectorId === s.connectorId) : undefined) ||
    (sameType.length === 1 ? sameType[0] : undefined);
  if (found) return found;

  // หาไม่เจอจริง ๆ → สร้างจากข้อมูล session (หน้า Charging ใช้แค่ประเภทหัว)
  return {
    id: s.chargerId,
    stationId: sessionStationId(s) ?? '',
    type,
    pricePerKwh: s.pricePerKwh ?? 0,
    status: 'Charging',
    connectorId: s.connectorId,
  };
};

// สำรองตอนโหลดข้อมูลสถานีไม่สำเร็จ: ใช้ชื่อ/รุ่น/ที่ตั้งที่ populate มากับ session พอให้หน้า Charging/Finishing แสดงได้
const stationFromSession = (s: any): Station | null => {
  const st = s?.stationId;
  if (!st || typeof st !== 'object') return null;
  return {
    _id: String(st._id),
    id: String(st._id),
    name: st.name ?? '',
    model: st.chargerModel ?? '',
    chargerModel: st.chargerModel,
    location: st.location ?? { address: '', latitude: 0, longitude: 0 },
    status: 'Online',
    generatorFuelLevel: 0,
    chargers: [],
    ownerPhone: '',
  };
};

const AppContent: React.FC = () => {
  const { isAuthenticated, user, isLoading: isAuthLoading } = useAuth();
  const { t } = useLanguage();
  // socket listener ลงทะเบียนครั้งเดียว → ใช้ ref ให้เห็นภาษาปัจจุบันเสมอ
  const tRef = useRef(t);
  tRef.current = t;

  // Navigation state
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('Loading');
  const [activeTab, setActiveTab] = useState<TabName>('main');
  
  // Data state
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [selectedCharger, setSelectedCharger] = useState<Charger | null>(null);
  const [currentSession, setCurrentSession] = useState<ChargingSession | null>(null);
  const [isCharging, setIsCharging] = useState(false);
  
  // Fault modal state
  const [showFault, setShowFault] = useState(false);
  const [faultErrorCode, setFaultErrorCode] = useState('ERR_001');

  // Loading state for API calls
  const [isStartingCharge, setIsStartingCharge] = useState(false);
  const [isStoppingCharge, setIsStoppingCharge] = useState(false);
  const [isWaitingUnplug, setIsWaitingUnplug] = useState(false);  // ← NEW: รอถอดสาย

  // Refs for immediate check (ป้องกัน double-tap)
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);

  // Track if socket listeners are set up
  const socketListenersRef = useRef(false);

  // ========== Sync session กับ server ==========
  // เรียกตอน login / เปิดแอปใหม่ (navigate=true) และตอนแอปกลับจาก background / socket ต่อใหม่ (navigate=false)
  // - ยังชาร์จอยู่ → คืนสภาพ session + หัวชาร์จ + join room (กลับเข้า transaction เดิมได้เสมอ)
  // - จบไปแล้วระหว่างแอปปิด/อยู่เบื้องหลัง (พลาด event chargingStopped) → พาไปหน้าสรุปของ transaction นั้น
  // refs ให้ callback ที่ถูกเรียกแบบ async (AppState, socket) เห็นค่าล่าสุดเสมอ
  const currentSessionRef = useRef<ChargingSession | null>(null);
  const currentScreenRef = useRef<AppScreen>('Loading');
  const selectedStationRef = useRef<Station | null>(null);
  const isSyncingRef = useRef(false);
  const pendingNavigateRef = useRef(false);

  useEffect(() => { currentSessionRef.current = currentSession; }, [currentSession]);
  useEffect(() => { currentScreenRef.current = currentScreen; }, [currentScreen]);
  useEffect(() => { selectedStationRef.current = selectedStation; }, [selectedStation]);

  // ========== session ที่ไม่เคยเริ่มชาร์จ (ยกเลิก / ตู้ไม่ตอบ) → กลับหน้า Charger ==========
  // ไม่ใช่หน้าสรุป (ไม่มีอะไรให้สรุป) และต้องไม่ค้างอยู่ในหน้าต่าง "กำลังเริ่มชาร์จ"
  // event อาจมาทั้งจาก HTTP response และ socket → กันทำซ้ำ/แจ้งเตือนซ้ำด้วย id
  const abortedSessionIdsRef = useRef(new Set<string>());
  const resetAfterAbortedStart = useCallback((sessionId: string, reason: AbortedStartReason, notify = true) => {
    if (abortedSessionIdsRef.current.has(sessionId)) return;
    abortedSessionIdsRef.current.add(sessionId);

    leaveSession(sessionId);
    clearLastSessionId();
    setIsCharging(false);
    setIsWaitingUnplug(false);
    setIsStoppingCharge(false);
    isStoppingRef.current = false;
    setCurrentSession(null);
    setSelectedCharger(null);
    setCurrentScreen(selectedStationRef.current ? 'StationDetail' : 'MainTabs');
    setActiveTab('charger');

    if (notify) {
      const tr = tRef.current;
      if (reason === 'StartTimeout') {
        Alert.alert(tr('startTimeoutTitle'), tr('startTimeoutMsg'));
      } else {
        Alert.alert(tr('startCancelledTitle'), tr('startCancelledMsg'));
      }
    }
  }, []);

  const loadSessionStation = useCallback(async (s: any): Promise<Station | null> => {
    const stationId = sessionStationId(s);
    if (!stationId) return null;

    const res = await withRetry(() => apiClient.getStationById(stationId), 2);
    if (res.success && res.data) return res.data;

    // โหลดไม่สำเร็จ → ใช้ข้อมูลที่มีอยู่ในแอป ถ้าเป็นสถานีเดียวกัน ไม่งั้นใช้ข้อมูลที่ populate มากับ session
    const current = selectedStationRef.current;
    if (current && String(current._id || current.id) === stationId) return current;
    return stationFromSession(s);
  }, []);

  const syncActiveSession = useCallback(async ({ navigate }: { navigate: boolean }) => {
    if (navigate) pendingNavigateRef.current = true;
    if (isSyncingRef.current) return; // รอบที่กำลังวิ่งอยู่จะเห็น pendingNavigateRef เอง
    isSyncingRef.current = true;

    try {
      console.log('[App] Syncing session with server...');
      const response = await withRetry(
        () => apiClient.getActiveSession(),
        pendingNavigateRef.current ? 3 : 1
      );

      if (!response.success) {
        // เน็ตยังไม่พร้อม → ไม่แตะ state เดิม ลองใหม่ตอนแอปกลับมา active / socket ต่อใหม่
        console.warn('[App] Sync session failed:', response.message || response.error);
        pendingNavigateRef.current = false;
        return;
      }

      // ===== ยังมี session ที่ทำงานอยู่ → กลับเข้า transaction เดิม =====
      if (response.data) {
        const s = response.data;
        const sessionId = String(s._id);

        // กำลังดูหน้าสรุปอยู่ → ไม่ทับ ให้ผู้ใช้กด Finish ก่อน
        if (currentScreenRef.current === 'Finishing') {
          pendingNavigateRef.current = false;
          return;
        }

        const station = await loadSessionStation(s);
        if (station) setSelectedStation(station);
        setSelectedCharger(resolveSessionCharger(station, s));
        setCurrentSession(toClientSession(s));
        setIsCharging(true);
        joinSession(sessionId);
        saveLastSessionId(sessionId);

        if (pendingNavigateRef.current) {
          pendingNavigateRef.current = false;
          setCurrentScreen('Charging');
          setActiveTab('charger');
        }
        console.log('[App] Session restored:', sessionId, 'state:', s.state);
        return;
      }

      // ===== ไม่มี session ที่ทำงานอยู่แล้ว =====
      // เช็คว่า session ที่แอปถืออยู่ (หรือที่จำไว้ในเครื่อง) จบไปตอนแอปปิด/อยู่เบื้องหลังหรือเปล่า
      const local = currentSessionRef.current;
      const localPendingId =
        local &&
        currentScreenRef.current !== 'Finishing' &&
        (local.state === 'Preparing' || local.state === 'Charging')
          ? local.id
          : null;
      const pendingId = localPendingId || (await loadLastSessionId());

      if (!pendingId) {
        pendingNavigateRef.current = false;
        console.log('[App] No active session');
        return;
      }

      const sessionRes = await withRetry(() => apiClient.getChargingSession(pendingId), 2);
      if (!sessionRes.success || !sessionRes.data) {
        // server ตอบว่าไม่มี session นี้ → เลิกตามหา / เน็ตหลุด → เก็บไว้ลองรอบหน้า
        if (!sessionRes.networkError) await clearLastSessionId();
        pendingNavigateRef.current = false;
        return;
      }

      const s = sessionRes.data;
      const ended = s.status === 'Inactive' || s.state === 'Stopped' || s.state === 'Faulted';
      if (!ended) {
        pendingNavigateRef.current = false;
        return;
      }

      // ไม่เคยเริ่มชาร์จจริง (ยกเลิก / ตู้ไม่ตอบ) → ไม่มีหน้าสรุป กลับหน้า Charger
      const abortedReason = ABORTED_START_CODES[s.errorCode as string];
      if (abortedReason) {
        pendingNavigateRef.current = false;
        if (localPendingId) {
          resetAfterAbortedStart(String(s._id), abortedReason); // ผู้ใช้กำลังรออยู่ → บอกเหตุผล
        } else {
          await clearLastSessionId();
        }
        return;
      }

      const endedAt = s.endTime ? new Date(s.endTime).getTime() : Date.now();
      if (!localPendingId && Date.now() - endedAt > SUMMARY_MAX_AGE_MS) {
        // จบไปนานแล้ว ไม่ต้องเด้งหน้าสรุป
        await clearLastSessionId();
        pendingNavigateRef.current = false;
        return;
      }

      const station = await loadSessionStation(s);
      if (station) setSelectedStation(station);
      setSelectedCharger(resolveSessionCharger(station, s));
      setCurrentSession({ ...toClientSession(s), state: 'Stopped', endTime: new Date(endedAt) });
      setIsCharging(false);
      setIsWaitingUnplug(false);
      setIsStoppingCharge(false);
      isStoppingRef.current = false;
      leaveSession(String(s._id));
      pendingNavigateRef.current = false;
      setCurrentScreen('Finishing');
      console.log('[App] Session ended while app was away → Finishing:', s._id);
    } catch (error) {
      console.error('[App] Sync session error:', error);
    } finally {
      isSyncingRef.current = false;
    }
  }, [loadSessionStation, resetAfterAbortedStart]);

  // ========== Socket.IO Connection ==========
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      // เชื่อม Socket.IO เมื่อ login
      console.log('[Socket] Connecting for user:', user.id);
      connectSocket(user.id);

      // Setup event listeners (once)
      if (!socketListenersRef.current) {
        setupSocketListeners();
        // socket ต่อกลับมาได้หลังหลุด → อาจพลาด event ระหว่างหลุด → sync สถานะ session ใหม่
        // (การ join session room ใหม่ socket.ts ทำให้อัตโนมัติ)
        onSocketReconnect(() => {
          console.log('[Socket] Reconnected — syncing session');
          syncActiveSession({ navigate: false });
        });
        socketListenersRef.current = true;
      }

      // เช็ค session กับ server (เมื่อ login หรือ reopen app) แล้วพาไปหน้าที่ถูกต้อง
      syncActiveSession({ navigate: true });
    } else {
      // ตัดการเชื่อมต่อเมื่อ logout
      disconnectSocket();
      socketListenersRef.current = false;
    }

    return () => {
      // Cleanup on unmount
      disconnectSocket();
    };
    // setupSocketListeners ลงทะเบียนครั้งเดียวต่อการ login (กันด้วย socketListenersRef)
    // และใช้แต่ setter / ref / callback ที่ไม่เปลี่ยน → ไม่ต้องอยู่ใน deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id, syncActiveSession]);

  // ========== แอปกลับจาก background → sync ใหม่ ==========
  // ระหว่างอยู่เบื้องหลัง socket มักหลุด → พลาด event (เช่น chargingStopped) และ server ลืม session room
  useEffect(() => {
    if (!isAuthenticated) return;

    let lastState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && lastState !== 'active') {
        ensureSocketConnected();
        syncActiveSession({ navigate: false });
      }
      lastState = nextState;
    });

    return () => subscription.remove();
  }, [isAuthenticated, syncActiveSession]);

  // ========== ระหว่างรอตู้ → เช็คกับ server เป็นระยะ ==========
  // หน้าต่าง "กำลังเริ่มชาร์จ" / "กรุณาถอดสาย" เดิมรอแค่ event จาก socket อย่างเดียว
  // ถ้า event หลุด (เน็ตสะดุด, backend restart) ผู้ใช้ติดอยู่ในหน้าต่างนั้นตลอด
  const isWaitingForCharger =
    currentScreen === 'Charging' && (isWaitingUnplug || currentSession?.state === 'Preparing');
  useEffect(() => {
    if (!isWaitingForCharger) return;
    const timer = setInterval(() => syncActiveSession({ navigate: false }), WAITING_POLL_MS);
    return () => clearInterval(timer);
  }, [isWaitingForCharger, syncActiveSession]);

  // ========== Socket Event Listeners ==========
  const setupSocketListeners = () => {
    // เมื่อ Charger เริ่มชาร์จจริง (ได้ transactionId)
    onChargingStarted((data) => {
      console.log('[Socket] Charging started:', data);
      
      setCurrentSession(prev => {
        if (prev && prev.id === data.sessionId) {
          return {
            ...prev,
            state: 'Charging',
          };
        }
        return prev;
      });
    });

    // อัพเดทค่า real-time ทุก ~4 วินาที
    onMeterUpdate((data) => {
      console.log('[Socket] Meter update:', data);
      
      setCurrentSession(prev => {
        if (prev && prev.id === data.sessionId) {
          return {
            ...prev,
            soc: data.soc || prev.soc,
            powerKw: data.powerKw,
            energyCharged: data.energyCharged,
            chargingTime: data.chargingTime,
            totalPrice: data.totalPrice,
            carbonReduce: data.carbonReduce,
          };
        }
        return prev;
      });
    });

    // เมื่อชาร์จเสร็จ
    onChargingStopped((data) => {
      console.log('[Socket] Charging stopped:', data);

      // ยกเลิกก่อนเริ่มชาร์จจริง (ผู้ใช้กดยกเลิก / ตู้ไม่ตอบภายในเวลา) → กลับหน้า Charger ไม่ใช่หน้าสรุป
      if (data.reason === 'Cancelled' || data.reason === 'StartTimeout') {
        if (currentSessionRef.current?.id === data.sessionId) {
          resetAfterAbortedStart(data.sessionId, data.reason);
        }
        return;
      }

      // Reset waiting states
      setIsWaitingUnplug(false);
      setIsStoppingCharge(false);
      isStoppingRef.current = false;
      
      setCurrentSession(prev => {
        if (prev && prev.id === data.sessionId) {
          const updatedSession = {
            ...prev,
            state: 'Stopped' as const,
            energyCharged: data.energyCharged,
            chargingTime: data.chargingTime,
            totalPrice: data.totalPrice,
            carbonReduce: data.carbonReduce,
            endTime: new Date(),
          };
          
          // ไปหน้า Finishing
          setIsCharging(false);
          setCurrentScreen('Finishing');
          
          return updatedSession;
        }
        return prev;
      });
    });

    // เมื่อเกิด Fault
    onChargingFaulted((data) => {
      console.log('[Socket] Charging faulted:', data);
      
      setFaultErrorCode(data.errorCode || 'ERR_FAULT');
      setShowFault(true);
    });

    // อัพเดทสถานะ connector (broadcast ไปทุก client)
    onConnectorStatus((data) => {
      console.log('[Socket] Connector status:', data);
      
      // อัพเดท selectedStation.chargers status real-time
      setSelectedStation(prev => {
        if (!prev) return prev;
        
        const updatedChargers = prev.chargers.map(charger => {
          // ข้าม charger ที่ disabled (ไม่อัพเดท status)
          if (charger.enabled === false || charger.status === 'Disabled') {
            return charger;
          }
          
          // ใช้ connectorId จาก DB ตรง ๆ — AC ไม่มี connectorId (ไม่ใช่ OCPP connector) → ไม่ match status ใด
          const chargerConnectorId = charger.connectorId;

          if (chargerConnectorId && chargerConnectorId === data.connectorId) {
            console.log(`[Socket] Updating charger ${charger.id} status: ${charger.status} → ${data.status}`);
            return { ...charger, status: data.status as any };
          }
          return charger;
        });
        
        return { ...prev, chargers: updatedChargers };
      });
    });

    // อัพเดทค่ามิเตอร์ AC (ส่งเฉพาะตอน generator ทำงาน)
    onAcMeterUpdate((data) => {
      setSelectedStation(prev => (prev ? { ...prev, acMeter: data.acMeter } : prev));
    });

    // อัพเดทค่า generator (station-scoped, broadcast จาก backend telemetry)
    onGeneratorUpdate((data) => {
      // deployment นี้มี station เดียว → อัพเดท selectedStation ที่แสดงอยู่
      setSelectedStation(prev => (prev ? { ...prev, generator: data.generator } : prev));
    });
  };

  // ========== Trigger Fault (manual) ==========
  const triggerFault = useCallback(async (code?: string) => {
    const errorCode = code || 'ERR_MANUAL';
    setFaultErrorCode(errorCode);
    setShowFault(true);

    if (currentSession?.id) {
      try {
        await apiClient.reportFault(
          currentSession.id,
          errorCode,
          `Fault ${errorCode} during charging`
        );
        console.log('[API] Fault reported:', errorCode);
      } catch (error) {
        console.error('[API] Failed to report fault:', error);
      }
    }
  }, [currentSession]);

  // ========== Navigation Handlers ==========
  // ออกจากหน้า Loading เมื่อครบ 2 วิ "และ" เช็ค login เสร็จแล้ว
  // (เดิมครบ 2 วิก็ไปเลย → เน็ตช้าตอนเปิดแอป = เด้งไปหน้า Login ทั้งที่ login ค้างไว้อยู่)
  const [loadingTimerDone, setLoadingTimerDone] = useState(false);
  const handleLoadingFinish = useCallback(() => {
    setLoadingTimerDone(true);
  }, []);
  useEffect(() => {
    if (!loadingTimerDone || isAuthLoading) return;
    setCurrentScreen((prev) => (prev === 'Loading' ? (isAuthenticated ? 'MainTabs' : 'Login') : prev));
  }, [loadingTimerDone, isAuthLoading, isAuthenticated]);

  const handleLoginSuccess = useCallback(() => {
    setCurrentScreen('MainTabs');
  }, []);

  const handleLogout = useCallback(() => {
    // Leave session room ถ้ามี
    if (currentSession?.id) {
      leaveSession(currentSession.id);
    }
    
    disconnectSocket();
    clearLastSessionId(); // session ที่จำไว้เป็นของ user คนนี้ — ไม่ให้คนที่ login ต่อเห็น
    setCurrentScreen('Login');
    setActiveTab('main');
    setIsCharging(false);
    setIsWaitingUnplug(false);
    isStartingRef.current = false;
    isStoppingRef.current = false;
    setSelectedStation(null);
    setSelectedCharger(null);
    setCurrentSession(null);
  }, [currentSession]);

  // State สำหรับ loading ตอน refresh station
  const [isRefreshingStation, setIsRefreshingStation] = useState(false);

  const handleSelectStation = useCallback(async (station: Station) => {
    setIsRefreshingStation(true);
    
    try {
      // Refresh station data เพื่อดึง status ล่าสุดจาก CSMS
      console.log('[App] Refreshing station data:', station.id);
      const response = await apiClient.getStationById(station.id);
      
      if (response.success && response.data) {
        console.log('[App] Station refreshed, chargers:', response.data.chargers?.map((c: any) => `${c.id}:${c.status}`));
        setSelectedStation(response.data);
      } else {
        // Fallback ถ้า API fail
        console.warn('[App] Station refresh failed, using cached data');
        setSelectedStation(station);
      }
    } catch (error) {
      console.error('[App] Station refresh error:', error);
      // Fallback ถ้า API error
      setSelectedStation(station);
    } finally {
      setIsRefreshingStation(false);
    }
    
    setCurrentScreen('StationDetail');
  }, []);

  // ========== START CHARGING — OCPP ==========
  const handleStartCharging = useCallback(async (charger: Charger) => {
    // ใช้ ref เพื่อเช็คทันที (ป้องกัน double-tap)
    if (isStartingRef.current) {
      console.log('[App] Start already in progress, ignoring...');
      return;
    }
    isStartingRef.current = true;
    setIsStartingCharge(true);

    try {
      // ===== กำหนด connectorId =====
      // วิธี 1: ถ้า charger.id เป็น "connector-X" ใช้ตัวเลขนั้น
      // วิธี 2: ถ้า charger.id มี "ccs2" → connector 2, มี "ac" → connector 1
      // วิธี 3: ใช้ index ใน array + 1
      
      // ใช้ connectorId จาก DB ตรง ๆ (CCS2 = 1). AC ไม่มี connectorId → default 1
      // หมายเหตุ: AC ที่ถูกต้องต้องไปทาง DataTransfer แยก (ไม่ใช่ RemoteStart connector) — ดู HANDOFF §4.6-A
      const connectorId = charger.connectorId ?? 1;
      
      // หา stationId (MongoDB ใช้ _id)
      const stationId = selectedStation?._id || selectedStation?.id || '';
      
      if (!stationId) {
        Alert.alert('Error', 'Station not selected');
        setIsStartingCharge(false);
        return;
      }
      
      console.log(`[App] Starting charge: stationId=${stationId}, charger.id=${charger.id}, type=${charger.type}, connectorId=${connectorId}`);

      // เรียก API สร้าง session + ส่ง RemoteStart ไป Charger
      const response = await apiClient.startCharging(
        stationId,
        charger.id,
        connectorId
      );

      if (response.success && response.data) {
        const { session: backendSession } = response.data;
        const sessionId = backendSession._id || backendSession.id;
        console.log('[API] Charging command sent, session:', sessionId);

        setSelectedCharger(charger);
        
        // สร้าง session ใน state (state: "Preparing" รอ OCPP)
        const isDC = charger.type === 'CCS2';
        const newSession: ChargingSession = {
          id: sessionId,
          chargerId: charger.id,
          stationId: stationId,
          userId: user?.id || '',
          soc: isDC ? 0 : null,
          // DC: รอ chargingStarted จาก Socket / AC: ไม่มี lifecycle → Charging เลย (gen ติด = ไฟเข้า AC)
          state: isDC ? 'Preparing' : 'Charging',
          powerKw: 0,
          chargingTime: 0,
          energyCharged: 0,
          status: 'Active',
          carbonReduce: 0,
          fuelUsed: 0,
          totalPrice: 0,
          startTime: new Date(),
        };

        setCurrentSession(newSession);
        setIsCharging(true);
        setCurrentScreen('Charging');  // ไปหน้า Charging แต่ state ยังเป็น Preparing

        // Join session room เพื่อรับ events
        joinSession(sessionId);
        // จำไว้ในเครื่อง — ถ้าแอปถูกปัดทิ้งระหว่างชาร์จ เปิดใหม่จะกลับเข้า transaction นี้ได้
        saveLastSessionId(sessionId);
        
        // Note: state จะเปลี่ยนเป็น "Charging" เมื่อได้ chargingStarted event
      } else if (response.data?.sessionId) {
        // มี session ค้างอยู่แล้ว (เช่นครั้งก่อนแอปขึ้น error แต่ตู้รับคำสั่งไปแล้ว) → พาเข้า session นั้นแทนการขึ้น error
        console.log('[App] Already has an active session → going to it:', response.data.sessionId);
        syncActiveSession({ navigate: true });
      } else {
        Alert.alert(
          'Error',
          response.message || response.error || 'Failed to start charging'
        );
        // ไม่ได้คำตอบ (timeout) ≠ ตู้ไม่รับคำสั่ง — server อาจสร้าง session ไปแล้ว → เช็คแล้วพาเข้าไปถ้ามี
        if (response.networkError) {
          syncActiveSession({ navigate: true });
        }
      }
    } catch (error) {
      console.error('[API] Start charging error:', error);
      Alert.alert('Connection Error', 'ไม่สามารถเชื่อมต่อ Server ได้');
    } finally {
      isStartingRef.current = false;
      setIsStartingCharge(false);
    }
  }, [selectedStation, user, syncActiveSession]);

  // ========== STOP CHARGING — OCPP ==========
  const handleStopCharging = useCallback(async (session: ChargingSession) => {
    // ใช้ ref เพื่อเช็คทันที (ป้องกัน double-tap)
    if (isStoppingRef.current || isWaitingUnplug) {
      console.log('[App] Stop already in progress, ignoring...');
      return;
    }
    isStoppingRef.current = true;
    setIsStoppingCharge(true);

    try {
      // เรียก API ส่ง RemoteStop ไป Charger
      const response = await apiClient.stopCharging(session.id);

      if (response.success) {
        // ยังไม่เริ่มชาร์จจริง → server ยกเลิก session ให้ (ไม่มี StopTransaction ตามมา ห้ามรอถอดสาย)
        if (response.data?.state === 'Cancelled') {
          console.log('[API] Start cancelled before charging began');
          resetAfterAbortedStart(session.id, 'Cancelled');
          return;
        }
        // AC ไม่มี chargingStopped event (ไม่มีสาย CP) → finalize เอง ไม่ต้องรอถอดสาย
        if (selectedCharger?.type === 'AC') {
          console.log('[API] AC stop — finalizing locally');
          setCurrentSession(prev => (prev ? { ...prev, state: 'Stopped', endTime: new Date() } : prev));
          setIsCharging(false);
          isStoppingRef.current = false;
          setIsStoppingCharge(false);
          setCurrentScreen('Finishing');
          return;
        }
        console.log('[API] Stop command sent, waiting for charger...');
        // DC: แสดง Modal "กรุณาถอดสาย" รอ chargingStopped จาก Socket
        setIsWaitingUnplug(true);
        isStoppingRef.current = false;
        setIsStoppingCharge(false);
      } else {
        console.warn('[API] Stop response:', response.message);
        isStoppingRef.current = false;
        setIsStoppingCharge(false);
        // เดิมเงียบ — ผู้ใช้กดหยุดแล้วไม่มีอะไรเกิดขึ้น ไม่รู้ว่าต้องกดใหม่
        Alert.alert(t('stopFailedTitle'), response.message || response.error || 'Failed to stop charging');
        // เช็คสถานะจริงกับ server (อาจหยุดไปแล้ว หรือ session ถูกปิดทางอื่น)
        syncActiveSession({ navigate: false });
      }
    } catch (error) {
      console.error('[API] Stop charging error:', error);
      Alert.alert('Error', 'Failed to stop charging');
      isStoppingRef.current = false;
      setIsStoppingCharge(false);
    }
  }, [isWaitingUnplug, selectedCharger, resetAfterAbortedStart, syncActiveSession, t]);

  const handleGoToCharging = useCallback(() => {
    if (currentSession && selectedStation && selectedCharger) {
      setCurrentScreen('Charging');
      setActiveTab('charger');
      return;
    }
    // ข้อมูลในแอปไม่ครบ (เช่นโหลดสถานีไม่สำเร็จตอนเปิดแอป) → ดึงจาก server ใหม่แล้วพาไปหน้า Charging
    syncActiveSession({ navigate: true });
  }, [currentSession, selectedStation, selectedCharger, syncActiveSession]);

  const handleFinish = useCallback(() => {
    // Leave session room
    if (currentSession?.id) {
      leaveSession(currentSession.id);
    }
    clearLastSessionId(); // ดูสรุปแล้ว → ไม่ต้องตามหา session นี้อีก

    setIsCharging(false);
    setIsWaitingUnplug(false);
    isStartingRef.current = false;
    isStoppingRef.current = false;
    setSelectedCharger(null);
    setCurrentSession(null);
    setCurrentScreen('MainTabs');
    setActiveTab('main');
  }, [currentSession]);

  const handleTabChange = useCallback((tab: TabName) => {
    setActiveTab(tab);
    
    // ถ้าอยู่หน้า StationDetail หรือ Charging แล้วกด tab อื่น → ไป MainTabs
    // ยกเว้นกด charger tab ขณะอยู่หน้า Charging → ไม่ต้องทำอะไร (อยู่หน้าเดิม)
    if (currentScreen === 'StationDetail' && tab !== 'charger') {
      setCurrentScreen('MainTabs');
    }
    // ถ้าอยู่หน้า Charging แล้วกด tab อื่น → ไป MainTabs (แต่ยังชาร์จอยู่)
    if (currentScreen === 'Charging' && tab !== 'charger') {
      setCurrentScreen('MainTabs');
    }
  }, [currentScreen]);

  const handleFaultTryAgain = useCallback(() => {
    setShowFault(false);
    // กลับไปหน้า Charging
  }, []);

  const handleContactSupport = useCallback(() => {
    setShowFault(false);
    setActiveTab('contact');
    setCurrentScreen('MainTabs');
  }, []);

  // ========== Render Screen ==========
  const renderScreen = () => {
    switch (currentScreen) {
      case 'Loading':
        return <LoadingScreen onFinish={handleLoadingFinish} />;
      
      case 'Login':
        return (
          <LoginScreen
            onNavigateToRegister={() => setCurrentScreen('Register')}
            onNavigateToForgotPassword={() => setCurrentScreen('ForgotPassword')}
            onLoginSuccess={handleLoginSuccess}
          />
        );
      
      case 'Register':
        return (
          <RegisterScreen
            onNavigateBack={() => setCurrentScreen('Login')}
            onRegisterSuccess={() => setCurrentScreen('Login')}
          />
        );
      
      case 'ForgotPassword':
        return (
          <ForgotPasswordScreen
            onNavigateBack={() => setCurrentScreen('Login')}
            onResetSuccess={() => setCurrentScreen('Login')}
          />
        );
      
      case 'StationDetail':
        return (
          <ChargerScreen
            station={selectedStation}
            onClose={() => {
              setCurrentScreen('MainTabs');
              setActiveTab('main');
            }}
            onStartCharging={handleStartCharging}
            onGoToCharging={handleGoToCharging}
            isCharging={isCharging}
            currentChargerId={selectedCharger?.id}
            currentChargerType={selectedCharger?.type}
            activeTab="charger"
            onTabChange={handleTabChange}
            isLoading={isStartingCharge}
          />
        );
      
      case 'Charging':
        if (!selectedStation || !selectedCharger || !currentSession) {
          setCurrentScreen('MainTabs');
          return null;
        }
        return (
          <ChargingScreen
            station={selectedStation}
            charger={selectedCharger}
            session={currentSession}
            onStop={handleStopCharging}
            onFault={() => triggerFault()}
            onClose={() => {
              setCurrentScreen('MainTabs');
              setActiveTab('main');
            }}
            activeTab="charger"
            onTabChange={handleTabChange}
            isLoading={isStoppingCharge}
            isPreparing={currentSession.state === 'Preparing'}
            isWaitingUnplug={isWaitingUnplug}
            onCancelStart={() => handleStopCharging(currentSession)}
            onDismissWaitingUnplug={() => setIsWaitingUnplug(false)}
          />
        );
      
      case 'Finishing':
        if (!currentSession || !selectedStation) {
          setCurrentScreen('MainTabs');
          return null;
        }
        return (
          <FinishingScreen
            session={currentSession}
            station={selectedStation}
            onFinish={handleFinish}
          />
        );
      
      case 'ChargingHistory':
        return (
          <ChargingHistoryScreen
            onClose={() => {
              setCurrentScreen('MainTabs');
              setActiveTab('profile');
            }}
          />
        );
      
      case 'MainTabs':
      default:
        return (
          <View className="flex-1">
            <View className="flex-1">
              {activeTab === 'main' && (
                <MainScreen onSelectStation={handleSelectStation} />
              )}
              {activeTab === 'charger' && (
                <ChargerScreen
                  station={selectedStation}
                  onClose={() => {
                    setActiveTab('main');
                  }}
                  onStartCharging={handleStartCharging}
                  onGoToCharging={handleGoToCharging}
                  isCharging={isCharging}
                  currentChargerId={selectedCharger?.id}
                  currentChargerType={selectedCharger?.type}
                  activeTab="charger"
                  onTabChange={handleTabChange}
                  isLoading={isStartingCharge}
                />
              )}
              {activeTab === 'contact' && <ContactScreen />}
              {activeTab === 'profile' && (
                <ProfileScreen 
                  onLogout={handleLogout}
                  onNavigateToHistory={() => setCurrentScreen('ChargingHistory')}
                />
              )}
            </View>
            
            {activeTab !== 'charger' && (
              <BottomTabs activeTab={activeTab} onTabChange={handleTabChange} />
            )}
          </View>
        );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" backgroundColor="white" />
      {renderScreen()}
      
      {/* Fault Modal */}
      <FaultScreen
        visible={showFault}
        errorCode={faultErrorCode}
        onTryAgain={handleFaultTryAgain}
        onContactSupport={handleContactSupport}
      />
    </SafeAreaView>
  );
};

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LanguageProvider>
  );
}