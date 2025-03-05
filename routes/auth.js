// import express from 'express';
// import jwt from 'jsonwebtoken';
// import bcrypt from 'bcryptjs';
// import User from '../models/User.js';
// import { sendResetEmail } from '../config/mailer.js';

// const router = express.Router();

// // Register route
// router.post('/register', async (req, res) => {
//   try {
//     const { fullName, currentAddress, emailAddress, mobileNumber, password, role } = req.body;

//     // Check if user already exists
//     const existingUser = await User.findOne({ emailAddress });
//     if (existingUser) {
//       return res.status(400).json({ message: 'User already exists' });
//     }

//     // Hash password
//     const salt = await bcrypt.genSalt(10);
//     const hashedPassword = await bcrypt.hash(password, salt);

//     // Create new user
//     const user = new User({
//       fullName,
//       currentAddress,
//       emailAddress,
//       mobileNumber,
//       password: hashedPassword,
//       role: role || 'customer'
//     });

//     await user.save();

//     // Create JWT token
//     const token = jwt.sign(
//       { userId: user._id, role: user.role },
//       process.env.JWT_SECRET,
//       { expiresIn: '24h' }
//     );

//     res.status(201).json({
//       message: 'User registered successfully',
//       user: {
//         id: user._id,
//         fullName: user.fullName,
//         emailAddress: user.emailAddress,
//         role: user.role
//       },
//       token
//     });
//   } catch (error) {
//     console.error('Registration error:', error);
//     res.status(500).json({ message: 'Server error during registration' });
//   }
// });

// // Login route
// router.post('/login', async (req, res) => {
//   try {
//     const { emailAddress, password, role } = req.body;

//     // Find user
//     const user = await User.findOne({ emailAddress });
//     if (!user) {
//       return res.status(400).json({ message: 'Invalid credentials' });
//     }

//     // Verify role
//     if (user.role !== role) {
//       return res.status(403).json({ message: 'Unauthorized role' });
//     }

//     // Check password
//     const isValidPassword = await bcrypt.compare(password, user.password);
//     if (!isValidPassword) {
//       return res.status(400).json({ message: 'Invalid credentials' });
//     }

//     // Create token
//     const token = jwt.sign(
//       { userId: user._id, role: user.role },
//       process.env.JWT_SECRET,
//       { expiresIn: '24h' }
//     );

//     res.json({
//       user: {
//         id: user._id,
//         fullName: user.fullName,
//         emailAddress: user.emailAddress,
//         role: user.role
//       },
//       token
//     });
//   } catch (error) {
//     console.error('Login error:', error);
//     res.status(500).json({ message: 'Server error during login' });
//   }
// });

// // Verify token route
// router.get('/verify-token', async (req, res) => {
//   const token = req.headers.authorization?.split(' ')[1];
  
//   if (!token) {
//     return res.status(401).json({ valid: false });
//   }

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     res.json({ valid: true, user: decoded });
//   } catch (error) {
//     res.status(401).json({ valid: false });
//   }
// });

// // Request password reset
// router.post('/forgot-password', async (req, res) => {
//   try {
//     const { emailAddress } = req.body;
//     console.log('Attempting password reset for:', emailAddress); // Debug log

//     const user = await User.findOne({ emailAddress });
//     if (!user) {
//       return res.json({ 
//         message: 'If an account exists, a reset link will be sent to the email.',
//         success: true 
//       });
//     }

//     // Generate reset token
//     const resetToken = jwt.sign(
//       { userId: user._id },
//       process.env.JWT_SECRET,
//       { expiresIn: '1h' }
//     );

//     // Save reset token to user
//     user.resetToken = resetToken;
//     user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
//     await user.save();

//     try {
//       await sendResetEmail(emailAddress, resetToken);
//       console.log('Reset email sent successfully'); // Debug log
//       res.json({ 
//         message: 'Password reset link has been sent to your email.',
//         success: true
//       });
//     } catch (emailError) {
//       console.error('Detailed email error:', emailError); // Debug log
//       user.resetToken = undefined;
//       user.resetTokenExpiry = undefined;
//       await user.save();
//       throw emailError;
//     }
//   } catch (error) {
//     console.error('Password reset request error:', error);
//     res.status(500).json({ 
//       message: 'Error processing password reset request. Please try again.',
//       error: error.message,
//       success: false
//     });
//   }
// });

