import { Router, Request, Response } from 'express';
import ChargingSession from '../models/ChargingSession';
import Station from '../models/Station';
import { authenticate } from '../middleware/auth';

const router = Router();

// @route   POST /api/charging/start
// @desc    Start a charging session
// @access  Private
router.post('/start', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { stationId, chargerId } = req.body;
    const userId = req.user?._id;

    // Check if user already has an active session
    const existingSession = await ChargingSession.findOne({
      userId,
      status: 'Active',
      state: { $in: ['Preparing', 'Charging'] },
    });

    if (existingSession) {
      res.status(400).json({
        success: false,
        message: 'You already have an active charging session',
        data: existingSession,
      });
      return;
    }

    // Find station and charger
    const station = await Station.findById(stationId);
    
    if (!station) {
      res.status(404).json({
        success: false,
        message: 'Station not found',
      });
      return;
    }

    const charger = station.chargers.find(c => c.id === chargerId);
    
    if (!charger) {
      res.status(404).json({
        success: false,
        message: 'Charger not found',
      });
      return;
    }

    // Check charger availability
    if (charger.status !== 'Available' && charger.status !== 'Preparing') {
      res.status(400).json({
        success: false,
        message: `Charger is not available. Current status: ${charger.status}`,
      });
      return;
    }

    // Create charging session
    const session = new ChargingSession({
      userId,
      stationId,
      chargerId,
      chargerType: charger.type,
      soc: charger.type === 'CCS2' ? 45 : null, // Initial SOC for DC charger
      state: 'Charging',
      powerKw: 30, // Initial power
      chargingTime: 0,
      energyCharged: 0,
      pricePerKwh: charger.pricePerKwh,
      totalPrice: 0,
      carbonReduce: 0,
      fuelUsed: 0,
      status: 'Active',
      startTime: new Date(),
    });

    await session.save();

    // Update charger status
    charger.status = 'Charging';
    charger.currentUserId = userId;
    await station.save();

    res.status(201).json({
      success: true,
      message: 'Charging session started',
      data: {
        session,
        station: {
          id: station._id,
          name: station.name,
          chargerModel: station.chargerModel,
        },
        charger: {
          id: charger.id,
          type: charger.type,
          pricePerKwh: charger.pricePerKwh,
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
});

// @route   PUT /api/charging/:sessionId/update
// @desc    Update charging session (real-time data)
// @access  Private
router.put('/:sessionId/update', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { soc, powerKw, chargingTime, energyCharged, totalPrice, carbonReduce, fuelUsed } = req.body;

    const session = await ChargingSession.findOne({
      _id: req.params.sessionId,
      userId: req.user?._id,
      status: 'Active',
    });

    if (!session) {
      res.status(404).json({
        success: false,
        message: 'Active session not found',
      });
      return;
    }

    // Update session data
    if (soc !== undefined) session.soc = soc;
    if (powerKw !== undefined) session.powerKw = powerKw;
    if (chargingTime !== undefined) session.chargingTime = chargingTime;
    if (energyCharged !== undefined) session.energyCharged = energyCharged;
    if (totalPrice !== undefined) session.totalPrice = totalPrice;
    if (carbonReduce !== undefined) session.carbonReduce = carbonReduce;
    if (fuelUsed !== undefined) session.fuelUsed = fuelUsed;

    await session.save();

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error('Update charging error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   PUT /api/charging/:sessionId/stop
// @desc    Stop a charging session
// @access  Private
router.put('/:sessionId/stop', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await ChargingSession.findOne({
      _id: req.params.sessionId,
      userId: req.user?._id,
      status: 'Active',
    });

    if (!session) {
      res.status(404).json({
        success: false,
        message: 'Active session not found',
      });
      return;
    }

    // Update session
    const { energyCharged, totalPrice, chargingTime, carbonReduce, fuelUsed } = req.body;
    
    session.state = 'Stopped';
    session.status = 'Inactive';
    session.endTime = new Date();
    
    if (energyCharged !== undefined) session.energyCharged = energyCharged;
    if (totalPrice !== undefined) session.totalPrice = totalPrice;
    if (chargingTime !== undefined) session.chargingTime = chargingTime;
    if (carbonReduce !== undefined) session.carbonReduce = carbonReduce;
    if (fuelUsed !== undefined) session.fuelUsed = fuelUsed;

    await session.save();

    // Update charger status
    const station = await Station.findById(session.stationId);
    if (station) {
      const charger = station.chargers.find(c => c.id === session.chargerId);
      if (charger) {
        charger.status = 'Available';
        charger.currentUserId = undefined;
        await station.save();
      }
    }

    res.json({
      success: true,
      message: 'Charging session stopped',
      data: session,
    });
  } catch (error) {
    console.error('Stop charging error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   PUT /api/charging/:sessionId/fault
// @desc    Report a fault during charging
// @access  Private
router.put('/:sessionId/fault', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { errorCode, errorMessage } = req.body;

    const session = await ChargingSession.findOne({
      _id: req.params.sessionId,
      userId: req.user?._id,
    });

    if (!session) {
      res.status(404).json({
        success: false,
        message: 'Session not found',
      });
      return;
    }

    // Update session with fault
    session.state = 'Faulted';
    session.errorCode = errorCode;
    session.errorMessage = errorMessage;

    await session.save();

    // Update charger status
    const station = await Station.findById(session.stationId);
    if (station) {
      const charger = station.chargers.find(c => c.id === session.chargerId);
      if (charger) {
        charger.status = 'Faulted';
        await station.save();
      }
    }

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
});

// @route   GET /api/charging/active
// @desc    Get user's active charging session
// @access  Private
router.get('/active', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await ChargingSession.findOne({
      userId: req.user?._id,
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

// @route   DELETE /api/charging/cancel-all
// @desc    Cancel all active sessions for current user (DEV USE)
// @access  Private
router.delete('/cancel-all', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    // Find all active sessions for this user
    const activeSessions = await ChargingSession.find({
      userId,
      status: 'Active',
    });

    if (activeSessions.length === 0) {
      res.json({
        success: true,
        message: 'No active sessions to cancel',
        cancelledCount: 0,
      });
      return;
    }

    // Cancel each session and reset charger status
    for (const session of activeSessions) {
      session.state = 'Stopped';
      session.status = 'Inactive';
      session.endTime = new Date();
      session.errorCode = 'CANCELLED';
      session.errorMessage = 'Session cancelled by user';
      await session.save();

      // Reset charger status
      const station = await Station.findById(session.stationId);
      if (station) {
        const charger = station.chargers.find(c => c.id === session.chargerId);
        if (charger) {
          charger.status = 'Available';
          charger.currentUserId = undefined;
          await station.save();
        }
      }
    }

    res.json({
      success: true,
      message: `Cancelled ${activeSessions.length} active session(s)`,
      cancelledCount: activeSessions.length,
    });
  } catch (error) {
    console.error('Cancel all sessions error:', error);
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
      userId: req.user?._id,
      status: 'Inactive',
    })
      .populate('stationId', 'name chargerModel')
      .sort({ endTime: -1 })
      .skip(skip)
      .limit(limit);

    const total = await ChargingSession.countDocuments({
      userId: req.user?._id,
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

export default router;