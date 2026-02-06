import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { Header } from '../components/Header';
import { ChargingSession, Station } from '../types';

interface FinishingScreenProps {
  session: ChargingSession;
  station: Station;
  onFinish: () => void;
}

export const FinishingScreen: React.FC<FinishingScreenProps> = ({
  session,
  station,
  onFinish,
}) => {
  const { t } = useLanguage();

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View className="flex-1 bg-white">
      {/* Header with Logo */}
      <Header />

      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 items-center justify-center px-6">
          {/* Success Icon */}
          <View className="w-32 h-32 bg-green-100 rounded-full items-center justify-center mb-8">
            <Ionicons name="checkmark" size={64} color="#22c55e" />
          </View>

          <Text className="text-2xl font-bold text-gray-800 mb-8">{t('finish')}</Text>

          {/* Summary Card */}
          <View className="w-full bg-gray-50 rounded-lg p-6">
            <Text className="text-xl font-bold text-gray-800 text-center mb-4">
              {t('finishing')}
            </Text>

            {/* Summary Items */}
            <View>
              <View className="flex-row justify-between py-2 border-b border-gray-200">
                <Text className="text-gray-600">Station</Text>
                <Text className="font-semibold text-gray-800">{station.name}</Text>
              </View>

              <View className="flex-row justify-between py-2 border-b border-gray-200">
                <Text className="text-gray-600">{t('model')}</Text>
                <Text className="font-semibold text-gray-800">{station.model}</Text>
              </View>

              <View className="flex-row justify-between py-2 border-b border-gray-200">
                <Text className="text-gray-600">{t('energyAdded')}</Text>
                <Text className="font-semibold text-gray-800">
                  {session.energyCharged.toFixed(3)} kWh
                </Text>
              </View>

              <View className="flex-row justify-between py-2 border-b border-gray-200">
                <Text className="text-gray-600">{t('chargeTime')}</Text>
                <Text className="font-semibold text-gray-800">
                  {formatTime(session.chargingTime)}
                </Text>
              </View>

              <View className="flex-row justify-between py-2 border-b border-gray-200">
                <Text className="text-gray-600">{t('fuelUsed')}</Text>
                <Text className="font-semibold text-gray-800">
                  {session.fuelUsed.toFixed(1)} Liter
                </Text>
              </View>

              <View className="flex-row justify-between py-2 border-b border-gray-200">
                <Text className="text-gray-600">{t('totalPrice')}</Text>
                <Text className="font-semibold text-green-600">
                  {session.totalPrice.toFixed(0)} Baht
                </Text>
              </View>

              <View className="flex-row justify-between py-2">
                <Text className="text-gray-600">{t('carbonReduce')}</Text>
                <Text className="font-semibold text-green-600">
                  {(session.carbonReduce * 100 / (session.carbonReduce + 10)).toFixed(0)} %
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Finish Button */}
      <View className="p-4">
        <TouchableOpacity
          className="bg-green-500 rounded-lg py-4 items-center"
          onPress={onFinish}
        >
          <Text className="text-white font-semibold text-lg">{t('finish')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};