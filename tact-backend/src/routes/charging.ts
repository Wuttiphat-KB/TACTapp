// C:\Users\Asus\Documents\TACT\tact-backend\src\routes\charging.ts
import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import ChargingSession from '../models/ChargingSession';
import Station from '../models/Station';
import { authenticate } from '../middleware/auth';
import { 
  addRfidCard, 
  remoteStart, 
  remoteStop, 
  generateIdTag,
  getConnectorStatus 
} from '../services/ocppBridge';
import { registerIdTagUser, unregisterIdTag } from '../services/csmsListener';

const router = Router();

// @route   POST /api/charging/start
// @desc    Start charging session (OCPP RemoteStart)
// @access  Private
router.post(
  '/start',
  authenticate,
  [
    body('stationId').notEmpty().withMessage('Station ID is required'),
    body('connectorId').optional().isInt({ min: 1, max: 2 }).withMessage('Connector ID must be 1 or 2'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('[Charging] Validation errors:', errors.array());
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { stationId, chargerId } = req.body;
      // connectorId: ใช้จาก body หรือ default เป็น 1
      let connectorId = parseInt(req.body.connectorId) || 1;
      
      // Clamp to valid range
      if (connectorId < 1) connectorId = 1;
      if (connectorId > 2) connectorId = 2;
      
      console.log(`[Charging] Start request: stationId=${stationId}, chargerId=${chargerId}, connectorId=${connectorId}`);
      
      const userId = req.user!._id.toString();

      // ตรวจสอบว่ามี active session อยู่ไหม
      const existingSession = await ChargingSession.findOne({
        userId: req.user!._id,
        status: 'Active',
        state: { $in: ['Preparing', 'Charging'] },
      });

      if (existingSession) {
        res.status(400).json({
          success: false,
          message: 'You already have an active charging session',
          data: { sessionId: existingSession._id },
        });
        return;
      }

      // หา Station
      const station = await Station.findById(stationId);
      if (!station) {
        res.status(404).json({
          success: false,
          message: 'Station not found',
        });
        return;
      }

      // หา Charger/Connector
      const charger = station.chargers.find(c => 
        c.id === chargerId || c.id === `connector-${connectorId}`
      );
      
      const pricePerKwh = charger?.pricePerKwh || 7.5;
      const chargerType = charger?.type || 'CCS2';

      // สร้าง idTag จาก userId
      const idTag = generateIdTag(userId);
      
      // ลงทะเบียน mapping idTag → userId
      registerIdTagUser(idTag, userId);

      // เพิ่ม RFID card ใน CSMS
      const rfidResult = await addRfidCard(idTag, `App user: ${req.user!.username}`);
      if (!rfidResult.success) {
        res.status(500).json({
          success: false,
          message: 'Failed to register RFID card',
          error: rfidResult.error,
        });
        return;
      }

      // สั่ง RemoteStart
      const startResult = await remoteStart(connectorId, idTag);

      if (!startResult.success || startResult.result?.status !== 'Accepted') {
        // ลบ RFID ถ้า start ไม่สำเร็จ
        unregisterIdTag(idTag);
        
        res.status(400).json({
          success: false,
          message: 'Charger rejected the start command',
          error: startResult.error || startResult.result?.status,
        });
        return;
      }

      // สร้าง ChargingSession (state: "Preparing")
      const session = await ChargingSession.create({
        userId: req.user!._id,
        stationId,
        chargerId: chargerId || `connector-${connectorId}`,
        chargerType,
        cpId: process.env.CSMS_CP_ID || 'TACT30KW',
        connectorId,
        idTag,
        state: 'Preparing',
        status: 'Active',
        pricePerKwh,
        startTime: new Date(),
      });

      // อัพเดทสถานะ charger ใน Station
      if (charger) {
        charger.status = 'Preparing';
        await station.save();
      }

      console.log(`[Charging] Session created: ${session._id}, waiting for StartTransaction...`);

      res.status(201).json({
        success: true,
        message: 'Charging command sent, waiting for charger...',
        data: {
          session: {
            _id: session._id,
            sessionId: session.sessionId,
            state: 'Preparing',
            connectorId,
            pricePerKwh,
          },
          station: {
            id: station._id,
            name: station.name,
            chargerModel: station.chargerModel,
          },
          charger: {
            id: chargerId || `connector-${connectorId}`,
            type: chargerType,
            pricePerKwh,
          },
        },
      });
    } catch (error) {
      console.error('Start charging error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  }
);

// @route   POST /api/charging/:id/stop
// @desc    Stop charging session (OCPP RemoteStop)
// @access  Private
router.post(
  '/:id/stop',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const session = await ChargingSession.findById(req.params.id);

      if (!session) {
        res.status(404).json({
          success: false,
          message: 'Session not found',
        });
        return;
      }

      // ตรวจสอบว่าเป็น session ของ user นี้
      if (session.userId.toString() !== req.user!._id.toString()) {
        res.status(403).json({
          success: false,
          message: 'Not authorized to stop this session',
        });
        return;
      }

      // ต้องมี transactionId ถึงจะ stop ได้
      if (!session.transactionId) {
        // ถ้ายัง Preparing อยู่ ให้ cancel session แทน
        if (session.state === 'Preparing') {
          session.state = 'Stopped';
          session.status = 'Inactive';
          session.endTime = new Date();
          session.errorCode = 'CANCELLED';
          await session.save();

          unregisterIdTag(session.idTag);

          res.json({
            success: true,
            message: 'Session cancelled (was still preparing)',
          });
          return;
        }

        res.status(400).json({
          success: false,
          message: 'No active transaction to stop',
        });
        return;
      }

      // สั่ง RemoteStop
      const stopResult = await remoteStop(session.transactionId);

      if (!stopResult.success || stopResult.result?.status !== 'Accepted') {
        res.status(400).json({
          success: false,
          message: 'Charger rejected the stop command',
          error: stopResult.error || stopResult.result?.status,
        });
        return;
      }

      console.log(`[Charging] Stop command sent for session ${session._id}`);

      // Note: session จะถูก update เมื่อได้รับ StopTransaction event จาก CSMS
      res.json({
        success: true,
        message: 'Stop command sent, waiting for charger...',
        data: {
          sessionId: session._id,
          state: 'Stopping',
        },
      });
    } catch (error) {
      console.error('Stop charging error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  }
);

// @route   GET /api/charging/active
// @desc    Get user's active charging session
// @access  Private
router.get('/active', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await ChargingSession.findOne({
      userId: req.user!._id,
      status: 'Active',
      state: { $in: ['Preparing', 'Charging'] },
    }).populate('stationId', 'name chargerModel location');

    if (!session) {
      res.json({
        success: true,
        data: null,
      });
      return;
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error('Get active session error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   GET /api/charging/history
// @desc    Get user's charging history
// @access  Private
router.get('/history', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const sessions = await ChargingSession.find({
      userId: req.user!._id,
      status: 'Inactive',
    })
      .sort({ endTime: -1 })
      .skip(skip)
      .limit(limit)
      .populate('stationId', 'name chargerModel');

    const total = await ChargingSession.countDocuments({
      userId: req.user!._id,
      status: 'Inactive',
    });

    res.json({
      success: true,
      data: sessions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   GET /api/charging/:id
// @desc    Get charging session by ID
// @access  Private
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await ChargingSession.findById(req.params.id)
      .populate('stationId', 'name chargerModel location');

    if (!session) {
      res.status(404).json({
        success: false,
        message: 'Session not found',
      });
      return;
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   POST /api/charging/:id/fault
// @desc    Report a fault for a charging session
// @access  Private
router.post(
  '/:id/fault',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { errorCode, errorMessage } = req.body;

      const session = await ChargingSession.findById(req.params.id);

      if (!session) {
        res.status(404).json({
          success: false,
          message: 'Session not found',
        });
        return;
      }

      session.state = 'Faulted';
      session.errorCode = errorCode || 'USER_REPORTED';
      session.errorMessage = errorMessage || 'User reported fault';
      await session.save();

      res.json({
        success: true,
        message: 'Fault reported',
        data: session,
      });
    } catch (error) {
      console.error('Report fault error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  }
);

// @route   DELETE /api/charging/cancel-all
// @desc    Cancel all active sessions for current user
// @access  Private
router.delete('/cancel-all', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const sessions = await ChargingSession.find({
      userId: req.user!._id,
      status: 'Active',
    });

    for (const session of sessions) {
      session.state = 'Stopped';
      session.status = 'Inactive';
      session.errorCode = 'CANCELLED';
      session.endTime = new Date();
      await session.save();

      unregisterIdTag(session.idTag);
    }

    res.json({
      success: true,
      message: `Cancelled ${sessions.length} session(s)`,
      data: { cancelledCount: sessions.length },
    });
  } catch (error) {
    console.error('Cancel all error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   DELETE /api/charging/admin/clear-all
// @desc    Clear ALL active sessions (Admin only - use with caution!)
// @access  Private (Admin)
router.delete('/admin/clear-all', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    // อัพเดททุก active session เป็น Inactive
    const result = await ChargingSession.updateMany(
      { status: 'Active' },
      { 
        $set: { 
          status: 'Inactive', 
          state: 'Stopped',
          errorCode: 'ADMIN_CLEARED',
          endTime: new Date(),
        } 
      }
    );

    console.log(`[Admin] Cleared ${result.modifiedCount} active sessions`);

    res.json({
      success: true,
      message: `Cleared ${result.modifiedCount} active session(s)`,
      data: { clearedCount: result.modifiedCount },
    });
  } catch (error) {
    console.error('Admin clear all error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   GET /api/charging/connector/:id/status
// @desc    Get connector status from CSMS
// @access  Public
router.get('/connector/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const connectorId = parseInt(req.params.id);
    const status = await getConnectorStatus(connectorId);

    res.json({
      success: true,
      data: {
        connectorId,
        status: status || 'Unknown',
      },
    });
  } catch (error) {
    console.error('Get connector status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

export default router;