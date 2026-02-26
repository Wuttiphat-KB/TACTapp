// C:\Users\Asus\Documents\TACT\TACTAPP\src\screens\ChargingScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { Header } from '../components/Header';
import { BottomTabs, TabName } from '../components/BottomTabs';
import { Station, Charger, ChargingSession } from '../types';

interface ChargingScreenProps {
  station: Station;
  charger: Charger;
  session: ChargingSession;
  onStop: (session: ChargingSession) => void;
  onFault: () => void;
  onClose: () => void;
  activeTab?: TabName;
  onTabChange?: (tab: TabName) => void;
  isLoading?: boolean;
  isPreparing?: boolean;      // ← NEW: กำลังรอ Charger เริ่ม
  isWaitingUnplug?: boolean;  // ← NEW: กำลังรอถอดสาย
}

export const ChargingScreen: React.FC<ChargingScreenProps> = ({
  station,
  charger,
  session,
  onStop,
  onFault,
  onClose,
  activeTab = 'charger',
  onTabChange,
  isLoading = false,
  isPreparing = false,
  isWaitingUnplug = false,
}) => {
  const { t, language } = useLanguage();
  
  // ========== Smooth Timer ==========
  const [displayTime, setDisplayTime] = useState(session.chargingTime);
  const lastServerTimeRef = useRef(session.chargingTime);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with server time when meterUpdate arrives
  useEffect(() => {
    lastServerTimeRef.current = session.chargingTime;
    setDisplayTime(session.chargingTime);
  }, [session.chargingTime]);

  // Timer นับทุก 1 วินาที (เฉพาะตอนกำลังชาร์จ)
  useEffect(() => {
    if (session.state === 'Charging' && !isWaitingUnplug) {
      timerRef.current = setInterval(() => {
        setDisplayTime(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [session.state, isWaitingUnplug]);

  // ========== Helpers ==========
  const isDC = charger.type === 'CCS2';
  const chargerTypeLabel = isDC ? `DC - ${charger.type}` : `AC - ${charger.type}`;

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStopCharging = () => {
    if (isLoading || isWaitingUnplug) return;

    Alert.alert(
      t('stopCharging'),
      language === 'th' ? 'คุณต้องการหยุดชาร์จหรือไม่?' : 'Are you sure you want to stop charging?',
      [
        { text: language === 'th' ? 'ยกเลิก' : 'Cancel', style: 'cancel' },
        {
          text: language === 'th' ? 'หยุด' : 'Stop',
          style: 'destructive',
          onPress: () => {
            onStop({
              ...session,
              state: 'Stopped',
              endTime: new Date(),
            });
          },
        },
      ]
    );
  };

  const generatorCapacity = 30;
  const remainingKwh = (station.generatorFuelLevel / 100) * generatorCapacity;

  return (
    <View className="flex-1 bg-white">
      <Header showClose onClose={onClose} />

      <ScrollView className="flex-1">
        {/* Station Info Card */}
        <View className="p-4">
          <View className="flex-row">
            <View className="w-24 h-32 bg-gray-100 rounded-lg items-center justify-center mr-4">
              <Ionicons name="car" size={40} color="#22c55e" />
              <Ionicons name="flash" size={24} color="#22c55e" />
            </View>

            <View className="flex-1">
              <Text className="text-xl font-bold text-gray-800">{station.name}</Text>
              <Text className="text-gray-500">{station.model}</Text>
              <Text className="text-green-500 font-medium">{t('charging')}</Text>
              
              <View className="bg-blue-100 px-3 py-1 rounded-full self-start mt-2">
                <Text className="text-blue-600 font-medium">{chargerTypeLabel}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Real-time Stats */}
        <View className="flex-row flex-wrap justify-around px-4 py-6 mx-4">
          <View className="items-center w-1/2 mb-4">
            <Text className="text-3xl font-bold text-gray-800">
              {session.powerKw.toFixed(0)} kWh
            </Text>
            <Text className="text-gray-500">{t('power')}</Text>
          </View>

          <View className="items-center w-1/2 mb-4">
            <Text className="text-3xl font-bold text-gray-800">
              {isDC && session.soc !== null ? `${session.soc.toFixed(0)} %` : '-'}
            </Text>
            <Text className="text-gray-500">{t('soc')}</Text>
          </View>

          <View className="items-center w-1/2">
            <Text className="text-3xl font-bold text-gray-800">
              {formatTime(displayTime)}
            </Text>
            <Text className="text-gray-500">{t('chargeTime')}</Text>
          </View>

          <View className="items-center w-1/2">
            <Text className="text-3xl font-bold text-gray-800">
              {session.energyCharged.toFixed(3)} kWh
            </Text>
            <Text className="text-gray-500">{t('energyAdded')}</Text>
          </View>
        </View>

        <View className="h-px bg-gray-200 mx-4" />

        {/* Generator Section */}
        <View className="px-4 py-4">
          <View>
            <Text className="text-lg font-semibold text-gray-800">{t('generator')}</Text>
            <Text className="text-green-500 font-medium">{t('active')}</Text>
          </View>
          
          <View className="flex-row justify-between items-center mt-3">
            <Text className="text-gray-600">{t('capacity')}</Text>
            <Text className="font-semibold">{remainingKwh.toFixed(0)} kWh</Text>
          </View>
        </View>

        <View className="h-px bg-gray-200 mx-4" />

        {/* Charging Fee */}
        <View className="px-4 py-4">
          <View className="flex-row justify-between items-center">
            <Text className="text-gray-600">{t('chargingFee')} (THB)</Text>
            <Text className="text-2xl font-bold text-green-600">
              {session.totalPrice.toFixed(2)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Stop Button */}
      <View className="p-4 border-t border-gray-100">
        <TouchableOpacity
          className={`rounded-lg py-4 items-center ${
            isLoading || isWaitingUnplug ? 'bg-red-300' : 'bg-red-500'
          }`}
          onPress={handleStopCharging}
          disabled={isLoading || isWaitingUnplug}
        >
          {isLoading ? (
            <View className="flex-row items-center">
              <ActivityIndicator color="white" size="small" />
              <Text className="text-white font-semibold text-lg ml-2">
                {language === 'th' ? 'กำลังหยุด...' : 'Stopping...'}
              </Text>
            </View>
          ) : (
            <Text className="text-white font-semibold text-lg">{t('stopCharging')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <BottomTabs activeTab={activeTab} onTabChange={onTabChange} />

      {/* ========== MODAL: Preparing (กำลังเริ่มชาร์จ) ========== */}
      <Modal
        visible={isPreparing}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="bg-white rounded-2xl p-8 w-full max-w-sm items-center">
            {/* Icon */}
            <View className="w-20 h-20 bg-green-100 rounded-full items-center justify-center mb-4">
              <ActivityIndicator size="large" color="#22c55e" />
            </View>

            {/* Title */}
            <Text className="text-xl font-bold text-gray-800 text-center mb-2">
              {language === 'th' ? 'กำลังเริ่มชาร์จ...' : 'Starting Charge...'}
            </Text>

            {/* Description */}
            <Text className="text-gray-500 text-center mb-4">
              {language === 'th'
                ? 'กรุณารอสักครู่ ระบบกำลังเชื่อมต่อกับเครื่องชาร์จ'
                : 'Please wait while connecting to the charger'}
            </Text>

            {/* Animated dots */}
            <View className="flex-row items-center">
              <View className="w-2 h-2 bg-green-500 rounded-full mx-1" />
              <View className="w-2 h-2 bg-green-300 rounded-full mx-1" />
              <View className="w-2 h-2 bg-green-200 rounded-full mx-1" />
            </View>
          </View>
        </View>
      </Modal>

      {/* ========== MODAL: Waiting Unplug (กรุณาถอดสาย) ========== */}
      <Modal
        visible={isWaitingUnplug}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="bg-white rounded-2xl p-8 w-full max-w-sm items-center">
            {/* Icon */}
            <View className="w-20 h-20 bg-orange-100 rounded-full items-center justify-center mb-4">
              <Ionicons name="exit-outline" size={40} color="#f97316" />
            </View>

            {/* Title */}
            <Text className="text-xl font-bold text-gray-800 text-center mb-2">
              {language === 'th' ? 'กรุณาถอดสายชาร์จ' : 'Please Unplug Cable'}
            </Text>

            {/* Description */}
            <Text className="text-gray-500 text-center mb-4">
              {language === 'th'
                ? 'การชาร์จหยุดแล้ว กรุณาถอดสายชาร์จออกจากรถ'
                : 'Charging stopped. Please unplug the cable from your vehicle.'}
            </Text>

            {/* Loading indicator */}
            <View className="flex-row items-center">
              <ActivityIndicator size="small" color="#f97316" />
              <Text className="text-orange-500 ml-2">
                {language === 'th' ? 'รอการถอดสาย...' : 'Waiting for unplug...'}
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};