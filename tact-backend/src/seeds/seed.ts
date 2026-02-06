import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../models/User';
import Station from '../models/Station';

// Load .env from root directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

const seedData = async () => {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tact_db';
    console.log('🔗 Connecting to MongoDB...');
    
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');
    console.log(`📍 Database: ${mongoose.connection.name}`);

    // Clear existing data
    await User.deleteMany({});
    await Station.deleteMany({});
    console.log('🗑️ Cleared existing data');

    // Create admin user
    const admin = new User({
      username: 'admin',
      email: 'admin@tact.com',
      password: 'admin123',
      phone: '02-123-4455',
      role: 'admin',
    });
    await admin.save();
    console.log('👤 Created admin user');

    // Create test user
    const testUser = new User({
      username: 'testuser',
      email: 'test@tact.com',
      password: 'test123',
      phone: '081-234-5678',
      whatsapp: '081-234-5678',
      line: '@testuser',
      role: 'user',
    });
    await testUser.save();
    console.log('👤 Created test user');

    // Create stations
    const stations = [
      {
        name: 'TACT Ladprao',
        location: {
          address: '123/45 Ladprao Road, Chatuchak, Bangkok 10900, Thailand',
          latitude: 13.8167,
          longitude: 100.5619,
        },
        chargerModel: '30 kWh',
        status: 'Online',
        generatorFuelLevel: 85,
        ownerPhone: '02-123-4455',
        chargers: [
          {
            id: 'ladprao-ccs2-01',
            type: 'CCS2',
            status: 'Available',
            pricePerKwh: 7.50,
          },
          {
            id: 'ladprao-ac-01',
            type: 'AC',
            status: 'Available',
            pricePerKwh: 6.50,
          },
        ],
      },
      {
        name: 'TACT Saimai',
        location: {
          address: '789 Saimai Road, Saimai, Bangkok 10220, Thailand',
          latitude: 13.9167,
          longitude: 100.6500,
        },
        chargerModel: '30 kWh',
        status: 'Online',
        generatorFuelLevel: 60,
        ownerPhone: '02-123-4456',
        chargers: [
          {
            id: 'saimai-ccs2-01',
            type: 'CCS2',
            status: 'Charging', // มีคนใช้อยู่
            pricePerKwh: 7.50,
          },
          {
            id: 'saimai-ac-01',
            type: 'AC',
            status: 'Available',
            pricePerKwh: 6.50,
          },
        ],
      },
      {
        name: 'TACT Rangsit',
        location: {
          address: '456 Rangsit-Nakhon Nayok Road, Thanyaburi, Pathum Thani 12110, Thailand',
          latitude: 14.0364,
          longitude: 100.7278,
        },
        chargerModel: '30 kWh',
        status: 'Offline', // ออฟไลน์
        generatorFuelLevel: 20,
        ownerPhone: '02-123-4457',
        chargers: [
          {
            id: 'rangsit-ccs2-01',
            type: 'CCS2',
            status: 'Offline',
            pricePerKwh: 7.50,
          },
          {
            id: 'rangsit-ac-01',
            type: 'AC',
            status: 'Offline',
            pricePerKwh: 6.50,
          },
        ],
      },
    ];

    await Station.insertMany(stations);
    console.log(`🔌 Created ${stations.length} stations`);

    console.log(`
╔════════════════════════════════════════════╗
║         SEED DATA COMPLETED                ║
╠════════════════════════════════════════════╣
║  👤 Users: 2                               ║
║     - admin / admin123 (Admin)             ║
║     - testuser / test123 (User)            ║
║                                            ║
║  🔌 Stations: 3                            ║
║     - TACT Ladprao (Online)                ║
║     - TACT Saimai (Online)                 ║
║     - TACT Rangsit (Offline)               ║
╚════════════════════════════════════════════╝
    `);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

seedData();