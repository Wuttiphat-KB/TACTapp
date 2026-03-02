// C:\Users\Asus\Documents\TACT\TACTAPP\App.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, SafeAreaView, StatusBar, Alert } from 'react-native';
import { LanguageProvider } from './src/contexts/LanguageContext';
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
import { apiClient } from './src/services/api';
import {
  connectSocket,
  disconnectSocket,
  joinSession,
  leaveSession,
  onMeterUpdate,
  onChargingStarted,
  onChargingStopped,
  onChargingFaulted,
  onConnectorStatus,
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

const AppContent: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  
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

  // ========== Check Active Session (หลัง login) ==========
  const checkActiveSession = useCallback(async () => {
    try {
      console.log('[App] Checking for active session...');
      const response = await apiClient.getActiveSession();
      
      if (response.success && response.data) {
        const session = response.data;
        console.log('[App] Found active session:', session._id, 'state:', session.state);
        
        // Restore session
        const restoredSession: ChargingSession = {
          id: session._id,
          chargerId: session.chargerId,
          stationId: session.stationId?._id || session.stationId,
          userId: session.userId,
          soc: session.soc || 0,
          state: session.state,
          powerKw: session.powerKw || 0,
          chargingTime: session.chargingTime || 0,
          energyCharged: session.energyCharged || 0,
          status: session.status,
          carbonReduce: session.carbonReduce || 0,
          fuelUsed: session.fuelUsed || 0,
          totalPrice: session.totalPrice || 0,
          startTime: new Date(session.startTime),
        };
        
        setCurrentSession(restoredSession);
        setIsCharging(true);
        
        // ดึงข้อมูล station
        if (session.stationId) {
          const stationId = session.stationId._id || session.stationId;
          const stationRes = await apiClient.getStationById(stationId);
          if (stationRes.success && stationRes.data) {
            setSelectedStation(stationRes.data);
            
            // หา charger ที่กำลังชาร์จ
            const charger = stationRes.data.chargers?.find(
              (c: any) => c.id === session.chargerId
            );
            if (charger) {
              setSelectedCharger(charger);
            }
          }
        }
        
        // Join session room
        joinSession(session._id);
        
        // ไปหน้า Charging
        setCurrentScreen('Charging');
        setActiveTab('charger');
        
        console.log('[App] Session restored successfully');
      } else {
        console.log('[App] No active session found');
      }
    } catch (error) {
      console.error('[App] Check active session error:', error);
    }
  }, []);

  // ========== Socket.IO Connection ==========
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      // เชื่อม Socket.IO เมื่อ login
      console.log('[Socket] Connecting for user:', user.id);
      connectSocket(user.id);
      
      // Setup event listeners (once)
      if (!socketListenersRef.current) {
        setupSocketListeners();
        socketListenersRef.current = true;
      }
      
      // เช็ค active session (เมื่อ login หรือ reopen app)
      checkActiveSession();
    } else {
      // ตัดการเชื่อมต่อเมื่อ logout
      disconnectSocket();
      socketListenersRef.current = false;
    }

    return () => {
      // Cleanup on unmount
      disconnectSocket();
    };
  }, [isAuthenticated, user?.id, checkActiveSession]);

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
          
          // Map charger to connectorId
          let chargerConnectorId = 1;
          
          // ใช้ connectorId จาก charger โดยตรง (ถ้ามี)
          if (charger.connectorId) {
            chargerConnectorId = charger.connectorId;
          }
          // ลอง pattern "connector-X"
          else {
            const match = charger.id.match(/connector-(\d+)/i);
            if (match) {
              chargerConnectorId = parseInt(match[1]);
            }
            // ถ้ามี "ccs2" → connector 2
            else if (charger.id.toLowerCase().includes('ccs2')) {
              chargerConnectorId = 2;
            }
            // ถ้าเป็น type CCS2 → connector 2
            else if (charger.type === 'CCS2') {
              chargerConnectorId = 2;
            }
            // Fallback: index + 1
            else {
              const idx = prev.chargers.findIndex(c => c.id === charger.id);
              chargerConnectorId = idx + 1;
            }
          }
          
          if (chargerConnectorId === data.connectorId) {
            console.log(`[Socket] Updating charger ${charger.id} status: ${charger.status} → ${data.status}`);
            return { ...charger, status: data.status as any };
          }
          return charger;
        });
        
        return { ...prev, chargers: updatedChargers };
      });
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
  const handleLoadingFinish = useCallback(() => {
    setCurrentScreen(isAuthenticated ? 'MainTabs' : 'Login');
  }, [isAuthenticated]);

  const handleLoginSuccess = useCallback(() => {
    setCurrentScreen('MainTabs');
  }, []);

  const handleLogout = useCallback(() => {
    // Leave session room ถ้ามี
    if (currentSession?.id) {
      leaveSession(currentSession.id);
    }
    
    disconnectSocket();
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
      
      let connectorId = 1;
      
      // ลอง pattern "connector-X" ก่อน
      const connectorMatch = charger.id.match(/connector-(\d+)/i);
      if (connectorMatch) {
        connectorId = parseInt(connectorMatch[1]);
      }
      // ถ้ามี "ccs2" ใน id → connector 2
      else if (charger.id.toLowerCase().includes('ccs2')) {
        connectorId = 2;
      }
      // ถ้าเป็น type CCS2 → connector 2
      else if (charger.type === 'CCS2') {
        connectorId = 2;
      }
      // Fallback: ใช้ index + 1
      else {
        const idx = selectedStation?.chargers.findIndex(c => c.id === charger.id) ?? 0;
        connectorId = idx + 1;
      }
      
      // Clamp to valid range 1-2
      connectorId = Math.max(1, Math.min(2, connectorId));
      
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
          state: 'Preparing',  // ← รอ chargingStarted event จาก Socket
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
        
        // Note: state จะเปลี่ยนเป็น "Charging" เมื่อได้ chargingStarted event
      } else {
        Alert.alert(
          'Error',
          response.message || response.error || 'Failed to start charging'
        );
      }
    } catch (error) {
      console.error('[API] Start charging error:', error);
      Alert.alert('Connection Error', 'ไม่สามารถเชื่อมต่อ Server ได้');
    } finally {
      isStartingRef.current = false;
      setIsStartingCharge(false);
    }
  }, [selectedStation, user]);

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
        console.log('[API] Stop command sent, waiting for charger...');
        // แสดง Modal "กรุณาถอดสาย"
        setIsWaitingUnplug(true);
        isStoppingRef.current = false;
        setIsStoppingCharge(false);
        // Note: session จะถูก update เมื่อได้ chargingStopped event จาก Socket
      } else {
        console.warn('[API] Stop response:', response.message);
        isStoppingRef.current = false;
        setIsStoppingCharge(false);
        // ยังคงรอ event จาก Socket
      }
    } catch (error) {
      console.error('[API] Stop charging error:', error);
      Alert.alert('Error', 'Failed to stop charging');
      isStoppingRef.current = false;
      setIsStoppingCharge(false);
    }
  }, [isWaitingUnplug]);

  const handleGoToCharging = useCallback(() => {
    setCurrentScreen('Charging');
    setActiveTab('charger');
  }, []);

  const handleFinish = useCallback(() => {
    // Leave session room
    if (currentSession?.id) {
      leaveSession(currentSession.id);
    }

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