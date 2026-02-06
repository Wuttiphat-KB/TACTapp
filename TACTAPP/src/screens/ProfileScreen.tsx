// C:\Users\Asus\Documents\TACT\TACTAPP\src\screens\ProfileScreen.tsx
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';

interface ProfileScreenProps {
  onLogout: () => void;
  onNavigateToHistory?: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ 
  onLogout,
  onNavigateToHistory,
}) => {
  const { t } = useLanguage();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      t('logout'),
      t('logoutConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('logout'),
          style: 'destructive',
          onPress: () => {
            logout();
            onLogout();
          },
        },
      ]
    );
  };

  const userData = user || {
    username: 'John Doe',
    email: 'john.doe@mail.com',
    phone: '02 123 4455',
    whatsapp: 'WhatsApp Username',
    line: 'ID : xxxxxxxxxx',
  };

  const profileFields = [
    { label: t('username'), value: userData.username },
    { label: t('email'), value: userData.email, isLink: true },
    { label: t('phone'), value: userData.phone },
    { label: t('whatsapp'), value: userData.whatsapp || '-' },
    { label: t('line'), value: userData.line || '-' },
  ];

  return (
    <View className="flex-1 bg-white">
      {/* Header with Logo */}
      <Header />

      <ScrollView className="flex-1">
        {/* Content */}
        <View className="px-6 pt-8">
          <Text className="text-2xl font-bold text-gray-800 mb-8">{t('profile')}</Text>

          {/* Profile Fields */}
          <View>
            {profileFields.map((field, index) => (
              <View key={index} className="mb-4">
                <Text className="text-gray-500 text-sm mb-1">{field.label}</Text>
                <View className="bg-gray-100 rounded-lg px-4 py-3">
                  <Text
                    className={`text-base ${field.isLink ? 'text-blue-500 underline' : 'text-gray-800'}`}
                  >
                    {field.value}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Menu Buttons */}
          <View className="mt-6">
            {/* Charging History Button */}
            <TouchableOpacity
              className="bg-gray-50 rounded-lg py-4 px-4 mb-3 flex-row items-center border border-gray-200"
              onPress={onNavigateToHistory}
            >
              <View className="w-10 h-10 bg-green-100 rounded-full items-center justify-center">
                <Ionicons name="time-outline" size={24} color="#22c55e" />
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-gray-800 font-semibold text-base">{t('chargingHistory')}</Text>
                <Text className="text-gray-500 text-sm">{t('viewPastSessions')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>

            {/* Change Password Button (Future) */}
            {/* <TouchableOpacity
              className="bg-gray-50 rounded-lg py-4 px-4 mb-3 flex-row items-center border border-gray-200"
              onPress={() => {}}
            >
              <View className="w-10 h-10 bg-blue-100 rounded-full items-center justify-center">
                <Ionicons name="key-outline" size={24} color="#3b82f6" />
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-gray-800 font-semibold text-base">{t('changePassword')}</Text>
                <Text className="text-gray-500 text-sm">{t('updateYourPassword')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity> */}
          </View>

          {/* Logout Button */}
          <TouchableOpacity
            className="mt-6 bg-red-50 rounded-lg py-4 items-center flex-row justify-center border border-red-100"
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={24} color="#ef4444" />
            <Text className="text-red-500 font-semibold text-base ml-2">{t('logout')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};