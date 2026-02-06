import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, Image } from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';

interface LoadingScreenProps {
  onFinish: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ onFinish }) => {
  const { t } = useLanguage();

  useEffect(() => {
    // Simulate loading config
    const timer = setTimeout(() => {
      onFinish();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <View className="flex-1 bg-white items-center justify-center">
      {/* TACT Logo */}
      <Image
        source={require('../../assets/images/LOGOblack.png')}
        style={{ width: 230, height: 57 }}
        resizeMode="contain"
      />

      {/* Loading indicator */}
      <ActivityIndicator size="large" color="#22c55e" className="mt-8" />
      <Text className="text-gray-500 mt-4">{t('loading')}</Text>
    </View>
  );
};