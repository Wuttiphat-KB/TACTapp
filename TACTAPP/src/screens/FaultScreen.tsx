import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';

// Error code descriptions
const ERROR_DESCRIPTIONS: Record<string, { en: string; th: string }> = {
  ERR_001: { en: 'Communication Error', th: 'การสื่อสารขัดข้อง' },
  ERR_002: { en: 'Overcurrent Detected', th: 'กระแสไฟเกิน' },
  ERR_003: { en: 'Overvoltage Detected', th: 'แรงดันไฟเกิน' },
  ERR_004: { en: 'Ground Fault', th: 'ไฟรั่วลงดิน' },
  ERR_005: { en: 'Emergency Stop Activated', th: 'หยุดฉุกเฉิน' },
  ERR_006: { en: 'Connector Lock Failure', th: 'ล็อคหัวชาร์จล้มเหลว' },
  ERR_007: { en: 'Temperature Error', th: 'อุณหภูมิผิดปกติ' },
  ERR_008: { en: 'Internal Error', th: 'ข้อผิดพลาดภายใน' },
};

interface FaultScreenProps {
  visible: boolean;
  errorCode?: string;
  onTryAgain: () => void;
  onContactSupport: () => void;
}

export const FaultScreen: React.FC<FaultScreenProps> = ({
  visible,
  errorCode,
  onTryAgain,
  onContactSupport,
}) => {
  const { t, language } = useLanguage();

  const errorDescription = errorCode 
    ? ERROR_DESCRIPTIONS[errorCode]?.[language] || 'Unknown Error'
    : '';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
    >
      <View className="flex-1 bg-black/50 items-center justify-center px-6">
        <View className="bg-white rounded-2xl p-6 w-full max-w-sm">
          {/* Fault Label */}
          <View className="bg-red-500 rounded-lg py-2 px-6 self-center mb-4">
            <Text className="text-white font-bold text-lg">{t('fault')}</Text>
          </View>

          {/* Error Icon */}
          <View className="items-center mb-4">
            <View className="w-16 h-16 bg-red-100 rounded-full items-center justify-center">
              <Ionicons name="alert-circle" size={40} color="#ef4444" />
            </View>
          </View>

          {/* Error Code & Description */}
          {errorCode && (
            <View className="mb-6">
              <Text className="text-gray-800 text-center font-semibold text-lg">
                {errorCode}
              </Text>
              <Text className="text-gray-500 text-center mt-1">
                {errorDescription}
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View>
            <TouchableOpacity
              className="bg-green-500 rounded-lg py-4 items-center mb-3"
              onPress={onTryAgain}
            >
              <Text className="text-white font-semibold text-base">{t('tryAgain')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="bg-yellow-500 rounded-lg py-4 items-center"
              onPress={onContactSupport}
            >
              <Text className="text-white font-semibold text-base">{t('contactSupport')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};