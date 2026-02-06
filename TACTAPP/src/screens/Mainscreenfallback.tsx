import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { Station } from '../types';

// Mock data สำหรับสถานี
const mockStations: Station[] = [
  {
    id: '1',
    name: 'TACT Station Pathum Thani',
    location: {
      address: '123/45 Sukhumvit Road, Khlong Tan Nuea, Watthana, Bangkok 10110, Thailand',
      latitude: 13.9002,
      longitude: 100.5429,
    },
    model: '30 kWh',
    status: 'Online',
    generatorFuelLevel: 80,
    chargers: [
      { id: 'c1', stationId: '1', type: 'CCS2', pricePerKwh: 7.5, status: 'Available' },
      { id: 'c2', stationId: '1', type: 'AC', pricePerKwh: 7.5, status: 'Available' },
    ],
    ownerPhone: '02 123 4455',
  },
  {
    id: '2',
    name: 'TACT Station Sai Mai',
    location: {
      address: '456 Sai Mai Road, Bangkok 10220, Thailand',
      latitude: 13.9200,
      longitude: 100.6500,
    },
    model: '30 kWh',
    status: 'Online',
    generatorFuelLevel: 60,
    chargers: [
      { id: 'c3', stationId: '2', type: 'CCS2', pricePerKwh: 7.5, status: 'Charging' },
    ],
    ownerPhone: '02 123 4456',
  },
];

interface MainScreenProps {
  onSelectStation: (station: Station) => void;
}

// Flag Component - ใช้ทั้ง dropdown และ button
const ThaiFlag = () => (
  <View className="w-6 h-4 rounded overflow-hidden border border-gray-200">
    <View className="flex-1">
      <View style={{ height: '20%', backgroundColor: '#ED1C24' }} />
      <View style={{ height: '20%', backgroundColor: '#FFFFFF' }} />
      <View style={{ height: '20%', backgroundColor: '#241D4F' }} />
      <View style={{ height: '20%', backgroundColor: '#FFFFFF' }} />
      <View style={{ height: '20%', backgroundColor: '#ED1C24' }} />
    </View>
  </View>
);

const UKFlag = () => (
  <View className="w-6 h-4 rounded overflow-hidden border border-gray-200 bg-blue-900 items-center justify-center">
    <Text style={{ fontSize: 10 }}>🇬🇧</Text>
  </View>
);

export const MainScreen: React.FC<MainScreenProps> = ({ onSelectStation }) => {
  const { language, setLanguage, t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);

  const filteredStations = mockStations.filter(station =>
    station.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRecenter = () => {
    console.log('Recenter to my location');
  };

  return (
    <View className="flex-1 bg-gray-100">
      {/* Search Bar and Language Selector */}
      <View className="absolute top-12 left-4 right-4 z-10">
        <View className="flex-row items-center bg-white rounded-lg shadow-md">
          {/* Search Input */}
          <View className="flex-1 flex-row items-center px-4 py-3">
            <TextInput
              className="flex-1 text-base"
              placeholder={t('searchStation')}
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity>
              <Ionicons name="search" size={24} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Language Dropdown Button */}
          <View className="relative">
            <TouchableOpacity
              className="flex-row items-center px-3 py-3 border-l border-gray-200"
              onPress={() => setShowLanguageDropdown(!showLanguageDropdown)}
            >
              {language === 'th' ? <ThaiFlag /> : <UKFlag />}
              <Ionicons name="chevron-down" size={16} color="#666" />
            </TouchableOpacity>

            {/* Dropdown Menu */}
            {showLanguageDropdown && (
              <View className="absolute top-14 right-0 bg-white rounded-lg shadow-lg z-20 w-32">
                <TouchableOpacity
                  className="flex-row items-center px-4 py-3"
                  onPress={() => {
                    setLanguage('th');
                    setShowLanguageDropdown(false);
                  }}
                >
                  <ThaiFlag />
                  <Text className="text-base ml-2">ไทย</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-row items-center px-4 py-3 border-t border-gray-100"
                  onPress={() => {
                    setLanguage('en');
                    setShowLanguageDropdown(false);
                  }}
                >
                  <UKFlag />
                  <Text className="text-base ml-2">English</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Search Results */}
        {searchQuery.length > 0 && (
          <View className="bg-white mt-2 rounded-lg shadow-md">
            {filteredStations.length > 0 ? (
              filteredStations.map(station => (
                <TouchableOpacity
                  key={station.id}
                  className="px-4 py-3 border-b border-gray-100"
                  onPress={() => {
                    setSearchQuery('');
                    onSelectStation(station);
                  }}
                >
                  <Text className="font-medium">{station.name}</Text>
                  <Text className="text-gray-500 text-sm">{station.location.address}</Text>
                </TouchableOpacity>
              ))
            ) : (
              <View className="px-4 py-3">
                <Text className="text-gray-500">No stations found</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Map Placeholder - จะถูกแทนที่ด้วย MapView จริง */}
      <View className="flex-1 bg-[#e5e3df]">
        {/* Fake map background */}
        <View className="absolute inset-0">
          <View className="absolute top-1/4 left-1/4 w-32 h-32 bg-green-200 rounded-lg opacity-50" />
          <View className="absolute top-1/2 right-1/4 w-24 h-40 bg-green-100 rounded-lg opacity-50" />
          <View className="absolute bottom-1/3 left-1/3 w-40 h-20 bg-blue-100 rounded-lg opacity-50" />
        </View>
        
        {/* Station Markers */}
        {mockStations.map((station, index) => (
          <TouchableOpacity
            key={station.id}
            className="absolute"
            style={{
              top: `${30 + index * 20}%`,
              left: `${40 + index * 15}%`,
            }}
            onPress={() => onSelectStation(station)}
          >
            <View className="items-center">
              <View className="bg-green-500 rounded-lg p-2 shadow-lg">
                <Ionicons name="flash" size={20} color="white" />
              </View>
              <View 
                style={{
                  width: 0,
                  height: 0,
                  borderLeftWidth: 6,
                  borderRightWidth: 6,
                  borderTopWidth: 8,
                  borderLeftColor: 'transparent',
                  borderRightColor: 'transparent',
                  borderTopColor: '#22c55e',
                }}
              />
            </View>
          </TouchableOpacity>
        ))}

        {/* Map Notice */}
        <View className="absolute bottom-32 left-4 right-4">
          <View className="bg-yellow-50 p-4 rounded-lg">
            <Text className="text-yellow-700 text-center text-sm">
              📍 แตะที่หมุดเพื่อดูข้อมูลสถานี
            </Text>
            <Text className="text-yellow-600 text-center text-xs mt-1">
              (Map จริงจะแสดงเมื่อ build เป็น APK/IPA)
            </Text>
          </View>
        </View>
      </View>

      {/* Recenter Button */}
      <TouchableOpacity
        className="absolute bottom-24 right-4 bg-white w-12 h-12 rounded-full items-center justify-center shadow-lg"
        onPress={handleRecenter}
      >
        <Ionicons name="locate" size={24} color="#22c55e" />
      </TouchableOpacity>
    </View>
  );
};