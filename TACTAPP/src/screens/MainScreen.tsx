import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useLanguage } from '../contexts/LanguageContext';
import { Station } from '../types';
import { apiClient } from '../services/api';
import { mapStations } from '../utils/mapper';

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
  const [userLocation, setUserLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<MapView>(null);

  // ===== ดึงสถานีจาก API =====
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoadingStations, setIsLoadingStations] = useState(true);
  const [stationError, setStationError] = useState<string | null>(null);

  const fetchStations = async () => {
    setIsLoadingStations(true);
    setStationError(null);

    try {
      const response = await apiClient.getStations();

      if (response.success && response.data) {
        // แปลง Backend data → Frontend types
        const mapped = mapStations(response.data);
        setStations(mapped);
      } else {
        setStationError(response.message || 'Failed to load stations');
      }
    } catch (error) {
      setStationError('Network error');
      console.error('Fetch stations error:', error);
    } finally {
      setIsLoadingStations(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, []);
  // ==============================

  // ขอ permission และดึงตำแหน่งผู้ใช้
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Location permission denied');
          return;
        }

        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      } catch (error) {
        console.log('Error getting location:', error);
      }
    })();
  }, []);

  const filteredStations = stations.filter(station =>
    station.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRecenter = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 1000);
    }
  };

  // Initial region (Bangkok)
  const initialRegion = {
    latitude: userLocation?.latitude || 13.9002,
    longitude: userLocation?.longitude || 100.5429,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
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
              <Ionicons name="chevron-down" size={16} color="#666" className="ml-1" />
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

      {/* Loading Indicator */}
      {isLoadingStations && (
        <View className="absolute top-32 left-0 right-0 z-10 items-center">
          <View className="bg-white px-4 py-2 rounded-full shadow-md flex-row items-center">
            <ActivityIndicator size="small" color="#22c55e" />
            <Text className="text-gray-600 ml-2 text-sm">Loading stations...</Text>
          </View>
        </View>
      )}

      {/* Error Message */}
      {stationError && !isLoadingStations && (
        <View className="absolute top-32 left-4 right-4 z-10">
          <TouchableOpacity
            className="bg-red-50 border border-red-200 px-4 py-3 rounded-lg flex-row items-center"
            onPress={fetchStations}
          >
            <Ionicons name="alert-circle" size={20} color="#ef4444" />
            <Text className="text-red-600 ml-2 flex-1 text-sm">{stationError}</Text>
            <Text className="text-red-500 text-sm font-medium">Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Map View */}
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        onMapReady={() => setMapReady(true)}
      >
        {/* Station Markers - จาก API */}
        {stations.map((station) => (
          <Marker
            key={station.id}
            coordinate={{
              latitude: station.location.latitude,
              longitude: station.location.longitude,
            }}
            title={station.name}
            description={station.status}
            onPress={() => onSelectStation(station)}
          >
            {/* Custom Marker - สีเปลี่ยนตามสถานะ */}
            <View className="items-center">
              <View
                className={`rounded-lg p-2 shadow-lg ${
                  station.status === 'Online' ? 'bg-green-500' : 'bg-gray-400'
                }`}
              >
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
                  borderTopColor: station.status === 'Online' ? '#22c55e' : '#9ca3af',
                }}
              />
            </View>
          </Marker>
        ))}
      </MapView>

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