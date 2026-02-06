import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';

interface Charger {
  id: string;
  type: 'CCS2' | 'AC';
  status: 'Available' | 'Preparing' | 'Charging' | 'Offline' | 'Faulted';
  pricePerKwh: number;
  currentUserId?: string;
}

interface Location {
  address: string;
  latitude: number;
  longitude: number;
}

export interface Station {
  _id: string;
  name: string;
  location: Location;
  chargerModel: string;
  status: 'Online' | 'Offline';
  generatorFuelLevel: number;
  ownerPhone: string;
  chargers: Charger[];
}

export const useStations = () => {
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.getStations();

      if (response.success && response.data) {
        setStations(response.data);
      } else {
        setError(response.message || 'Failed to load stations');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  const getStationById = useCallback((id: string): Station | undefined => {
    return stations.find(station => station._id === id);
  }, [stations]);

  return {
    stations,
    isLoading,
    error,
    refetch: fetchStations,
    getStationById,
  };
};