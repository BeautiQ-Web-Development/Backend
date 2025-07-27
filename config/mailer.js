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
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    console.log(`Sending password reset email to ${email} with link: ${resetUrl}`);
    
    const info = await transporter.sendMail({
      from: {
        name: 'BeautiQ Support',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1976d2;">Hello ${name || 'User'},</h1>
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
    
    console.log('Password reset email sent successfully. Message ID:', info.messageId);
    return info;
  } catch (error) {
    console.error(`Failed to send password reset email to ${email}:`, error);
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
              <li><strong>Services Count:</strong> ${serviceProvider.services?.length || 0}</li>
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

export const sendRejectionEmail = async (email, businessName, fullName, reason) => {
  try {
    const supportUrl = `${process.env.FRONTEND_URL}/contact-support`;
    
    const mailOptions = {
      from: {
        name: 'BeautiQ Support',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'BeautiQ Registration Update - Action Required',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <h1 style="color: #d32f2f; text-align: center;">Registration Status Update</h1>
          <p>Dear ${fullName},</p>
          <p>Thank you for your interest in joining BeautiQ as a service provider.</p>
          <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
            <p><strong>Unfortunately, we are unable to approve your application for "${businessName}" at this time.</strong></p>
            <p><strong>Reason:</strong> ${reason}</p>
          </div>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1976d2; margin-top: 0;">What you can do:</h3>
            <ul style="line-height: 1.6;">
              <li>Review our service provider requirements</li>
              <li>Update your credentials or documentation</li>
              <li>Reapply after addressing the mentioned concerns</li>
              <li>Contact our support team for clarification</li>
            </ul>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${supportUrl}" 
               style="background-color: #1976d2; 
                      color: white; 
                      padding: 14px 28px; 
                      text-decoration: none; 
                      border-radius: 8px;
                      font-size: 16px;
                      display: inline-block;">
              Contact Support
            </a>
          </div>
          <p style="color: #666; font-size: 14px; text-align: center;">
            We appreciate your interest in BeautiQ and encourage you to reapply once you've addressed our feedback.
          </p>
          <p style="color: #666; font-size: 12px; text-align: center; margin-top: 30px;">
            This is an automated message from BeautiQ. Please do not reply to this email.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Rejection email sent successfully to:', email);
    return true;
  } catch (error) {
    console.error('Failed to send rejection email:', error);
    throw new Error(`Failed to send rejection email: ${error.message}`);
  }
};

export const sendServiceNotificationToAdmin = async (service, serviceProvider) => {
  try {
    const action = service.action || 'create';
    const actionText = {
      'create': 'New Service Submission',
      'update': 'Service Update Request', 
      'delete': 'Service Deletion Request'
    }[action] || 'Service Action Required';
    
    console.log(`Preparing admin notification email for ${action} service:`, service.name);
    
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@beautiq.com';
    console.log('Sending service notification to admin email:', adminEmail);
    
    const adminUrl = `${process.env.FRONTEND_URL}/admin-dashboard/service-management`;
    
    const getActionDescription = () => {
      switch(action) {
        case 'update':
          return `<p><strong>Service update request submitted by ${serviceProvider.businessName || serviceProvider.fullName}:</strong></p>`;
        case 'delete':
          return `<p><strong>Service deletion request submitted by ${serviceProvider.businessName || serviceProvider.fullName}:</strong></p>`;
        default:
          return `<p><strong>A new service has been submitted and is awaiting your approval:</strong></p>`;
      }
    };
    
    const mailOptions = {
      from: {
        name: 'BeautiQ System',
        address: process.env.EMAIL_USER
      },
      to: adminEmail,
      subject: `${actionText} - Action Required`,
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <h1 style="color: #1976d2; text-align: center;">${actionText}</h1>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            ${getActionDescription()}
            <ul style="line-height: 1.6;">
              <li><strong>Service Name:</strong> ${service.name}</li>
              <li><strong>Service Type:</strong> ${service.type}</li>
              <li><strong>Category:</strong> ${service.category}</li>
              <li><strong>Provider:</strong> ${serviceProvider.businessName || serviceProvider.fullName}</li>
              <li><strong>Provider Email:</strong> ${serviceProvider.emailAddress}</li>
              <li><strong>Base Price:</strong> LKR ${service.pricing?.basePrice || 0}</li>
              <li><strong>Duration:</strong> ${service.duration} minutes</li>
              <li><strong>Submission Date:</strong> ${new Date().toLocaleDateString()}</li>
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
            Please review and approve/reject this ${action} request in your admin dashboard.
          </p>
        </div>
      `
    };

    console.log('Sending service notification email...');
    const result = await transporter.sendMail(mailOptions);
    console.log('Service notification email sent successfully:', result.messageId);
    return true;
  } catch (error) {
    console.error('Failed to send service notification email:', error);
    throw new Error(`Failed to send service notification email: ${error.message}`);
  }
};

// Send notification to service provider about approval/rejection
export const sendServiceStatusNotificationToProvider = async (service, serviceProvider, status, reason = '') => {
  try {
    const isApproved = status === 'approved';
    const actionText = isApproved ? 'Service Approved' : 'Service Rejected';
    const statusMessage = isApproved 
      ? 'Your service has been approved and is now live!'
      : 'Your service submission has been reviewed and requires changes.';
    
    console.log(`Sending ${status} notification to provider:`, serviceProvider.emailAddress);
    
    const providerUrl = `${process.env.FRONTEND_URL}/service-provider/services`;
    
    const mailOptions = {
      from: {
        name: 'BeautiQ Support',
        address: process.env.EMAIL_USER
      },
      to: serviceProvider.emailAddress,
      subject: `${actionText} - ${service.name}`,
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <h1 style="color: ${isApproved ? '#4caf50' : '#f44336'}; text-align: center;">${actionText}</h1>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Hello ${serviceProvider.fullName},</strong></p>
            <p>${statusMessage}</p>
            <ul style="line-height: 1.6;">
              <li><strong>Service Name:</strong> ${service.name}</li>
              <li><strong>Service Type:</strong> ${service.type}</li>
              <li><strong>Status:</strong> ${isApproved ? 'Approved ✓' : 'Rejected ✗'}</li>
              <li><strong>Review Date:</strong> ${new Date().toLocaleDateString()}</li>
              ${reason ? `<li><strong>Admin Comments:</strong> ${reason}</li>` : ''}
            </ul>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${providerUrl}" 
               style="background-color: #1976d2; 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 8px;
                      font-size: 16px;
                      display: inline-block;">
              View Your Services
            </a>
          </div>
          <p style="color: #666; font-size: 14px; text-align: center;">
            ${isApproved 
              ? 'Your service is now visible to customers and available for booking.'
              : 'Please review the feedback and resubmit your service with the necessary changes.'
            }
          </p>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Provider notification email sent successfully:', result.messageId);
    return true;
  } catch (error) {
    console.error('Failed to send provider notification email:', error);
    throw new Error(`Failed to send provider notification email: ${error.message}`);
  }
};