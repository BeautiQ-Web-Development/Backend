// cleanup-old-notifications.js
// Script to clear old notifications with incomplete data structure
// Run this with: node cleanup-old-notifications.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Notification from './models/Notification.js';

dotenv.config();

const cleanupOldNotifications = async () => {
  try {
    console.log('🔄 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    // Find notifications with incomplete data
    const incompleteNotifications = await Notification.find({
      type: 'newServiceProvider',
      $or: [
        { 'data.providerEmail': { $exists: false } },
        { 'data.providerName': { $exists: false } },
        { 'data.mobileNumber': { $exists: false } }
      ]
    });

    console.log(`📊 Found ${incompleteNotifications.length} incomplete notifications`);

    if (incompleteNotifications.length > 0) {
      console.log('🗑️ Deleting incomplete notifications...');
      
      const result = await Notification.deleteMany({
        type: 'newServiceProvider',
        $or: [
          { 'data.providerEmail': { $exists: false } },
          { 'data.providerName': { $exists: false } },
          { 'data.mobileNumber': { $exists: false } }
        ]
      });

      console.log(`✅ Deleted ${result.deletedCount} incomplete notifications`);
    } else {
      console.log('✅ No incomplete notifications found');
    }

    // Show remaining notifications
    const remainingCount = await Notification.countDocuments({ type: 'newServiceProvider' });
    console.log(`📊 Remaining service provider notifications: ${remainingCount}`);

    await mongoose.connection.close();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
};

cleanupOldNotifications();
