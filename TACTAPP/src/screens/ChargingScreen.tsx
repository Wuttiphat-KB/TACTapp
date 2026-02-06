// C:\Users\Asus\Documents\TACT\TACTAPP\src\screens\ChargingScreen.tsx
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
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
  isLoading?: boolean; // ← NEW: แสดง loading ขณะเรียก API stop
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
}) => {
  const { t } = useLanguage();
  
  const isDC = charger.type === 'CCS2';
  const chargerTypeLabel = isDC ? `DC - ${charger.type}` : `AC - ${charger.type}`;

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStopCharging = () => {
    if (isLoading) return; // ป้องกันกดซ้ำ

    Alert.alert(
      t('stopCharging'),
      'Are you sure you want to stop charging?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
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
              {session.soc !== null ? `${session.soc.toFixed(0)} %` : '-'}
            </Text>
            <Text className="text-gray-500">{t('soc')}</Text>
          </View>

          <View className="items-center w-1/2">
            <Text className="text-3xl font-bold text-gray-800">
              {formatTime(session.chargingTime)}
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
          className={`rounded-lg py-4 items-center ${isLoading ? 'bg-red-300' : 'bg-red-500'}`}
          onPress={handleStopCharging}
          disabled={isLoading}
        >
          {isLoading ? (
            <View className="flex-row items-center">
              <ActivityIndicator color="white" size="small" />
              <Text className="text-white font-semibold text-lg ml-2">
                Stopping...
              </Text>
            </View>
          ) : (
            <Text className="text-white font-semibold text-lg">{t('stopCharging')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <BottomTabs activeTab={activeTab} onTabChange={onTabChange} />
    </View>
  );
};