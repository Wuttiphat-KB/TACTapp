// C:\Users\Asus\Documents\TACT\tact-backend\src\routes\stations.ts
import { Router, Request, Response } from 'express';
import Station from '../models/Station';
import { authenticate, authorize } from '../middleware/auth';
import { getChargePoints, triggerStatusNotification, triggerAllConnectorStatus } from '../services/ocppBridge';
import { withGeneratorFreshness } from '../services/generatorState';

const router = Router();

// @route   GET /api/stations
// @desc    Get all visible stations with real-time OCPP status
// @access  Public
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    // Filter เฉพาะ visible: true (หรือไม่มี visible field = default true)
    const stations = await Station.find({
      $or: [
        { visible: true },
        { visible: { $exists: false } },  // backwards compatible
      ],
    }).sort({ name: 1 });
    
    console.log(`📍 Stations found: ${stations.length}`);

    // ===== ดึง status จาก CSMS =====
    let csmsStatus: { [connectorId: string]: string } = {};
    let isChargePointConnected = false;  // ← NEW: เช็คว่า CP connected มั้ย
    
    try {
      const chargePoints = await getChargePoints();
      const cp = chargePoints.find(c => c.id === (process.env.CSMS_CP_ID || 'TACT30KW'));
      
      if (cp) {
        isChargePointConnected = cp.connected === true;  // ← เช็คจาก CSMS
        console.log(`⚡ ChargePoint ${cp.id} connected: ${isChargePointConnected}`);
        
        if (cp.status) {
          csmsStatus = cp.status;
          console.log(`⚡ CSMS connector status:`, csmsStatus);
        }
      } else {
        console.log(`⚠️ ChargePoint not found in CSMS`);
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch CSMS status:', err);
    }
    // ================================

    // Merge CSMS status (ส่ง chargers ทั้งหมด รวม enabled=false)
    const stationsWithStatus = stations.map(station => {
      const stationObj = station.toObject();
      
      // ===== อัพเดท Station status จาก CSMS =====
      // ถ้า CSMS บอกว่า connected → Online, ไม่งั้น → Offline
      stationObj.status = isChargePointConnected ? 'Online' : 'Offline';
      // ============================================
      
      // อัพเดท chargers status จาก CSMS (ไม่ filter enabled ออก)
      const updatedChargers = stationObj.chargers.map((charger: any) => {
        // ถ้า enabled = false → ไม่ต้องดึง status จาก CSMS
        const isEnabled = charger.enabled !== false;  // default true
        
        if (!isEnabled) {
          return {
            ...charger,
            enabled: false,
            status: 'Disabled',  // แสดงเป็น Disabled ใน App
          };
        }
        
        // ถ้า ChargePoint ไม่ connected → charger ก็ Offline ด้วย
        if (!isChargePointConnected) {
          return {
            ...charger,
            enabled: true,
            status: 'Offline',
          };
        }
        
        // ใช้ connectorId จาก charger โดยตรง (ถ้ามี)
        let connectorId: string | null = null;
        
        if (charger.connectorId) {
          connectorId = charger.connectorId.toString();
        } else {
          // Fallback: หา connector id จาก charger.id (เช่น "connector-1" → "1")
          const connectorIdMatch = charger.id.match(/connector-(\d+)/i);
          if (connectorIdMatch) {
            connectorId = connectorIdMatch[1];
          }
        }
        
        // ถ้ามี CSMS status → ใช้ CSMS
        // ถ้าไม่มี → default เป็น Available (ไม่ trust MongoDB)
        if (connectorId && csmsStatus[connectorId]) {
          return {
            ...charger,
            enabled: true,
            status: csmsStatus[connectorId],
          };
        } else if (Object.keys(csmsStatus).length > 0) {
          // CSMS connected แต่ไม่มี status ของ connector นี้ → default Available
          return {
            ...charger,
            enabled: true,
            status: 'Available',
          };
        }
        
        // ถ้า CSMS ไม่ตอบเลย → ใช้ค่าจาก MongoDB (fallback)
        return {
          ...charger,
          enabled: true,
        };
      });
      
      stationObj.chargers = updatedChargers;
      // ผสมค่า generator ที่สดที่สุด + คิด staleness (deployment นี้มี gen ตัวเดียว)
      return withGeneratorFreshness(stationObj);
    });

    res.json({
      success: true,
      count: stationsWithStatus.length,
      data: stationsWithStatus,
    });
  } catch (error) {
    console.error('Get stations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   GET /api/stations/:id
// @desc    Get single station with real-time OCPP status
// @access  Public
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const station = await Station.findById(req.params.id);

    if (!station) {
      res.status(404).json({
        success: false,
        message: 'Station not found',
      });
      return;
    }

    const stationObj = station.toObject();

    // ===== ดึง status จาก CSMS =====
    let csmsStatus: { [connectorId: string]: string } = {};
    let isChargePointConnected = false;  // ← NEW
    
    try {
      const chargePoints = await getChargePoints();
      const cp = chargePoints.find(c => c.id === (process.env.CSMS_CP_ID || 'TACT30KW'));
      
      if (cp) {
        isChargePointConnected = cp.connected === true;
        if (cp.status) {
          csmsStatus = cp.status;
        }
      }
    } catch (err) {
      // ใช้ status จาก DB แทน
    }
    // ================================

    // ===== อัพเดท Station status =====
    stationObj.status = isChargePointConnected ? 'Online' : 'Offline';
    // ==================================

    // อัพเดท chargers status จาก CSMS (ส่งทั้งหมด รวม enabled=false)
    const updatedChargers = stationObj.chargers.map((charger: any) => {
      // ถ้า enabled = false → ไม่ต้องดึง status จาก CSMS
      const isEnabled = charger.enabled !== false;
      
      if (!isEnabled) {
        return {
          ...charger,
          enabled: false,
          status: 'Disabled',
        };
      }
      
      // ถ้า ChargePoint ไม่ connected → charger ก็ Offline
      if (!isChargePointConnected) {
        return {
          ...charger,
          enabled: true,
          status: 'Offline',
        };
      }
      
      let connectorId: string | null = null;
      
      if (charger.connectorId) {
        connectorId = charger.connectorId.toString();
      } else {
        const connectorIdMatch = charger.id.match(/connector-(\d+)/i);
        if (connectorIdMatch) {
          connectorId = connectorIdMatch[1];
        }
      }
      
      // ถ้ามี CSMS status → ใช้ CSMS
      // ถ้าไม่มี → default เป็น Available (ไม่ trust MongoDB)
      if (connectorId && csmsStatus[connectorId]) {
        return {
          ...charger,
          enabled: true,
          status: csmsStatus[connectorId],
        };
      } else if (Object.keys(csmsStatus).length > 0) {
        // CSMS connected แต่ไม่มี status ของ connector นี้ → default Available
        return {
          ...charger,
          enabled: true,
          status: 'Available',
        };
      }
      
      // ถ้า CSMS ไม่ตอบเลย → ใช้ค่าจาก MongoDB (fallback)
      return {
        ...charger,
        enabled: true,
      };
    });

    stationObj.chargers = updatedChargers;
    withGeneratorFreshness(stationObj);

    res.json({
      success: true,
      data: stationObj,
    });
  } catch (error) {
    console.error('Get station error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   GET /api/stations/admin/all
// @desc    Get ALL stations (including hidden) for admin
// @access  Private (Admin)
router.get('/admin/all', authenticate, authorize('Admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const stations = await Station.find().sort({ name: 1 });

    res.json({
      success: true,
      count: stations.length,
      data: stations,
    });
  } catch (error) {
    console.error('Get all stations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   POST /api/stations
// @desc    Create a new station
// @access  Private (Admin)
router.post('/', authenticate, authorize('Admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const station = await Station.create(req.body);

    res.status(201).json({
      success: true,
      data: station,
    });
  } catch (error) {
    console.error('Create station error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   PUT /api/stations/:id
// @desc    Update station
// @access  Private (Admin)
router.put('/:id', authenticate, authorize('Admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const station = await Station.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!station) {
      res.status(404).json({
        success: false,
        message: 'Station not found',
      });
      return;
    }

    res.json({
      success: true,
      data: station,
    });
  } catch (error) {
    console.error('Update station error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   PATCH /api/stations/:id/visibility
// @desc    Toggle station visibility
// @access  Private (Admin)
router.patch('/:id/visibility', authenticate, authorize('Admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { visible } = req.body;
    
    const station = await Station.findByIdAndUpdate(
      req.params.id,
      { visible: visible },
      { new: true }
    );

    if (!station) {
      res.status(404).json({
        success: false,
        message: 'Station not found',
      });
      return;
    }

    res.json({
      success: true,
      message: `Station ${visible ? 'shown' : 'hidden'} successfully`,
      data: station,
    });
  } catch (error) {
    console.error('Toggle visibility error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   PATCH /api/stations/:id/chargers/:chargerId/toggle
// @desc    Toggle charger enabled/disabled
// @access  Private (Admin)
router.patch('/:id/chargers/:chargerId/toggle', authenticate, authorize('Admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { enabled } = req.body;
    
    const station = await Station.findOneAndUpdate(
      { _id: req.params.id, 'chargers.id': req.params.chargerId },
      { $set: { 'chargers.$.enabled': enabled } },
      { new: true }
    );

    if (!station) {
      res.status(404).json({
        success: false,
        message: 'Station or charger not found',
      });
      return;
    }

    res.json({
      success: true,
      message: `Charger ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: station,
    });
  } catch (error) {
    console.error('Toggle charger error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   DELETE /api/stations/:id
// @desc    Delete station
// @access  Private (Admin)
router.delete('/:id', authenticate, authorize('Admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const station = await Station.findByIdAndDelete(req.params.id);

    if (!station) {
      res.status(404).json({
        success: false,
        message: 'Station not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Station deleted',
    });
  } catch (error) {
    console.error('Delete station error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   POST /api/stations/trigger-status
// @desc    Trigger StatusNotification from all connectors
// @access  Public (for app refresh)
router.post('/trigger-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { connectorId } = req.body;
    
    if (connectorId) {
      // Trigger specific connector
      const result = await triggerStatusNotification(connectorId);
      res.json({
        success: result.success,
        message: `Triggered StatusNotification for connector ${connectorId}`,
        data: result,
      });
    } else {
      // Trigger all connectors
      await triggerAllConnectorStatus();
      res.json({
        success: true,
        message: 'Triggered StatusNotification for all connectors',
      });
    }
  } catch (error) {
    console.error('Trigger status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   POST /api/stations/refresh
// @desc    Trigger status refresh and return updated stations
// @access  Public
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Trigger StatusNotification
    await triggerAllConnectorStatus();
    
    // 2. รอ 1 วินาทีให้ CSMS ได้รับ StatusNotification
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 3. ดึง stations พร้อม status ใหม่
    const stations = await Station.find({
      $or: [
        { visible: true },
        { visible: { $exists: false } },
      ],
    }).sort({ name: 1 });

    // ดึง status จาก CSMS
    let csmsStatus: { [connectorId: string]: string } = {};
    let isChargePointConnected = false;
    
    try {
      const chargePoints = await getChargePoints();
      const cp = chargePoints.find(c => c.id === (process.env.CSMS_CP_ID || 'TACT30KW'));
      if (cp) {
        isChargePointConnected = cp.connected === true;
        if (cp.status) {
          csmsStatus = cp.status;
        }
      }
    } catch (err) {
      // fallback
    }

    // Merge status (ส่งทั้งหมด รวม enabled=false)
    const stationsWithStatus = stations.map(station => {
      const stationObj = station.toObject();
      
      // อัพเดท Station status
      stationObj.status = isChargePointConnected ? 'Online' : 'Offline';
      
      const updatedChargers = stationObj.chargers.map((charger: any) => {
        const isEnabled = charger.enabled !== false;
        
        if (!isEnabled) {
          return {
            ...charger,
            enabled: false,
            status: 'Disabled',
          };
        }
        
        if (!isChargePointConnected) {
          return {
            ...charger,
            enabled: true,
            status: 'Offline',
          };
        }
        
        let connectorId: string | null = null;
        
        if (charger.connectorId) {
          connectorId = charger.connectorId.toString();
        }
        
        if (connectorId && csmsStatus[connectorId]) {
          return { ...charger, enabled: true, status: csmsStatus[connectorId] };
        } else if (Object.keys(csmsStatus).length > 0) {
          return { ...charger, enabled: true, status: 'Available' };
        }
        return { ...charger, enabled: true };
      });
      
      stationObj.chargers = updatedChargers;
      return stationObj;
    });

    res.json({
      success: true,
      message: 'Status refreshed',
      count: stationsWithStatus.length,
      data: stationsWithStatus,
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

export default router;