// C:\Users\Asus\Documents\TACT\tact-backend\src\models\ChargingSession.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IChargingSession extends Document {
  _id: mongoose.Types.ObjectId;
  sessionId: string;
  orderId?: string;
  userId: mongoose.Types.ObjectId;
  stationId: mongoose.Types.ObjectId;
  chargerId: string;
  chargerType: 'CCS2' | 'AC';
  
  // OCPP fields
  cpId: string;              // "TACT30KW"
  connectorId: number;       // 1 or 2
  idTag: string;             // "UABC123" (OCPP idTag)
  transactionId?: number;    // จาก CSMS (ได้หลัง StartTransaction)
  meterStart?: number;       // Wh (จาก StartTransaction)
  meterStop?: number;        // Wh (จาก StopTransaction)
  
  // Charging state
  state: 'Preparing' | 'Charging' | 'Stopped' | 'Faulted';
  status: 'Active' | 'Inactive';
  
  // Real-time data
  soc: number;
  powerKw: number;
  energyCharged: number;
  chargingTime: number;
  totalPrice: number;
  carbonReduce: number;
  fuelUsed: number;
  pricePerKwh: number;
  
  // Timestamps
  startTime: Date;
  endTime?: Date;
  
  // Error handling
  errorCode?: string;
  errorMessage?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const chargingSessionSchema = new Schema<IChargingSession>(
  {
    sessionId: {
      type: String,
      unique: true,
      default: () => `CS${Date.now()}`,
    },
    orderId: {
      type: String,
    },
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
    
    // OCPP fields
    cpId: {
      type: String,
      default: 'TACT30KW',
    },
    connectorId: {
      type: Number,
      required: true,
      min: 1,
      max: 2,
    },
    idTag: {
      type: String,
      required: true,
      maxlength: 20,
    },
    transactionId: {
      type: Number,
    },
    meterStart: {
      type: Number,  // Wh
    },
    meterStop: {
      type: Number,  // Wh
    },
    
    // State
    state: {
      type: String,
      enum: ['Preparing', 'Charging', 'Stopped', 'Faulted'],
      default: 'Preparing',
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    
    // Real-time data
    soc: {
      type: Number,
      default: 0,
    },
    powerKw: {
      type: Number,
      default: 0,
    },
    energyCharged: {
      type: Number,
      default: 0,
    },
    chargingTime: {
      type: Number,
      default: 0,
    },
    totalPrice: {
      type: Number,
      default: 0,
    },
    carbonReduce: {
      type: Number,
      default: 0,
    },
    fuelUsed: {
      type: Number,
      default: 0,
    },
    pricePerKwh: {
      type: Number,
      required: true,
    },
    
    // Timestamps
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
    },
    
    // Error
    errorCode: String,
    errorMessage: String,
  },
  {
    timestamps: true,
  }
);

// Index for queries
chargingSessionSchema.index({ userId: 1, status: 1 });
chargingSessionSchema.index({ stationId: 1, state: 1 });
chargingSessionSchema.index({ transactionId: 1 });
chargingSessionSchema.index({ idTag: 1 });

const ChargingSession = mongoose.model<IChargingSession>('ChargingSession', chargingSessionSchema);

export default ChargingSession;