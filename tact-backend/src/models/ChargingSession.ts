import mongoose, { Document, Schema } from 'mongoose';

// Interface สำหรับ ChargingSession Document
export interface IChargingSession extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  stationId: mongoose.Types.ObjectId;
  chargerId: string;
  chargerType: 'CCS2' | 'AC';
  
  // Real-time data
  soc: number | null; // State of Charge (%) - เฉพาะ DC
  state: 'Preparing' | 'Charging' | 'Stopped' | 'Completed' | 'Faulted';
  powerKw: number;
  chargingTime: number; // วินาที
  energyCharged: number; // kWh
  
  // Pricing
  pricePerKwh: number;
  totalPrice: number;
  
  // Environmental
  carbonReduce: number;
  fuelUsed: number; // ลิตร
  
  // Status
  status: 'Active' | 'Inactive';
  
  // Error
  errorCode?: string;
  errorMessage?: string;
  
  // Timestamps
  startTime: Date;
  endTime?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const chargingSessionSchema = new Schema<IChargingSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    stationId: {
      type: Schema.Types.ObjectId,
      ref: 'Station',
      required: true,
    },
    chargerId: {
      type: String,
      required: true,
    },
    chargerType: {
      type: String,
      enum: ['CCS2', 'AC'],
      required: true,
    },
    soc: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    state: {
      type: String,
      enum: ['Preparing', 'Charging', 'Stopped', 'Completed', 'Faulted'],
      default: 'Preparing',
    },
    powerKw: {
      type: Number,
      min: 0,
      default: 0,
    },
    chargingTime: {
      type: Number,
      min: 0,
      default: 0,
    },
    energyCharged: {
      type: Number,
      min: 0,
      default: 0,
    },
    pricePerKwh: {
      type: Number,
      min: 0,
      required: true,
    },
    totalPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    carbonReduce: {
      type: Number,
      min: 0,
      default: 0,
    },
    fuelUsed: {
      type: Number,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    errorCode: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index สำหรับ query ที่ใช้บ่อย
chargingSessionSchema.index({ userId: 1, status: 1 });
chargingSessionSchema.index({ stationId: 1, status: 1 });
chargingSessionSchema.index({ state: 1 });

const ChargingSession = mongoose.model<IChargingSession>(
  'ChargingSession',
  chargingSessionSchema
);

export default ChargingSession;
