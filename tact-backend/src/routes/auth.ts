// C:\Users\Asus\Documents\TACT\tact-backend\src\routes\auth.ts
import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import User from '../models/User';
import { generateToken, authenticate } from '../middleware/auth';

const router = Router();

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post(
  '/register',
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be 3-30 characters'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Phone number is required'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { username, email, password, phone, whatsapp, line } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { username }],
      });

      if (existingUser) {
        res.status(400).json({
          success: false,
          message: existingUser.email === email 
            ? 'Email already registered' 
            : 'Username already taken',
        });
        return;
      }

      // Create new user
      const user = new User({
        username,
        email,
        password,
        phone,
        whatsapp: whatsapp || '',
        line: line || '',
        role: 'user',
      });

      await user.save();

      // Generate token
      const token = generateToken(user);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            phone: user.phone,
            whatsapp: user.whatsapp,
            line: user.line,
            role: user.role,
          },
          token,
        },
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during registration',
      });
    }
  }
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { username, password, rememberMe } = req.body;

      // Find user (include password for comparison)
      const user = await User.findOne({
        $or: [{ username }, { email: username }],
      }).select('+password');

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Invalid credentials',
        });
        return;
      }

      // Compare password
      const isMatch = await user.comparePassword(password);
      
      if (!isMatch) {
        res.status(401).json({
          success: false,
          message: 'Invalid credentials',
        });
        return;
      }

      // Update rememberMe
      if (rememberMe !== undefined) {
        user.rememberMe = rememberMe;
        await user.save();
      }

      // Generate token
      const token = generateToken(user);

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            phone: user.phone,
            whatsapp: user.whatsapp,
            line: user.line,
            role: user.role,
          },
          token,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during login',
      });
    }
  }
);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?._id);
    
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          phone: user.phone,
          whatsapp: user.whatsapp,
          line: user.line,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put(
  '/profile',
  authenticate,
  [
    body('phone').optional().trim(),
    body('whatsapp').optional().trim(),
    body('line').optional().trim(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { phone, whatsapp, line } = req.body;

      const user = await User.findById(req.user?._id);
      
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Update fields
      if (phone) user.phone = phone;
      if (whatsapp !== undefined) user.whatsapp = whatsapp;
      if (line !== undefined) user.line = line;

      await user.save();

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            phone: user.phone,
            whatsapp: user.whatsapp,
            line: user.line,
            role: user.role,
          },
        },
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  }
);

// @route   POST /api/auth/forgot-password
// @desc    Request password reset (generates temp password)
// @access  Public
router.post(
  '/forgot-password',
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { email } = req.body;

      // Find user by email
      const user = await User.findOne({ email });

      if (!user) {
        // Don't reveal if email exists or not (security)
        res.json({
          success: true,
          message: 'If this email is registered, a reset link will be sent.',
        });
        return;
      }

      // Generate temporary password (8 characters)
      const tempPassword = crypto.randomBytes(4).toString('hex'); // e.g., "a1b2c3d4"

      // Hash and save temp password
      user.password = tempPassword; // Will be hashed by pre-save hook
      user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
      await user.save();

      // In production: Send email with temp password
      // For now (DEV): Return temp password in response
      console.log(`[DEV] Temp password for ${email}: ${tempPassword}`);

      res.json({
        success: true,
        message: 'Temporary password has been generated',
        // DEV ONLY - remove in production!
        data: {
          tempPassword,
          expiresIn: '1 hour',
          note: 'Please login with this temporary password and change it immediately.',
        },
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  }
);

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { currentPassword, newPassword } = req.body;

      // Get user with password
      const user = await User.findById(req.user?._id).select('+password');

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Verify current password
      const isMatch = await user.comparePassword(currentPassword);

      if (!isMatch) {
        res.status(400).json({
          success: false,
          message: 'Current password is incorrect',
        });
        return;
      }

      // Update password
      user.password = newPassword; // Will be hashed by pre-save hook
      user.resetPasswordExpires = undefined; // Clear any reset expiry
      await user.save();

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  }
);

export default router;