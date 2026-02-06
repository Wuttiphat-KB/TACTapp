import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { Header } from '../components/Header';

interface ContactScreenProps {
  onClose?: () => void;
}

export const ContactScreen: React.FC<ContactScreenProps> = ({ onClose }) => {
  const { t } = useLanguage();

  const contactInfo = {
    phone: '02 123 4455',
    line: '@TACT',
    email: 'TACT_Support@gmail.com',
    whatsapp: '088 888 8888',
  };

  const handleCall = () => {
    Linking.openURL(`tel:${contactInfo.phone}`);
  };

  const handleLine = () => {
    Linking.openURL(`https://line.me/R/ti/p/${contactInfo.line}`);
  };

  const handleEmail = () => {
    Linking.openURL(`mailto:${contactInfo.email}`);
  };

  const handleWhatsApp = () => {
    Linking.openURL(`https://wa.me/${contactInfo.whatsapp.replace(/\s/g, '')}`);
  };

  return (
    <View className="flex-1 bg-white">
      {/* Header with Logo */}
      <Header showClose={!!onClose} onClose={onClose} />

      {/* Content */}
      <View className="flex-1 px-6 pt-8">
        <Text className="text-2xl font-bold text-gray-800 text-center mb-8">
          {t('helpCenter')}
        </Text>

        {/* Contact Options */}
        <View>
          {/* Phone */}
          <TouchableOpacity
            className="flex-row items-center p-4 bg-gray-50 rounded-lg mb-4"
            onPress={handleCall}
          >
            <View className="w-12 h-12 bg-green-100 rounded-full items-center justify-center mr-4">
              <Ionicons name="call" size={24} color="#22c55e" />
            </View>
            <Text className="text-lg text-gray-800">{contactInfo.phone}</Text>
          </TouchableOpacity>

          {/* LINE */}
          <TouchableOpacity
            className="flex-row items-center p-4 bg-gray-50 rounded-lg mb-4"
            onPress={handleLine}
          >
            <View className="w-12 h-12 bg-green-100 rounded-full items-center justify-center mr-4">
              <Ionicons name="chatbubble-ellipses" size={24} color="#06C755" />
            </View>
            <Text className="text-lg text-gray-800">ID : {contactInfo.line}</Text>
          </TouchableOpacity>

          {/* Email */}
          <TouchableOpacity
            className="flex-row items-center p-4 bg-gray-50 rounded-lg mb-4"
            onPress={handleEmail}
          >
            <View className="w-12 h-12 bg-gray-100 rounded-full items-center justify-center mr-4">
              <Ionicons name="mail" size={24} color="#666" />
            </View>
            <Text className="text-lg text-gray-800">{contactInfo.email}</Text>
          </TouchableOpacity>

          {/* WhatsApp */}
          <TouchableOpacity
            className="flex-row items-center p-4 bg-gray-50 rounded-lg mb-4"
            onPress={handleWhatsApp}
          >
            <View className="w-12 h-12 bg-green-100 rounded-full items-center justify-center mr-4">
              <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
            </View>
            <Text className="text-lg text-gray-800">{contactInfo.whatsapp}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};