/**
 * Data Mapper
 * แปลงข้อมูลจาก Backend (MongoDB) ให้ตรงกับ Frontend types
 */

import { Station, Charger } from '../types';

// Backend Station Response
interface BackendStation {
  _id: string;
  name: string;
  location: {
    address: string;
    latitude: number;
    longitude: number;
  };
  chargerModel: string;
  status: 'Online' | 'Offline';
  generatorFuelLevel: number;
  ownerPhone: string;
  chargers: BackendCharger[];
}

interface BackendCharger {
  id: string;
  type: 'CCS2' | 'AC';
  status: 'Available' | 'Preparing' | 'Charging' | 'Offline' | 'Faulted';
  pricePerKwh: number;
  currentUserId?: string;
}

/**
 * แปลง Backend Station → Frontend Station
 */
export const mapStation = (backend: BackendStation): Station => ({
  id: backend._id,
  name: backend.name,
  location: backend.location,
  model: backend.chargerModel,
  status: backend.status,
  generatorFuelLevel: backend.generatorFuelLevel,
  ownerPhone: backend.ownerPhone,
  chargers: backend.chargers.map(c => mapCharger(c, backend._id)),
});

/**
 * แปลง Backend Charger → Frontend Charger
 */
export const mapCharger = (backend: BackendCharger, stationId: string): Charger => ({
  id: backend.id,
  stationId,
  type: backend.type,
  pricePerKwh: backend.pricePerKwh,
  status: backend.status,
});

/**
 * แปลง array ของ Backend Stations
 */
export const mapStations = (backendStations: BackendStation[]): Station[] => {
  return backendStations.map(mapStation);
};