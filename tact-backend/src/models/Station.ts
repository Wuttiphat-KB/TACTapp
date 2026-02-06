import mongoose, { Document, Schema } from 'mongoose';

// Interface สำหรับ Charger (หัวชาร์จ)
export interface ICharger {
  id: string;
  type: 'CCS2' | 'AC';
  status: 'Available' | 'Preparing' | 'Charging' | 'Offline' | 'Faulted';
  pricePerKwh: number;
  currentUserId?: mongoose.Types.ObjectId; // user ที่กำลังใช้งานอยู่
}

// Interface สำหรับ Location
export interface ILocation {
  address: string;
  latitude: number;
  longitude: number;
}

// Interface สำหรับ Station Document
export interface IStation extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  location: ILocation;
  chargerModel: string; // เปลี่ยนจาก model เป็น chargerModel (model เป็น reserved word)
  status: 'Online' | 'Offline';
  generatorFuelLevel: number; // เปอร์เซ็นต์น้ำมัน (0-100)
  ownerPhone: string;
  chargers: ICharger[];
  createdAt: Date;
  updatedAt: Date;
}

const chargerSchema = new Schema<ICharger>(
  {
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
      enum: ['Available', 'Preparing', 'Charging', 'Offline', 'Faulted'],
      default: 'Available',
    },
    pricePerKwh: {
      type: Number,
      required: true,
      min: 0,
    },
    currentUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { _id: false }
);

const locationSchema = new Schema<ILocation>(
  {
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
  { _id: false }
);

const stationSchema = new Schema<IStation>(
  {
    name: {
      type: String,
      required: [true, 'Station name is required'],
      trim: true,
    },
    location: {
      type: locationSchema,
      required: true,
    },
    chargerModel: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Online', 'Offline'],
      default: 'Online',
    },
    generatorFuelLevel: {
      type: Number,
      min: 0,
      max: 100,
      default: 100,
    },
    ownerPhone: {
      type: String,
      required: true,
      trim: true,
    },
    chargers: {
      type: [chargerSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Index สำหรับ geospatial queries (ถ้าต้องการค้นหาสถานีใกล้เคียง)
stationSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });

const Station = mongoose.model<IStation>('Station', stationSchema);

export default Station;