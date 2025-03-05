import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { 
  sendResetEmail, 
  sendApprovalEmail,
  sendRegistrationNotificationToAdmin 
} from '../config/mailer.js';

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { userId: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Register user
export const register = async (req, res) => {
  try {
    const { 
      fullName, 
      currentAddress, 
      emailAddress, 
      mobileNumber, 
      password, 
      role,
      businessName,
      services,
      location
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ emailAddress });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // For admin role - check if an admin already exists
    if (role === 'admin') {
      const adminExists = await User.findOne({ role: 'admin' });
      if (adminExists) {
        return res.status(403).json({ 
          message: 'Only one admin account is allowed in the system',
          adminExists: true
        });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const userData = {
      fullName,
      currentAddress,
      emailAddress,
      mobileNumber,
      password: hashedPassword,
      role: role || 'customer'
    };

    // Add service provider specific fields if applicable
    if (role === 'serviceProvider') {
      userData.businessName = businessName;
      userData.services = services || [];
      userData.location = location;
      userData.approved = false; // Service providers need admin approval
    }

    const user = new User(userData);
    await user.save();

    // If service provider, don't generate token yet until approved
    if (role === 'serviceProvider') {
      // Notify admin about new service provider registration
      try {
        await sendRegistrationNotificationToAdmin(user);
      } catch (emailError) {
        console.error('Failed to send admin notification:', emailError);
        // Continue with registration even if email fails
      }
      
      return res.status(201).json({
        message: 'Registration successful! Your account is pending admin approval.',
        user: {
          id: user._id,
          fullName: user.fullName,
          emailAddress: user.emailAddress,
          role: user.role,
          approved: false
        }
      });
    }

    // For customer and admin, generate token and allow immediate login
    const token = generateToken(user);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        fullName: user.fullName,
        emailAddress: user.emailAddress,
        role: user.role
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// controllers/authController.js - Updated login function

export const login = async (req, res) => {
  try {
    const { emailAddress, password, role } = req.body;

    // Find user
    const user = await User.findOne({ emailAddress });
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Verify role matches
    if (role && user.role !== role) {
      return res.status(403).json({ 
        message: 'Invalid account type for this login' 
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // For service providers, check approval status
    if (user.role === 'serviceProvider') {
      if (!user.approved) {
        return res.status(403).json({
          pendingApproval: true,
          message: 'Your account is pending admin approval'
        });
      }
    }

    // Generate token and return user data
    const token = generateToken(user);
    
    res.json({
      user: {
        id: user._id,
        fullName: user.fullName,
        emailAddress: user.emailAddress,
        role: user.role,
        approved: user.approved,
        businessName: user.businessName
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Verify token
export const verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ valid: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ valid: false, message: 'User not found' });
    }

    res.json({ 
      valid: true, 
      user: {
        id: user._id,
        fullName: user.fullName,
        emailAddress: user.emailAddress,
        role: user.role,
        approved: user.approved
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ valid: false, message: 'Invalid token' });
  }
};

// Reset password
export const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({ message: 'Reset token and new password are required' });
    }

    // First verify the token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (error) {
      console.error('Token verification failed:', error);
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Find user with more detailed logging
    console.log('Looking for user with ID:', decoded.userId);
    const user = await User.findOne({
      _id: decoded.userId,
      resetToken: resetToken,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      console.log('User not found or token expired');
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    console.log('User found:', {
      id: user._id,
      email: user.emailAddress,
      role: user.role
    });

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update user password and clear reset token
    user.password = hashedPassword;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    
    // Save the updated user document with proper error handling
    try {
      await user.save();
      console.log('Password updated successfully for user:', user._id);
    } catch (saveError) {
      console.error('Error saving user after password reset:', saveError);
      return res.status(500).json({ 
        message: 'Error updating password',
        error: saveError.message 
      });
    }

    res.json({ 
      message: 'Password reset successful',
      success: true,
      userRole: user.role // Include the role for debugging
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ 
      message: 'Error resetting password',
      error: error.message 
    });
  }
};

// Forgot password
export const forgotPassword = async (req, res) => {
  try {
    const { emailAddress } = req.body;
    console.log('Received forgot password request for:', emailAddress);

    if (!emailAddress) {
      return res.status(400).json({ message: 'Email address is required' });
    }

    // Find user
    const user = await User.findOne({ emailAddress });
    console.log('User found:', user ? 'Yes' : 'No');

    if (!user) {
      // For security reasons, still return success even if user not found
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.'
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    console.log('Reset token generated');

    // Save reset token to user
    user.resetToken = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
    await user.save();
    console.log('Reset token saved to user');

    try {
      // Send reset email
      console.log('Attempting to send reset email...');
      await sendResetEmail(
        user.emailAddress,
        resetToken,
        user.fullName
      );
      console.log('Reset email sent successfully');

      res.status(200).json({
        success: true,
        message: 'Password reset link sent successfully'
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      
      // Reset the token if email fails
      user.resetToken = undefined;
      user.resetTokenExpiry = undefined;
      await user.save();
      
      throw new Error(`Failed to send reset email: ${emailError.message}`);
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while processing your request.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Admin route to approve service providers
export const approveServiceProvider = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const serviceProvider = await User.findById(userId);
    
    if (!serviceProvider) {
      return res.status(404).json({ message: 'Service provider not found' });
    }
    
    if (serviceProvider.role !== 'serviceProvider') {
      return res.status(400).json({ message: 'User is not a service provider' });
    }
    
    serviceProvider.approved = true;
    await serviceProvider.save();
    
    // Send notification email to service provider
    try {
      await sendApprovalEmail(
        serviceProvider.emailAddress,
        serviceProvider.businessName,
        serviceProvider.fullName
      );
    } catch (emailError) {
      console.error('Failed to send approval email:', emailError);
      // Continue with approval even if email fails
    }
    
    res.json({ 
      message: 'Service provider approved successfully',
      serviceProvider: {
        id: serviceProvider._id,
        fullName: serviceProvider.fullName,
        emailAddress: serviceProvider.emailAddress,
        approved: serviceProvider.approved
      }
    });
  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({ message: 'Server error during approval process' });
  }
};

// Get pending service providers for admin
export const getPendingServiceProviders = async (req, res) => {
  try {
    const pendingProviders = await User.find({ 
      role: 'serviceProvider',
      approved: false
    }).select('-password');
    
    res.json({ pendingProviders });
  } catch (error) {
    console.error('Error fetching pending providers:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get user profile
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ user });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
};