// // Reset password
// router.post('/reset-password', async (req, res) => {
//   try {
//     const { resetToken, newPassword } = req.body;
//     console.log('Attempting password reset with token:', resetToken); // Debug log

//     if (!resetToken || !newPassword) {
//       return res.status(400).json({ message: 'Reset token and new password are required' });
//     }

//     // First verify the token
//     let decoded;
//     try {
//       decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
//     } catch (error) {
//       console.error('Token verification failed:', error);
//       return res.status(400).json({ message: 'Invalid or expired reset token' });
//     }

//     // Find user
//     const user = await User.findOne({
//       _id: decoded.userId,
//       resetToken: resetToken,
//       resetTokenExpiry: { $gt: Date.now() }
//     });

//     if (!user) {
//       console.log('User not found or token expired');
//       return res.status(400).json({ message: 'Invalid or expired reset token' });
//     }

//     // Hash new password
//     const salt = await bcrypt.genSalt(10);
//     const hashedPassword = await bcrypt.hash(newPassword, salt);

//     // Update user password and clear reset token
//     user.password = hashedPassword;
//     user.resetToken = undefined;
//     user.resetTokenExpiry = undefined;
//     await user.save();

//     res.json({ 
//       message: 'Password reset successful',
//       success: true 
//     });
//   } catch (error) {
//     console.error('Password reset error:', error);
//     res.status(500).json({ 
//       message: 'Error resetting password',
//       error: error.message 
//     });
//   }
// });

// export default router;


import express from 'express';
import { 
  register, 
  login, 
  verifyToken, 
  resetPassword,
  approveServiceProvider,
  getPendingServiceProviders,
  getProfile
} from '../controllers/authController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.get('/verify-token', verifyToken);
router.post('/forgot-password', async (req, res) => {
  try {
    const { emailAddress } = req.body;
    console.log('Attempting password reset for:', emailAddress);

    // Import your User model
    const User = (await import('../models/User.js')).default;
    // Import jwt
    const jwt = (await import('jsonwebtoken')).default;
    // Import your email sender
    const { sendResetEmail } = await import('../config/mailer.js');

    const user = await User.findOne({ emailAddress });
    if (!user) {
      return res.json({ 
        message: 'If an account exists, a reset link will be sent to the email.',
        success: true 
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Save reset token to user
    user.resetToken = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
    await user.save();

    try {
      await sendResetEmail(emailAddress, resetToken);
      console.log('Reset email sent successfully');
      res.json({ 
        message: 'Password reset link has been sent to your email.',
        success: true
      });
    } catch (emailError) {
      console.error('Detailed email error:', emailError);
      user.resetToken = undefined;
      user.resetTokenExpiry = undefined;
      await user.save();
      throw emailError;
    }
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ 
      message: 'Error processing password reset request. Please try again.',
      error: error.message,
      success: false
    });
  }
});
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/profile', protect, getProfile);

// Admin routes
router.get('/pending-providers', protect, authorize('admin'), getPendingServiceProviders);
router.put('/approve-provider/:userId', protect, authorize('admin'), approveServiceProvider);
// Add this to your routes/auth.js file

// Debug route to check registration data
router.post('/debug-register', async (req, res) => {
  try {
    console.log('Debug registration request body:', req.body);
    
    // Validate the required fields
    const { fullName, currentAddress, emailAddress, mobileNumber, password, role } = req.body;
    
    if (!fullName || !currentAddress || !emailAddress || !mobileNumber || !password || !role) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        missingFields: {
          fullName: !fullName,
          currentAddress: !currentAddress,
          emailAddress: !emailAddress,
          mobileNumber: !mobileNumber,
          password: !password,
          role: !role
        }
      });
    }
    
    // Check if user already exists
    const User = (await import('../models/User.js')).default;
    const existingUser = await User.findOne({ emailAddress });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    // Validate service provider specific fields
    if (role === 'serviceProvider') {
      const { businessName, services } = req.body;
      if (!businessName) {
        return res.status(400).json({ 
          message: 'Business name is required for service providers' 
        });
      }
    }
    
    res.json({ 
      message: 'Data validation passed',
      dataReceived: req.body
    });
  } catch (error) {
    console.error('Debug registration error:', error);
    res.status(500).json({ 
      message: 'Server error during registration validation',
      error: error.message 
    });
  }
});

export default router;