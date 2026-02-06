// User Types
export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  phone: string;
  whatsapp?: string;
  line?: string;
  role: 'Admin' | 'User';
  rememberMe: boolean;
}

// Station Types
export interface Station {
  id: string;
  name: string;
  location: {
    address: string;
    latitude: number;
    longitude: number;
  };
  model: string;
  status: 'Online' | 'Offline';
  generatorFuelLevel: number; // ปริมาณน้ำมันในเครื่อง Generator
  chargers: Charger[];
  ownerPhone: string;
}

// Charger Types
export interface Charger {
  id: string;
  stationId: string;
  type: 'CCS2' | 'AC';
  pricePerKwh: number; // บาท/kWh
  status: 'Available' | 'Preparing' | 'Charging' | 'Finishing' | 'Faulted' | 'Offline';
}

// Real-time Charging Data
export interface ChargingSession {
  id: string;
  chargerId: string;
  stationId: string;
  userId: string;
  soc: number | null; // เฉพาะ DC, AC ไม่แสดง SOC
  state: 'Charging' | 'Stopped' | 'Completed' | 'Faulted';
  powerKw: number; // Power ที่จ่ายอยู่
  chargingTime: number; // เวลาที่ชาร์จไป (seconds)
  energyCharged: number; // kWh สะสม
  status: 'Active' | 'Inactive';
  carbonReduce: number;
  fuelUsed: number; // ปริมาณน้ำมันที่ใช้
  totalPrice: number;
  startTime: Date;
  endTime?: Date;
}

// Error Types
export interface ChargerError {
  code: string;
  message: string;
  timestamp: Date;
}

// Generator Types
export interface Generator {
  status: 'Active' | 'Inactive';
  fuelCapacity: number; // ความจุถังน้ำมัน
  currentFuel: number; // น้ำมันคงเหลือ
  remainingKwh: number; // ปั่นได้อีกกี่ kWh
}

// Language Types
export type Language = 'th' | 'en';

// Navigation Types
export type RootStackParamList = {
  Loading: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  MainTabs: undefined;
  StationDetail: { stationId: string };
  Charging: { sessionId: string };
  Finishing: { sessionId: string };
};

export type BottomTabParamList = {
  Main: undefined;
  Charger: undefined;
  Contact: undefined;
  Profile: undefined;
};