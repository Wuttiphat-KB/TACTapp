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
  onCancelStart?: () => void;          // ยกเลิกระหว่างรอตู้เริ่มชาร์จ
  onDismissWaitingUnplug?: () => void; // ปิดหน้าต่าง "กรุณาถอดสาย" (กดหยุดซ้ำได้)
}

// ปกติตู้เริ่มชาร์จใน ~30–60 วิ (สั่ง generator 15 วิ + รถ handshake) → เกินนี้ให้ยกเลิกได้
const CANCEL_START_AFTER_S = 60;
// รอ StopTransaction นานเกินนี้ → ให้ปิดหน้าต่างแล้วกดหยุดซ้ำได้ (ไม่ติดอยู่ในหน้าต่าง)
const DISMISS_UNPLUG_AFTER_S = 90;

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
  onCancelStart,
  onDismissWaitingUnplug,
}) => {
  const { t, language } = useLanguage();

  // ========== นาฬิกาสำหรับหน้าต่าง Preparing / รอถอดสาย ==========
  // นับ Preparing จาก session.startTime (เปิดแอปกลับมาใหม่ก็นับต่อ ไม่เริ่ม 0)
  const [now, setNow] = useState(Date.now());
  const waitingSinceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isPreparing && !isWaitingUnplug) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [isPreparing, isWaitingUnplug]);
  useEffect(() => {
    waitingSinceRef.current = isWaitingUnplug ? Date.now() : null;
  }, [isWaitingUnplug]);
  const preparingSeconds = Math.floor((now - new Date(session.startTime).getTime()) / 1000);
  const waitingSeconds = waitingSinceRef.current ? Math.floor((now - waitingSinceRef.current) / 1000) : 0;
  const canCancelStart = !!onCancelStart && preparingSeconds >= CANCEL_START_AFTER_S;
  const canDismissUnplug = !!onDismissWaitingUnplug && waitingSeconds >= DISMISS_UNPLUG_AFTER_S;

  const handleCancelStart = () => {
    if (isLoading) return;
    Alert.alert(t('cancelStart'), t('cancelStartConfirm'), [
      { text: language === 'th' ? 'รอต่อ' : 'Keep waiting', style: 'cancel' },
      { text: t('cancelStart'), style: 'destructive', onPress: () => onCancelStart?.() },
    ]);
  };

  // ========== Smooth Timer ==========
  // นับจาก session.startTime เป็นหลัก → กลับเข้าหน้านี้ใหม่แล้วเวลาไม่รีเซ็ตเป็น 0
  // (ถ้า server ส่ง chargingTime มา (DC) จะ sync ตามค่า server เพราะเป็นตัวคิดเงิน)
  const elapsedFromStart = () =>
    Math.max(0, Math.floor((Date.now() - new Date(session.startTime).getTime()) / 1000));

  const [displayTime, setDisplayTime] = useState(() => session.chargingTime || elapsedFromStart());
  const serverDrivenRef = useRef(session.chargingTime > 0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with server time when meterUpdate arrives
  useEffect(() => {
    if (session.chargingTime > 0) {
      serverDrivenRef.current = true;
      setDisplayTime(session.chargingTime);
    }
  }, [session.chargingTime]);

  // Timer นับทุก 1 วินาที (เฉพาะตอนกำลังชาร์จ)
  useEffect(() => {
    if (session.state === 'Charging' && !isWaitingUnplug) {
      timerRef.current = setInterval(() => {
        // ยังไม่มีค่าจาก server → คิดจากนาฬิกาจริง (กัน drift และกันรีเซ็ตตอน remount)
        setDisplayTime(prev => (serverDrivenRef.current ? prev + 1 : elapsedFromStart()));
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

  // ค่า generator จริงจาก backend telemetry (null/stale → ไม่ทราบสถานะ)
  const gen = station.generator;
  const genStatus = gen && !gen.stale ? gen.status : 'Unknown';
  const genFuel = gen?.fuelLevel ?? null;
  const genStatusLabel =
    genStatus === 'Running' ? t('genRunning') : genStatus === 'Stopped' ? t('genStopped') : t('genUnknown');
  const genStatusColor =
    genStatus === 'Running' ? 'text-green-500' : genStatus === 'Stopped' ? 'text-gray-500' : 'text-red-500';

  // AC ไม่มี MeterValues ทาง OCPP → ใช้ค่าจากมิเตอร์ AC (DTSU666) แทน
  // DC ใช้ค่าจาก session ตามเดิม
  const acLive = station.acMeter && !station.acMeter.stale ? station.acMeter : null;
  // abs() กัน CT clamp กลับด้าน (มิเตอร์รายงานเป็นค่าลบ) — เต้า AC มีแต่โหลด ไม่มีการจ่ายย้อน
  const displayPowerKw = !isDC && acLive?.powerKw != null ? Math.abs(acLive.powerKw) : session.powerKw;

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
              {displayPowerKw.toFixed(1)} kW
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
          <View className="flex-row justify-between items-center">
            <Text className="text-lg font-semibold text-gray-800">{t('generator')}</Text>
            <Text className={`font-medium ${genStatusColor}`}>{genStatusLabel}</Text>
          </View>

          <View className="flex-row justify-between items-center mt-3">
            <Text className="text-gray-600">{t('fuel')}</Text>
            <Text className="font-semibold">{genFuel != null ? `${genFuel.toFixed(0)}%` : '—'}</Text>
          </View>

          {genStatus === 'Running' && gen?.frequency != null && (
            <View className="flex-row justify-between items-center mt-2">
              <Text className="text-gray-600">{t('frequency')}</Text>
              <Text className="font-semibold">{gen.frequency.toFixed(1)} Hz</Text>
            </View>
          )}
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
          className={`rounded-lg py-4 items-center ${isLoading || isWaitingUnplug ? 'bg-red-300' : 'bg-red-500'
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

            {/* ตู้ช้ากว่าปกติ → ให้ยกเลิกได้ (เดิมไม่มีทางออกจากหน้าต่างนี้เลย) */}
            {canCancelStart && (
              <View className="w-full mt-6 items-center">
                <Text className="text-gray-500 text-center text-sm mb-3">{t('preparingSlowHint')}</Text>
                <TouchableOpacity
                  className={`w-full rounded-lg py-3 items-center border ${isLoading ? 'border-red-200' : 'border-red-500'}`}
                  onPress={handleCancelStart}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#ef4444" size="small" />
                  ) : (
                    <Text className="text-red-500 font-semibold">{t('cancelStart')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
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

            {/* รอนานผิดปกติ → ปิดหน้าต่างแล้วกดหยุดซ้ำได้ (เดิมติดอยู่ในหน้าต่างนี้) */}
            {canDismissUnplug && (
              <View className="w-full mt-6 items-center">
                <Text className="text-gray-500 text-center text-sm mb-3">{t('unplugSlowHint')}</Text>
                <TouchableOpacity
                  className="w-full rounded-lg py-3 items-center border border-gray-400"
                  onPress={() => onDismissWaitingUnplug?.()}
                >
                  <Text className="text-gray-700 font-semibold">{t('closeWindow')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};