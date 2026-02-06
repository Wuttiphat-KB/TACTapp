import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';

// Export TabName type
export type TabName = 'main' | 'charger' | 'contact' | 'profile';

export interface BottomTabsProps {
  activeTab: TabName;
  onTabChange?: (tab: TabName) => void;
}

export const BottomTabs: React.FC<BottomTabsProps> = ({ activeTab, onTabChange }) => {
  const { t } = useLanguage();

  const tabs: { name: TabName; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { name: 'main', icon: 'home', label: t('main') || 'Main' },
    { name: 'charger', icon: 'flash', label: t('charger') || 'Charger' },
    { name: 'contact', icon: 'call', label: t('contact') || 'Contact' },
    { name: 'profile', icon: 'person', label: t('profile') || 'Profile' },
  ];

  const handleTabPress = (tabName: TabName) => {
    if (onTabChange) {
      onTabChange(tabName);
    }
  };

  return (
    <View className="flex-row bg-white border-t border-gray-200 pb-6 pt-2">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.name;
        return (
          <TouchableOpacity
            key={tab.name}
            className="flex-1 items-center py-2"
            onPress={() => handleTabPress(tab.name)}
          >
            <Ionicons
              name={tab.icon}
              size={24}
              color={isActive ? '#22c55e' : '#9ca3af'}
            />
            <Text
              className={`text-xs mt-1 ${isActive ? 'text-green-500' : 'text-gray-400'}`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};