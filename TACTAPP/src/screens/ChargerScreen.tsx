// C:\Users\Asus\Documents\TACT\TACTAPP\src\screens\ChargerScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mdiEvPlugCcs2, mdiPowerPlug } from '@mdi/js';
import { useLanguage } from '../contexts/LanguageContext';
import { Header } from '../components/Header';
import { MdiIcon } from '../components/MdiIcon';
import { BottomTabs, TabName } from '../components/BottomTabs';
import { Station, Charger } from '../types';

interface ChargerScreenProps {
  station: Station | null;
  onClose: () => void;
  onStartCharging: (charger: Charger) => void;
  onGoToCharging?: () => void;
  isCharging?: boolean;
  currentChargerId?: string;
  activeTab?: TabName;
  onTabChange?: (tab: TabName) => void;
  isLoading?: boolean; // ← NEW: แสดง loading ขณะเรียก API
}

export const ChargerScreen: React.FC<ChargerScreenProps> = ({
  station,
  onClose,
  onStartCharging,
  onGoToCharging,
  isCharging = false,
  currentChargerId,
  activeTab = 'charger',
  onTabChange,
  isLoading = false,
}) => {
  const { t, language } = useLanguage();
  const [selectedCharger, setSelectedCharger] = useState<Charger | null>(null);

  if (!station) {
    return (
      <View className="flex-1 bg-white">
        <Header showClose onClose={onClose} />
        
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-500">No station selected</Text>
        </View>

        <BottomTabs activeTab={activeTab} onTabChange={onTabChange} />
      </View>
    );
  }

  const handleNavigate = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.location.latitude},${station.location.longitude}`;
    Linking.openURL(url);
  };

  const handleCall = () => {
    Linking.openURL(`tel:${station.ownerPhone}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Online':
      case 'Available':
      case 'Active':
        return 'text-green-500';
      case 'Charging':
      case 'Preparing':
        return 'text-yellow-500';
      case 'Offline':
      case 'Faulted':
      case 'Inactive':
        return 'text-red-500';
      case 'Disabled':
        return 'text-gray-400';
      default:
        return 'text-gray-500';
    }
  };

  const isMyCharging = (charger: Charger) => {
    return isCharging && currentChargerId === charger.id;
  };

  const isChargerDisabled = (charger: Charger) => {
    return charger.enabled === false || charger.status === 'Disabled';
  };

  const isChargerSelectable = (charger: Charger) => {
    if (isChargerDisabled(charger)) return false;
    if (isMyCharging(charger)) return true;
    if (charger.status === 'Preparing') return true;
    return false;
  };

  const getDisplayStatus = (charger: Charger) => {
    if (isChargerDisabled(charger)) {
      return language === 'th' ? 'ปิดให้บริการ' : 'Disabled';
    }
    if (isMyCharging(charger)) {
      return t('yourCharging');
    }
    switch (charger.status) {
      case 'Available':
        return t('available');
      case 'Preparing':
        return t('preparing');
      case 'Charging':
        return t('inUse');
      case 'Offline':
        return t('offline');
      case 'Faulted':
        return t('faulted');
      default:
        return charger.status;
    }
  };

  const getDisplayStatusColor = (charger: Charger) => {
    if (isChargerDisabled(charger)) {
      return 'text-gray-400';
    }
    if (isMyCharging(charger)) {
      return 'text-blue-500';
    }
    return getStatusColor(charger.status);
  };

  const getChargerIconPath = (type: string) => {
    return type === 'CCS2' ? mdiEvPlugCcs2 : mdiPowerPlug;
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
              <Text className={`font-medium ${getStatusColor(station.status)}`}>
                {station.status}
              </Text>
            </View>
          </View>

          <View className="flex-row items-start mt-4">
            <Text className="text-gray-600 text-sm flex-1">{station.location.address}</Text>
            <TouchableOpacity
              className="ml-2 w-10 h-10 bg-blue-50 rounded-full items-center justify-center"
              onPress={handleNavigate}
            >
              <Ionicons name="navigate" size={20} color="#3b82f6" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            className="flex-row items-center mt-3"
            onPress={handleCall}
          >
            <Ionicons name="call" size={16} color="#22c55e" />
            <Text className="text-green-600 ml-2">{station.ownerPhone}</Text>
          </TouchableOpacity>
        </View>

        <View className="h-px bg-gray-200 mx-4" />

        {/* Generator Section */}
        <View className="px-4 py-4">
          <View>
            <Text className="text-lg font-semibold text-gray-800">{t('generator')}</Text>
            <Text className={`font-medium ${getStatusColor(station.generatorFuelLevel > 20 ? 'Active' : 'Inactive')}`}>
              {station.generatorFuelLevel > 20 ? t('active') : t('inactive')}
            </Text>
          </View>
          
          <View className="flex-row justify-between items-center mt-3">
            <Text className="text-gray-600">{t('capacity')}</Text>
            <Text className="font-semibold">{remainingKwh.toFixed(0)} kWh</Text>
          </View>
        </View>

        <View className="h-px bg-gray-200 mx-4" />

        {/* Chargers List */}
        <View className="mt-4 px-4">
          {station.chargers.map((charger) => {
            const isDisabled = isChargerDisabled(charger);
            const isSelectable = isChargerSelectable(charger);
            const isSelected = selectedCharger?.id === charger.id;
            const isMyChargingCharger = isMyCharging(charger);
            
            // สีสำหรับ icon และ background
            const iconColor = isDisabled ? '#d1d5db' : isSelectable ? '#22c55e' : '#9ca3af';
            const bgColor = isDisabled ? '#f3f4f6' : isSelectable ? '#f0fdf4' : '#f3f4f6';
            const borderColor = isDisabled 
              ? 'border-gray-200' 
              : isSelected 
                ? 'border-green-500' 
                : isMyChargingCharger 
                  ? 'border-blue-500' 
                  : 'border-gray-200';
            
            return (
              <TouchableOpacity
                key={charger.id}
                className={`bg-white border-2 rounded-lg p-4 mb-3 ${borderColor}`}
                onPress={() => {
                  if (isSelectable) {
                    setSelectedCharger(charger);
                  }
                }}
                disabled={!isSelectable || isLoading}
                style={{ opacity: isDisabled ? 0.5 : isSelectable ? 1 : 0.7 }}
              >
                <View className="flex-row justify-between items-center">
                  <View>
                    <Text className={`font-semibold ${isDisabled ? 'text-gray-400' : 'text-gray-800'}`}>
                      {charger.type}
                    </Text>
                    <Text className={`text-sm ${getDisplayStatusColor(charger)}`}>
                      {getDisplayStatus(charger)}
                    </Text>
                    <Text className={`text-sm mt-1 ${isDisabled ? 'text-gray-300' : 'text-gray-500'}`}>
                      {t('pricePerKwh')} {charger.pricePerKwh.toFixed(2)} {t('bahtPerKwh')}
                    </Text>
                  </View>

                  <View 
                    style={{ 
                      width: 48, 
                      height: 48, 
                      backgroundColor: isMyChargingCharger ? '#dbeafe' : bgColor,
                      borderRadius: 24,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MdiIcon 
                      path={getChargerIconPath(charger.type)} 
                      size={28}
                      color={isMyChargingCharger ? '#3b82f6' : iconColor}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Instructions */}
        <View className="px-4 py-2">
          <Text className="text-gray-500 text-center text-sm">
            {t('plugInCable')}
          </Text>
        </View>
      </ScrollView>

      {/* Start Button */}
      <View className="p-4 border-t border-gray-100">
        {selectedCharger && isMyCharging(selectedCharger) ? (
          <TouchableOpacity
            className="rounded-lg py-4 items-center bg-blue-500"
            onPress={() => {
              if (onGoToCharging) {
                onGoToCharging();
              }
            }}
          >
            <Text className="text-white font-semibold text-lg">
              {t('viewChargingStatus')}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            className={`rounded-lg py-4 items-center ${
              selectedCharger && !isLoading ? 'bg-green-500' : 'bg-gray-300'
            }`}
            onPress={() => {
              if (selectedCharger && !isLoading) {
                onStartCharging(selectedCharger);
              }
            }}
            disabled={!selectedCharger || isLoading}
          >
            {isLoading ? (
              <View className="flex-row items-center">
                <ActivityIndicator color="white" size="small" />
                <Text className="text-white font-semibold text-lg ml-2">
                  Starting...
                </Text>
              </View>
            ) : (
              <Text className="text-white font-semibold text-lg">
                {selectedCharger ? t('tapToStart') : t('pleaseSelectCharger')}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <BottomTabs activeTab={activeTab} onTabChange={onTabChange} />
    </View>
  );
};