// C:\Users\Asus\Documents\TACT\tact-backend\src\models\Station.ts
import mongoose, { Document, Schema } from 'mongoose';

// Charger subdocument interface
interface ICharger {
  id: string;
  type: 'CCS2' | 'AC';
  status: 'Available' | 'Preparing' | 'Charging' | 'Finishing' | 'Faulted' | 'Offline';
  pricePerKwh: number;
  enabled: boolean;      // ← เพิ่มใหม่
  connectorId?: number;  // ← เพิ่มใหม่: OCPP connector ID (1 or 2)
}

// Station document interface
export interface IStation extends Document {
  name: string;
  visible: boolean;      // ← เพิ่มใหม่
  location: {
    address: string;
    latitude: number;
    longitude: number;
  };
  chargerModel: string;
  status: 'Online' | 'Offline';
  generatorFuelLevel: number;
  cpId?: string;                 // ← OCPP charge point id (default 'TACT30KW') สำหรับ map generator telemetry
  generator?: {                  // ← ค่า live ล่าสุดจาก DSE4620 (ผ่าน gen_telemetry.py → /api/telemetry/generator)
    status: 'Running' | 'Stopped' | 'Unknown';
    fuelLevel: number | null;
    frequency: number | null;
    rpm: number | null;
    batteryVoltage: number | null;
    coolantTemp: number | null;
    voltageL1N: number | null;
    updatedAt: Date | null;
  };
  ownerPhone: string;
  chargers: ICharger[];
  createdAt: Date;
  updatedAt: Date;
}

// Charger schema
const ChargerSchema = new Schema({
  id: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['CCS2', 'AC'],
    required: true,
  },
  status: {
    type: String,
    enum: ['Available', 'Preparing', 'Charging', 'Finishing', 'Faulted', 'Offline'],
    default: 'Available',
  },
  pricePerKwh: {
    type: Number,
    required: true,
  },
  enabled: {
    type: Boolean,
    default: true,  // ← default เปิดใช้งาน
  },
  connectorId: {
    type: Number,
    min: 1,
    max: 10,  // รองรับได้หลาย connectors
  },
});

// Station schema
const StationSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    visible: {
      type: Boolean,
      default: true,  // ← default แสดงใน map
    },
    location: {
      address: {
        type: String,
        required: true,
      },
      latitude: {
        type: Number,
        required: true,
      },
      longitude: {
        type: Number,
        required: true,
      },
    },
    chargerModel: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Online', 'Offline'],
      default: 'Online',
    },
    generatorFuelLevel: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    cpId: {
      type: String,
      default: 'TACT30KW',
    },
    // ค่า live ของ generator (เขียนโดย generatorState service). null = ยังไม่เคยได้รับค่า
    generator: {
      status: {
        type: String,
        enum: ['Running', 'Stopped', 'Unknown'],
        default: 'Unknown',
      },
      fuelLevel: { type: Number, default: null },
      frequency: { type: Number, default: null },
      rpm: { type: Number, default: null },
      batteryVoltage: { type: Number, default: null },
      coolantTemp: { type: Number, default: null },
      voltageL1N: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
    },
    ownerPhone: {
      type: String,
      default: '',
    },
    chargers: [ChargerSchema],
  },
  {
    timestamps: true,
  }
);

// Index สำหรับ query ที่เร็วขึ้น
StationSchema.index({ visible: 1 });
StationSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });

export default mongoose.model<IStation>('Station', StationSchema);