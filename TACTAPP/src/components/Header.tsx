import React from 'react';
import { View, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface HeaderProps {
  showClose?: boolean;
  onClose?: () => void;
  showBack?: boolean;
  onBack?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  showClose = false,
  onClose,
  showBack = false,
  onBack,
}) => {
  return (
    <View className="flex-row justify-between items-center p-4 pt-12 border-b border-gray-100">
      {/* Left Button */}
      {showClose ? (
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={28} color="#333" />
        </TouchableOpacity>
      ) : showBack ? (
        <TouchableOpacity onPress={onBack}>
          <Ionicons name="arrow-back" size={28} color="#333" />
        </TouchableOpacity>
      ) : (
        <View className="w-7" />
      )}
      
      {/* TACT Logo */}
      <Image
        source={require('../../assets/images/LOGOblack.png')}
        style={{ width: 100, height: 25 }}
        resizeMode="contain"
      />
      
      <View className="w-7" />
    </View>
  );
};