// C:\Users\Asus\Documents\TACT\TACTAPP\src\types\index.ts

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
  _id?: string;
  id: string;
  name: string;
  visible?: boolean;     // ← เพิ่มใหม่: ซ่อน/แสดงใน map
  location: {
    address: string;
    latitude: number;
    longitude: number;
  };
  model: string;
  chargerModel?: string;
  status: 'Online' | 'Offline';
  generatorFuelLevel: number; // (legacy) ปริมาณน้ำมัน — ใช้ generator.fuelLevel แทน
  generator?: GeneratorLive | null; // ค่า live จาก DSE4620 (ผ่าน backend telemetry)
  acMeter?: AcMeterLive | null;     // ค่า live จากมิเตอร์ AC (DTSU666) — มีเฉพาะตอน gen ทำงาน
  chargers: Charger[];
  ownerPhone: string;
}

// ค่า live ของ generator ที่ได้จาก backend (REST station หรือ socket 'generatorUpdate')
export interface GeneratorLive {
  status: 'Running' | 'Stopped' | 'Unknown';
  fuelLevel: number | null;      // %
  frequency: number | null;      // Hz
  rpm: number | null;
  batteryVoltage: number | null; // V
  coolantTemp: number | null;    // °C
  voltageL1N: number | null;     // V
  updatedAt: string;
  stale: boolean;                // true = ค่าเก่าเกิน threshold (EdgeBox/poller เงียบ)
}

// ค่า live ของมิเตอร์ AC (DTSU666) — CP.py อ่านเฉพาะตอน generator ทำงาน
// stale = true ตอน gen ดับเป็นเรื่องปกติ (ไม่ใช่ error)
export interface AcMeterLive {
  powerKw: number | null;
  energyTotal: number | null;   // kWh สะสมของมิเตอร์
  voltage: number | null;
  current: number | null;
  frequency: number | null;
  updatedAt: string;
  stale: boolean;
}

// Charger Types
export interface Charger {
  id: string;
  stationId: string;
  type: 'CCS2' | 'AC';
  pricePerKwh: number; // บาท/kWh
  status: 'Available' | 'Preparing' | 'Charging' | 'Finishing' | 'Faulted' | 'Offline' | 'Disabled';
  enabled?: boolean;     // ← เพิ่มใหม่: enable/disable หัวชาร์จ
  connectorId?: number;  // ← เพิ่มใหม่: OCPP connector ID (1 or 2)
}

// Real-time Charging Data
export interface ChargingSession {
  id: string;
  chargerId: string;
  stationId: string;
  userId: string;
  soc: number | null; // เฉพาะ DC, AC ไม่แสดง SOC
  state: 'Preparing' | 'Charging' | 'Stopped' | 'Completed' | 'Faulted'; // ← เพิ่ม Preparing
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