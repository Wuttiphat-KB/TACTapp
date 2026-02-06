// C:\Users\Asus\Documents\TACT\TACTAPP\src\screens\ChargingHistoryScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { Header } from '../components/Header';
import { apiClient } from '../services/api';

interface ChargingHistoryItem {
  _id: string;
  stationId: {
    _id: string;
    name: string;
    chargerModel: string;
  } | null;
  chargerId: string;
  chargerType: string;
  energyCharged: number;
  totalPrice: number;
  chargingTime: number;
  carbonReduce: number;
  fuelUsed: number;
  startTime: string;
  endTime: string;
  state: string;
  errorCode?: string;
}

interface ChargingHistoryScreenProps {
  onClose: () => void;
}

export const ChargingHistoryScreen: React.FC<ChargingHistoryScreenProps> = ({
  onClose,
}) => {
  const { t } = useLanguage();

  const [history, setHistory] = useState<ChargingHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (pageNum: number, refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else if (pageNum === 1) {
        setIsLoading(true);
      }

      const response = await apiClient.getChargingHistory(pageNum, 10);

      if (response.success && response.data) {
        const newData = response.data;
        
        if (refresh || pageNum === 1) {
          setHistory(newData);
        } else {
          setHistory(prev => [...prev, ...newData]);
        }

        // Check if there's more data
        if (response.pagination) {
          setHasMore(pageNum < response.pagination.pages);
        } else {
          setHasMore(newData.length === 10);
        }
        
        setError(null);
      } else {
        setError(response.message || t('loadFailed'));
      }
    } catch (err) {
      setError(t('networkError'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    fetchHistory(1);
  }, [fetchHistory]);

  const handleRefresh = () => {
    setPage(1);
    fetchHistory(1, true);
  };

  const handleLoadMore = () => {
    if (!isLoading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchHistory(nextPage);
    }
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'Completed':
      case 'Stopped':
        return 'text-green-500';
      case 'Faulted':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStateIcon = (state: string): string => {
    switch (state) {
      case 'Completed':
      case 'Stopped':
        return 'checkmark-circle';
      case 'Faulted':
        return 'alert-circle';
      default:
        return 'time';
    }
  };

  const renderItem = ({ item }: { item: ChargingHistoryItem }) => (
    <View className="bg-white mx-4 mb-3 rounded-lg p-4 shadow-sm border border-gray-100">
      {/* Header Row */}
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-gray-800">
            {item.stationId?.name || t('unknownStation')}
          </Text>
          <Text className="text-gray-500 text-sm">
            {item.stationId?.chargerModel || '-'}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Ionicons
            name={getStateIcon(item.state) as any}
            size={16}
            color={item.state === 'Faulted' ? '#ef4444' : '#22c55e'}
          />
          <Text className={`ml-1 text-sm font-medium ${getStateColor(item.state)}`}>
            {item.state === 'Stopped' ? t('completed') : item.state}
          </Text>
        </View>
      </View>

      {/* Date */}
      <View className="flex-row items-center mb-3">
        <Ionicons name="calendar-outline" size={14} color="#9ca3af" />
        <Text className="text-gray-500 text-sm ml-1">
          {formatDate(item.startTime)}
        </Text>
      </View>

      {/* Stats Grid */}
      <View className="flex-row flex-wrap">
        {/* Energy */}
        <View className="w-1/2 mb-2">
          <Text className="text-gray-500 text-xs">{t('energyCharged')}</Text>
          <Text className="text-gray-800 font-semibold">
            {item.energyCharged.toFixed(3)} kWh
          </Text>
        </View>

        {/* Duration */}
        <View className="w-1/2 mb-2">
          <Text className="text-gray-500 text-xs">{t('chargeTime')}</Text>
          <Text className="text-gray-800 font-semibold">
            {formatTime(item.chargingTime)}
          </Text>
        </View>

        {/* Price */}
        <View className="w-1/2">
          <Text className="text-gray-500 text-xs">{t('totalPrice')}</Text>
          <Text className="text-green-600 font-semibold">
            ฿{item.totalPrice.toFixed(2)}
          </Text>
        </View>

        {/* Charger Type */}
        <View className="w-1/2">
          <Text className="text-gray-500 text-xs">{t('chargerType')}</Text>
          <Text className="text-gray-800 font-semibold">
            {item.chargerType}
          </Text>
        </View>
      </View>

      {/* Error Code (if faulted) */}
      {item.errorCode && (
        <View className="mt-3 bg-red-50 rounded-lg px-3 py-2">
          <Text className="text-red-600 text-sm">
            {t('errorCode')}: {item.errorCode}
          </Text>
        </View>
      )}
    </View>
  );

  const renderEmpty = () => (
    <View className="flex-1 items-center justify-center py-20">
      <Ionicons name="battery-charging-outline" size={64} color="#d1d5db" />
      <Text className="text-gray-400 text-lg mt-4">{t('noChargingHistory')}</Text>
      <Text className="text-gray-400 text-sm mt-1">{t('startChargingToSee')}</Text>
    </View>
  );

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View className="py-4">
        <ActivityIndicator size="small" color="#22c55e" />
      </View>
    );
  };

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <Header showClose onClose={onClose} />

      {/* Title */}
      <View className="px-6 py-4 bg-white border-b border-gray-100">
        <Text className="text-2xl font-bold text-gray-800">{t('chargingHistory')}</Text>
        <Text className="text-gray-500 text-sm mt-1">{t('chargingHistoryDesc')}</Text>
      </View>

      {/* Content */}
      {isLoading && page === 1 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#22c55e" />
          <Text className="text-gray-500 mt-4">{t('loading')}</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons name="cloud-offline-outline" size={64} color="#d1d5db" />
          <Text className="text-gray-500 text-center mt-4">{error}</Text>
          <TouchableOpacity
            className="mt-4 bg-green-500 rounded-lg px-6 py-3"
            onPress={() => fetchHistory(1)}
          >
            <Text className="text-white font-semibold">{t('tryAgain')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={history}
          renderItem={renderItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ paddingVertical: 16 }}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={['#22c55e']}
              tintColor="#22c55e"
            />
          }
        />
      )}
    </View>
  );
};