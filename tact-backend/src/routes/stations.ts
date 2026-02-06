import { Router, Request, Response } from 'express';
import Station from '../models/Station';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// @route   GET /api/stations
// @desc    Get all stations
// @access  Public
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const stations = await Station.find().sort({ name: 1 });
    console.log(`📍 Stations found: ${stations.length}`);

    res.json({
      success: true,
      count: stations.length,
      data: stations,
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
// @desc    Get single station
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

    res.json({
      success: true,
      data: station,
    });
  } catch (error) {
    console.error('Get station error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   POST /api/stations
// @desc    Create a new station
// @access  Private (Admin only)
router.post(
  '/',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, location, chargerModel, ownerPhone, chargers } = req.body;

      const station = new Station({
        name,
        location,
        chargerModel,
        ownerPhone,
        chargers: chargers || [],
        status: 'Online',
        generatorFuelLevel: 100,
      });

      await station.save();

      res.status(201).json({
        success: true,
        message: 'Station created successfully',
        data: station,
      });
    } catch (error) {
      console.error('Create station error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  }
);

// @route   PUT /api/stations/:id
// @desc    Update station
// @access  Private (Admin only)
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const station = await Station.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
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
        message: 'Station updated successfully',
        data: station,
      });
    } catch (error) {
      console.error('Update station error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  }
);

// @route   PUT /api/stations/:id/charger/:chargerId/status
// @desc    Update charger status
// @access  Private
router.put(
  '/:id/charger/:chargerId/status',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, currentUserId } = req.body;

      const station = await Station.findById(req.params.id);

      if (!station) {
        res.status(404).json({
          success: false,
          message: 'Station not found',
        });
        return;
      }

      const charger = station.chargers.find(c => c.id === req.params.chargerId);

      if (!charger) {
        res.status(404).json({
          success: false,
          message: 'Charger not found',
        });
        return;
      }

      charger.status = status;
      if (currentUserId !== undefined) {
        charger.currentUserId = currentUserId;
      }

      await station.save();

      res.json({
        success: true,
        message: 'Charger status updated',
        data: station,
      });
    } catch (error) {
      console.error('Update charger status error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  }
);

// @route   DELETE /api/stations/:id
// @desc    Delete station
// @access  Private (Admin only)
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response): Promise<void> => {
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
        message: 'Station deleted successfully',
      });
    } catch (error) {
      console.error('Delete station error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  }
);

export default router;