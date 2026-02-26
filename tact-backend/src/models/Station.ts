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