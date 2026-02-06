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

  // Random error codes for dev mode
  const ERROR_CODES = [
    'ERR_001', 'ERR_002', 'ERR_003', 'ERR_004',
    'ERR_005', 'ERR_006', 'ERR_007', 'ERR_008',
  ];

  const triggerFault = useCallback(async (code?: string) => {
    const errorCode = code || ERROR_CODES[Math.floor(Math.random() * ERROR_CODES.length)];
    setFaultErrorCode(errorCode);
    setShowFault(true);

    // ===== API: Report fault to backend =====
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
        // ไม่ block UI — fault modal แสดงปกติ
      }
    }
  }, [currentSession?.id]);

  // Ref สำหรับเก็บ charger.pricePerKwh
  const chargerPriceRef = useRef(0);
  const faultTriggeredRef = useRef(false);

  // Update price ref when charger changes
  useEffect(() => {
    if (selectedCharger) {
      chargerPriceRef.current = selectedCharger.pricePerKwh;
    }
  }, [selectedCharger]);

  // ===== DEV MODE CONFIG =====
  const DEV_MODE = true;
  const FAULT_AFTER_SECONDS = 10; // Fault หลังชาร์จไป X วินาที (0 = ปิด)
  // ===========================

  // Charging interval - รันตลอดแม้สลับ menu
  useEffect(() => {
    if (!isCharging || !currentSession) return;

    const interval = setInterval(() => {
      setCurrentSession(prev => {
        if (!prev) return prev;
        
        const newChargingTime = prev.chargingTime + 1;
        const energyAdded = (prev.powerKw / 3600);
        const newEnergyCharged = prev.energyCharged + energyAdded;
        const newSoc = prev.soc !== null ? Math.min(100, prev.soc + 0.05) : null;
        const newTotalPrice = newEnergyCharged * chargerPriceRef.current;
        const fuelUsed = newEnergyCharged * 0.3;
        const carbonReduce = newEnergyCharged * 0.5;

        // DEV MODE: Auto fault after X seconds
        if (DEV_MODE && FAULT_AFTER_SECONDS > 0 && newChargingTime === FAULT_AFTER_SECONDS && !faultTriggeredRef.current) {
          faultTriggeredRef.current = true;
          setTimeout(() => triggerFault(), 100);
        }

        return {
          ...prev,
          chargingTime: newChargingTime,
          energyCharged: newEnergyCharged,
          soc: newSoc,
          totalPrice: newTotalPrice,
          fuelUsed,
          carbonReduce,
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isCharging, currentSession?.id, triggerFault]);

  // Navigation handlers
  const handleLoadingFinish = useCallback(() => {
    setCurrentScreen(isAuthenticated ? 'MainTabs' : 'Login');
  }, [isAuthenticated]);

  const handleLoginSuccess = useCallback(() => {
    setCurrentScreen('MainTabs');
  }, []);

  const handleLogout = useCallback(() => {
    setCurrentScreen('Login');
    setActiveTab('main');
    setIsCharging(false);
    setSelectedStation(null);
    setSelectedCharger(null);
    setCurrentSession(null);
  }, []);

  const handleSelectStation = useCallback((station: Station) => {
    setSelectedStation(station);
    setCurrentScreen('StationDetail');
  }, []);

  // ===== START CHARGING — เชื่อม API =====
  const handleStartCharging = useCallback(async (charger: Charger) => {
    if (isStartingCharge) return; // ป้องกันกดซ้ำ
    setIsStartingCharge(true);

    try {
      // เรียก API สร้าง session ใน Backend
      const response = await apiClient.startCharging(
        selectedStation?.id || '',
        charger.id
      );

      if (response.success && response.data) {
        // Backend ส่งกลับมาเป็น { session, station, charger }
        const { session: backendSession } = response.data;
        const sessionId = backendSession._id || backendSession.id;
        console.log('[API] Charging started, session:', sessionId);

        setSelectedCharger(charger);
        setIsCharging(true);
        faultTriggeredRef.current = false;

        // Map backend response → frontend ChargingSession
        const isDC = charger.type === 'CCS2';
        const newSession: ChargingSession = {
          id: sessionId,
          chargerId: charger.id,
          stationId: selectedStation?.id || '',
          userId: user?.id || '',
          soc: isDC ? (backendSession.soc ?? 45) : null,
          state: 'Charging',
          powerKw: backendSession.powerKw || 30,
          chargingTime: 0,
          energyCharged: 0,
          status: 'Active',
          carbonReduce: 0,
          fuelUsed: 0,
          totalPrice: 0,
          startTime: new Date(backendSession.startTime || Date.now()),
        };

        setCurrentSession(newSession);
        setCurrentScreen('Charging');
      } else {
        // API ส่ง error กลับมา
        Alert.alert(
          'Error',
          response.message || response.error || 'Failed to start charging. Please try again.'
        );
      }
    } catch (error) {
      console.error('[API] Start charging error:', error);
      Alert.alert(
        'Connection Error',
        'ไม่สามารถเชื่อมต่อ Server ได้ กรุณาลองใหม่'
      );
    } finally {
      setIsStartingCharge(false);
    }
  }, [selectedStation, user, isStartingCharge]);

  // ===== STOP CHARGING — เชื่อม API =====
  const handleStopCharging = useCallback(async (session: ChargingSession) => {
    if (isStoppingCharge) return; // ป้องกันกดซ้ำ
    setIsStoppingCharge(true);

    try {
      // ส่งข้อมูลสรุปไป Backend
      const response = await apiClient.stopCharging(session.id, {
        energyCharged: session.energyCharged,
        totalPrice: session.totalPrice,
        chargingTime: session.chargingTime,
        carbonReduce: session.carbonReduce,
        fuelUsed: session.fuelUsed,
      });

      if (response.success) {
        console.log('[API] Charging stopped, session:', session.id);
      } else {
        console.warn('[API] Stop charging response:', response.message);
        // ยังคงไปหน้า Finishing แม้ API error — เพราะ charging หยุดแล้วฝั่ง client
      }
    } catch (error) {
      console.error('[API] Stop charging error:', error);
      // ยังคงไปหน้า Finishing — ข้อมูลอยู่ใน local session
    } finally {
      setIsStoppingCharge(false);
    }

    // ไปหน้า Finishing เสมอ (แม้ API fail)
    setCurrentSession({
      ...session,
      state: 'Stopped',
      endTime: new Date(),
    });
    setIsCharging(false);
    setCurrentScreen('Finishing');
  }, [isStoppingCharge]);

  const handleGoToCharging = useCallback(() => {
    setCurrentScreen('Charging');
    setActiveTab('charger');
  }, []);

  const handleFinish = useCallback(() => {
    setCurrentSession(null);
    setSelectedCharger(null);
    setSelectedStation(null);
    setIsCharging(false);
    setCurrentScreen('MainTabs');
    setActiveTab('main');
  }, []);

  // Tab change handler
  const handleTabChange = useCallback((tab: TabName) => {
    setActiveTab(tab);
    
    if (tab === 'charger' && isCharging) {
      setCurrentScreen('Charging');
    } else {
      setCurrentScreen('MainTabs');
    }
  }, [isCharging]);

  const handleFaultTryAgain = useCallback(() => {
    setShowFault(false);
  }, []);

  const handleContactSupport = useCallback(() => {
    setShowFault(false);
    setActiveTab('contact');
    setCurrentScreen('MainTabs');
  }, []);

  // Render current screen
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
            onRegisterSuccess={handleLoginSuccess}
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
            onClose={() => setCurrentScreen('StationDetail')}
            activeTab="charger"
            onTabChange={handleTabChange}
            isLoading={isStoppingCharge}
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