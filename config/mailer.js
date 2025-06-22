import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

console.log('Email configuration:', {
  user: process.env.EMAIL_USER,
  adminEmail: process.env.ADMIN_EMAIL || 'admin@beautiq.com',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
});

// Export the transporter
export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS.trim() // Ensure no whitespace
  }
});

// Add verification with error handling
transporter.verify((error, success) => {
  if (error) {
    console.error('Email configuration error:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    });
  } else {
    console.log('Server is ready to send emails');
  }
});

export const sendResetEmail = async (email, token, name) => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    const info = await transporter.sendMail({
      from: {
        name: 'BeautiQ Support',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1976d2;">Hello ${name},</h1>
          <p>You requested a password reset. Click the link below to reset your password:</p>
          <div style="margin: 20px 0;">
            <a href="${resetUrl}" style="background-color: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Reset Password
            </a>
          </div>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `
    });
    
    return info;
  } catch (error) {
    console.error('Send reset email error:', error);
    throw error;
  }
};

export const sendApprovalEmail = async (email, businessName, fullName) => {
  try {
    // Change loginUrl to approval success page
    const approvalSuccessUrl = `${process.env.FRONTEND_URL}/service-provider-approval-success`;
    
    const mailOptions = {
      from: {
        name: 'BeautiQ Support',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'Your BeautiQ Account is Approved! 🎉',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1976d2; text-align: center;">Account Approved! 🎉</h1>
          <p>Dear ${fullName},</p>
          <p>Great news! Your service provider account for "${businessName}" has been approved.</p>
          <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f5f5f5; border-radius: 8px;">
            <p style="font-size: 18px; margin-bottom: 20px;">Click the button below to access your account:</p>
            <a href="${approvalSuccessUrl}" 
               style="background-color: #1976d2; 
                      color: white; 
                      padding: 14px 28px; 
                      text-decoration: none; 
                      border-radius: 8px;
                      font-size: 16px;
                      display: inline-block;">
              Access Your Account
            </a>
          </div>
          <p style="margin-top: 20px;">Welcome to the BeautiQ family!</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    throw new Error(`Failed to send approval email: ${error.message}`);
  }
};

export const sendRegistrationNotificationToAdmin = async (serviceProvider) => {
  try {
    console.log('Preparing admin notification email for:', serviceProvider.businessName);
    
    // First, find admin email - you should set this in your environment variables
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@beautiq.com';
    console.log('Sending notification to admin email:', adminEmail);
    
    const adminUrl = `${process.env.FRONTEND_URL}/admin-dashboard`;
    
    const mailOptions = {
      from: {
        name: 'BeautiQ System',
        address: process.env.EMAIL_USER
      },
      to: adminEmail,
      subject: 'New Service Provider Registration - Action Required',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <h1 style="color: #1976d2; text-align: center;">New Service Provider Registration</h1>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>A new service provider has registered and is awaiting your approval:</strong></p>
            <ul style="line-height: 1.6;">
              <li><strong>Business Name:</strong> ${serviceProvider.businessName}</li>
              <li><strong>Owner:</strong> ${serviceProvider.fullName}</li>
              <li><strong>Email:</strong> ${serviceProvider.emailAddress}</li>
              <li><strong>Phone:</strong> ${serviceProvider.mobileNumber}</li>
              <li><strong>Business Type:</strong> ${serviceProvider.businessType}</li>
              <li><strong>Registration Date:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${adminUrl}" 
               style="background-color: #1976d2; 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 8px;
                      font-size: 16px;
                      display: inline-block;">
              Review in Admin Dashboard
            </a>
          </div>
          <p style="color: #666; font-size: 14px; text-align: center;">
            Please review and approve/reject this registration in your admin dashboard.
          </p>
        </div>
      `
    };

    console.log('Sending email with options:', {
      to: mailOptions.to,
      subject: mailOptions.subject,
      from: mailOptions.from
    });

    const result = await transporter.sendMail(mailOptions);
    console.log('Admin notification email sent successfully:', result.messageId);
    return true;
  } catch (error) {
    console.error('Detailed email sending error:', error);
    throw new Error(`Failed to send admin notification email: ${error.message}`);
  }
};