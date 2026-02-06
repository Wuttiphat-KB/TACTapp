// C:\Users\Asus\Documents\TACT\tact-backend\src\config\database.ts
import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://admin:EDSTACT@212.80.215.42:27017/tact_db?authSource=admin';
    
    const conn = await mongoose.connect(mongoURI);

    console.log(`✅ MongoDB Connected Successfully`);
    console.log(`📍 Database: ${conn.connection.name}`);
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

export default connectDB;