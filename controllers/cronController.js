import Booking from '../models/Booking.js';
import User from '../models/User.js';
import Service from '../models/Service.js';
import { createNotification } from './notificationController.js';
import { getUserDisplayName } from './bookingController.js';

// Helper to parse booking time (copied from bookingController.js to avoid circular deps if any)
const parseTimeTuple = (timeString) => {
  if (!timeString || typeof timeString !== 'string') return null;
  const trimmed = timeString.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const isoDate = new Date(trimmed);
    if (!Number.isNaN(isoDate.getTime())) return [isoDate.getUTCHours(), isoDate.getUTCMinutes()];
  }
  const timeMatch = trimmed.match(/^([0-1]?\d|2[0-3]):([0-5]\d)(?:\s*(AM|PM))?$/i);
  if (!timeMatch) return null;
  let hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const period = timeMatch[3]?.toUpperCase();
  if (period) {
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
  }
  return [hours, minutes];
};

export const checkCompletedBookings = async () => {
  try {
    console.log('⏰ Running checkCompletedBookings cron job...');
    
    // Find bookings that are 'confirmed' or 'booked' (not yet completed)
    // and are past their scheduled time + 2 hours
    // We need to fetch potential candidates and filter in JS because bookingTime is a string
    
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    // Optimization: Only fetch bookings from the last 24 hours to avoid scanning entire DB
    // But also include older bookings that might have been missed (e.g. server down)
    // Let's just fetch active non-completed bookings from the past 7 days
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const candidates = await Booking.find({
      status: { $in: ['booked', 'confirmed'] },
      bookingDate: { $gte: sevenDaysAgo, $lte: now },
      reminderSent: { $ne: true } // Prevent duplicate reminders
    });
    
    console.log(`Found ${candidates.length} candidate bookings for completion check`);
    
    for (const booking of candidates) {
      const bookingDate = new Date(booking.bookingDate);
      const timeTuple = parseTimeTuple(booking.bookingTime);
      
      if (!timeTuple) continue;
      
      const [hours, minutes] = timeTuple;
      
      // Set the time on the booking date
      const scheduledTime = new Date(bookingDate);
      scheduledTime.setHours(hours, minutes, 0, 0);
      
      // Calculate the reminder threshold (scheduled time + 2 hours)
      const reminderThreshold = new Date(scheduledTime.getTime() + 2 * 60 * 60 * 1000);
      
      if (now >= reminderThreshold) {
        // It's been more than 2 hours since the service
        console.log(`🔔 Sending completion reminder for booking ${booking._id}`);
        
        // Send reminder to provider
        await createNotification({
          sender: booking.customerId, // System or Customer as sender? System is better but we use IDs. Let's use Customer ID to show who it's about.
          receiver: booking.serviceProviderId,
          message: `Did you complete the service "${booking.serviceName}" scheduled for ${booking.bookingTime}? Please mark it as completed.`,
          type: 'completion_reminder',
          data: {
            bookingId: booking._id,
            serviceId: booking.serviceId
          }
        });
        
        // Mark as reminder sent to avoid spamming
        booking.reminderSent = true;
        await booking.save();
      }
    }
    
  } catch (error) {
    console.error('❌ Error in checkCompletedBookings:', error);
  }
};

export const cleanupStaleBookings = async () => {
  try {
    console.log('🧹 Running cleanupStaleBookings cron job...');
    
    // Find pending bookings older than 30 minutes
    const staleBookings = await Booking.findPendingBookings(30);
    
    if (staleBookings.length > 0) {
      console.log(`Found ${staleBookings.length} stale pending bookings. Cleaning up...`);
      
      for (const booking of staleBookings) {
        await Booking.findByIdAndDelete(booking._id);
        console.log(`🗑️ Deleted stale booking ${booking._id}`);
      }
    }
  } catch (error) {
    console.error('❌ Error in cleanupStaleBookings:', error);
  }
};
