// controllers/bookingController.js
import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import User from '../models/User.js';
import Service from '../models/Service.js';

const ACTIVE_BOOKING_STATUSES = ['pending', 'booked', 'confirmed', 'completed'];

const parseTimeTuple = (timeString) => {
  if (!timeString || typeof timeString !== 'string') {
    return null;
  }

  const trimmed = timeString.trim();

  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const isoDate = new Date(trimmed);
    if (!Number.isNaN(isoDate.getTime())) {
      return [isoDate.getUTCHours(), isoDate.getUTCMinutes(), isoDate];
    }
  }

  const timeMatch = trimmed.match(/^([0-1]?\d|2[0-3]):([0-5]\d)(?:\s*(AM|PM))?$/i);
  if (!timeMatch) {
    return null;
  }

  let hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const period = timeMatch[3]?.toUpperCase();

  if (period) {
    if (period === 'PM' && hours < 12) {
      hours += 12;
    }
    if (period === 'AM' && hours === 12) {
      hours = 0;
    }
  }

  return [hours, minutes, null];
};

const normalizeBookingStatus = (status) => {
  if (!status || typeof status !== 'string') {
    return status;
  }
  const lowered = status.toLowerCase();
  // Keep 'confirmed' as is, don't convert to 'booked'
  return lowered;
};

const getUserDisplayName = (user, fallback = 'Unknown User') => {
  if (!user) {
    return fallback;
  }
  if (typeof user.fullName === 'string' && user.fullName.trim().length > 0) {
    return user.fullName.trim();
  }
  const parts = [user.firstName, user.lastName].filter(Boolean).map((part) => part.trim());
  const combined = parts.join(' ').trim();
  return combined || fallback;
};

const mapBookingForResponse = (bookingDoc) => {
  if (!bookingDoc) {
    return null;
  }
  const bookingObj = bookingDoc.toObject ? bookingDoc.toObject() : { ...bookingDoc };
  bookingObj.status = normalizeBookingStatus(bookingObj.status);
  return bookingObj;
};

// Get all bookings for a service provider
export const getProviderBookings = async (req, res) => {
  try {
    const providerId = req.user.userId;
    
    // Find all bookings for this provider
    // We do NOT populate customerId directly to avoid losing the ID if the user is deleted
    const bookings = await Booking.find({ serviceProviderId: providerId })
      .sort({ bookingDate: -1, start: -1 });
    
    // Collect all customer IDs
    const customerIds = [...new Set(bookings.map(b => b.customerId).filter(Boolean))];
    
    // Fetch customer details manually
    const customers = await User.find({ _id: { $in: customerIds } })
      .select('fullName emailAddress customerId firstName lastName');
    
    const customerMap = customers.reduce((acc, customer) => {
      acc[customer._id.toString()] = customer;
      return acc;
    }, {});

    // Map bookings to include customer's full name
    const bookingsWithDetails = bookings.map((booking) => {
      const bookingObj = mapBookingForResponse(booking);
      const customerIdStr = booking.customerId ? booking.customerId.toString() : null;
      const customer = customerIdStr ? customerMap[customerIdStr] : null;
      
      // Prioritize populated customer name, fallback to stored name unless it's invalid
      let customerName = getUserDisplayName(customer, null);
      if (!customerName) {
        customerName = bookingObj.customerName;
      }
      // Robust check for "undefined undefined" or similar artifacts
      if (!customerName || /undefined\s+undefined/i.test(customerName) || customerName.trim() === 'undefined') {
        customerName = 'Unknown Customer';
      }

      const customerEmail = (customer && customer.emailAddress) 
        ? customer.emailAddress 
        : (bookingObj.customerEmail || '');
        
      const customerAccountId = customer?.customerId || bookingObj.customerAccountId || null;
      // Always use the booking's customerId if available, even if user not found
      const customerUserId = customerIdStr || 
        (typeof bookingObj.customerId === 'string' ? bookingObj.customerId : bookingObj.customerId?._id?.toString?.()) ||
        null;
        
      const status = normalizeBookingStatus(bookingObj.status);
      const confirmedAt = bookingObj.confirmedAt || booking.confirmedAt || (status === 'confirmed' ? booking.updatedAt : null);

      return {
        ...bookingObj,
        customerName,
        customerEmail,
        customerAccountId,
        customerUserId,
        confirmedAt,
      };
    });
    
    res.status(200).json(bookingsWithDetails);
  } catch (error) {
    console.error('Error fetching provider bookings:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message 
    });
  }
};

// Get booking details by ID
export const getBookingById = async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    // Do NOT populate customerId/serviceProviderId to preserve IDs if users are deleted
    const booking = await Booking.findById(bookingId)
      .populate('serviceId', 'name');
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Fetch customer and provider manually
    const [customer, provider] = await Promise.all([
      User.findById(booking.customerId).select('fullName emailAddress customerId firstName lastName'),
      User.findById(booking.serviceProviderId).select('fullName emailAddress customerId firstName lastName')
    ]);
    
    // Check if the booking belongs to the current user
    if (
      req.user.role !== 'admin' && 
      booking.customerId.toString() !== req.user.userId && 
      booking.serviceProviderId.toString() !== req.user.userId
    ) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this booking'
      });
    }
    
    const baseBooking = mapBookingForResponse(booking);
    const status = normalizeBookingStatus(baseBooking.status);
    
    const storedCustomerName = (baseBooking.customerName && !/undefined\s+undefined/i.test(baseBooking.customerName)) 
      ? baseBooking.customerName 
      : 'Unknown Customer';
      
    const bookingDetails = {
      ...baseBooking,
      customerName: getUserDisplayName(customer, storedCustomerName),
      customerEmail: customer?.emailAddress || baseBooking.customerEmail || '',
      customerAccountId: customer?.customerId || baseBooking.customerAccountId || null,
      customerUserId: booking.customerId.toString(), // Always use the ID from booking
      providerName: getUserDisplayName(provider, 'Unknown Provider'),
      providerEmail: provider?.emailAddress || baseBooking.providerEmail || '',
      serviceName: booking.serviceId ? booking.serviceId.name : booking.serviceName || 'Unknown Service',
      confirmedAt: baseBooking.confirmedAt || booking.confirmedAt || (status === 'confirmed' ? booking.updatedAt : null),
    };
    
    res.status(200).json({
      success: true,
      booking: bookingDetails
    });
  } catch (error) {
    console.error('Error fetching booking details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking details',
      error: error.message
    });
  }
};

// Update booking status
export const updateBookingStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const rawStatus = typeof req.body.status === 'string' ? req.body.status.toLowerCase() : '';
    const statusToApply = normalizeBookingStatus(rawStatus);
    const allowedStatuses = ['confirmed', 'completed', 'cancelled']; // 'booked' is no longer a valid manual status

    if (!allowedStatuses.includes(statusToApply)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }
    
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Only allow service provider or admin to update status
    if (
      req.user.role !== 'admin' && 
      booking.serviceProviderId.toString() !== req.user.userId
    ) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this booking'
      });
    }
    
    const previousStatus = normalizeBookingStatus(booking.status);
    booking.status = statusToApply;

    if (statusToApply === 'confirmed' && previousStatus !== 'confirmed') {
      booking.confirmedAt = new Date();
    }
    await booking.save();
    
    // If status is changed to 'completed', send feedback notification to customer
    if (statusToApply === 'completed' && previousStatus !== 'completed') {
      // Import notification controller
      const { createNotification } = await import('./notificationController.js');
      
      // Get customer and service details
      const customer = await User.findById(booking.customerId);
      const service = await Service.findById(booking.serviceId);
      const provider = await User.findById(booking.serviceProviderId);
      const providerDisplayName = getUserDisplayName(provider, 'Provider');
      
      // Send feedback notification to customer
      if (customer) {
        await createNotification({
          sender: booking.serviceProviderId,
          receiver: booking.customerId,
          message: `Your service "${service?.name || booking.serviceName}" with ${providerDisplayName} has been completed! Please share your feedback and rating.`,
          type: 'feedback_request',
          data: {
            bookingId: booking._id,
            serviceId: booking.serviceId,
            serviceName: service?.name || booking.serviceName,
            providerId: booking.serviceProviderId,
            providerName: providerDisplayName,
            bookingDate: booking.bookingDate,
            bookingTime: booking.bookingTime
          }
        });
      }
    }
    
    res.status(200).json({
      success: true,
      booking: mapBookingForResponse(booking)
    });
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status',
      error: error.message
    });
  }
};

// Create a new booking
export const createBooking = async (req, res) => {
  try {
    const {
      serviceId,
      serviceName,
      customerId,
      serviceProviderId,
      date,
      slot, // Expecting a time string like "HH:MM"
      amount,
      currency = 'usd',
      serviceLocation,
      address,
    } = req.body;

    // Validate required fields
    if (!serviceId || !customerId || !serviceProviderId || !date || !slot || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required booking information',
      });
    }

    // Get service details
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
      });
    }

    // --- Working Hours Validation ---
    const bookingDate = new Date(date);
    const dayOfWeek = bookingDate.getUTCDay(); // Sunday = 0, Saturday = 6

    if (dayOfWeek === 0) { // Sunday is a holiday
      return res.status(400).json({
        success: false,
        message: 'Bookings are not available on Sundays.',
      });
    }

    const timeParts = slot.match(/(\d+):(\d+)/);
    if (!timeParts) {
      return res.status(400).json({ success: false, message: 'Invalid time format.' });
    }
    
    const hours = parseInt(timeParts[1], 10);
    const minutes = parseInt(timeParts[2], 10);

    // Working hours: 9 AM to 6 PM (18:00)
    if (hours < 9 || (hours >= 18 && minutes > 0)) {
      return res.status(400).json({
        success: false,
        message: 'Bookings are only available between 9:00 AM and 6:00 PM.',
      });
    }
    // --- End of Working Hours Validation ---

    // Combine date and time for startDateTime
    const startDateTime = new Date(`${date}T${slot}:00.000Z`);
    const duration = service.duration || 60;
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    // Check for conflicting bookings
    // Use service.serviceProvider to ensure we check the correct provider's schedule
    const normalizedProviderId = (() => {
      if (service?.serviceProvider instanceof mongoose.Types.ObjectId) {
        return service.serviceProvider;
      }
      if (service?.serviceProvider && mongoose.Types.ObjectId.isValid(service.serviceProvider)) {
        return new mongoose.Types.ObjectId(service.serviceProvider);
      }
      if (mongoose.Types.ObjectId.isValid(serviceProviderId)) {
        return new mongoose.Types.ObjectId(serviceProviderId);
      }
      if (service?.serviceProviderId && mongoose.Types.ObjectId.isValid(service.serviceProviderId)) {
        return new mongoose.Types.ObjectId(service.serviceProviderId);
      }
      return null;
    })();

    if (!normalizedProviderId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid service provider information for this service.'
      });
    }

    const conflictingBookings = await Booking.find({
      serviceId: service._id,
      status: { $in: ACTIVE_BOOKING_STATUSES },
      start: { $lt: endDateTime },
      end: { $gt: startDateTime }
    });

    if (conflictingBookings.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'This time slot is already booked. Please select another time.',
        isDoubleBooking: true,
      });
    }

    const [customerUser, providerUser] = await Promise.all([
      User.findById(customerId),
      User.findById(normalizedProviderId),
    ]);

    const customerDisplayName = getUserDisplayName(customerUser, 'Unknown Customer');
    const providerDisplayName = getUserDisplayName(providerUser, 'Unknown Provider');

    // Create a new booking with 'confirmed' status
    const newBooking = new Booking({
      serviceId,
      serviceName,
      customerId,
      serviceProviderId: normalizedProviderId,
      serviceType: service.type,
      bookingDate: new Date(date),
      bookingTime: slot,
      start: startDateTime,
      end: endDateTime,
      duration,
      totalPrice: amount,
      status: 'confirmed', // Set status to 'confirmed'
      paymentStatus: 'paid',
      location: serviceLocation,
      address,
      customerName: customerDisplayName,
      customerEmail: customerUser?.emailAddress,
      providerName: providerDisplayName,
      providerEmail: providerUser?.emailAddress,
      confirmedAt: new Date(),
    });

    await newBooking.save();

    res.status(201).json({
      success: true,
      booking: mapBookingForResponse(newBooking),
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking',
      error: error.message,
    });
  }
};

// Get all bookings for the current user (customer)
export const getCustomerBookings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Only get bookings that are pending, booked, or completed (exclude cancelled)
    const query = {
      ...(userRole === 'admin' ? {} : { customerId: userId }),
      status: { $in: ['booked', 'confirmed', 'completed'] },
    };

    const bookings = await Booking.find(query)
      .sort({ bookingDate: -1, bookingTime: -1 });
    
    // Group bookings by serviceId, bookingDate and bookingTime to detect duplicates
    const bookingGroups = {};
    bookings.forEach(booking => {
      const key = `${booking.serviceId}-${booking.bookingDate.toISOString()}-${booking.bookingTime}`;
      if (!bookingGroups[key]) {
        bookingGroups[key] = [];
      }
      bookingGroups[key].push(booking);
    });
    
    // For each group, keep only the booking with the "highest" status
    // Priority: booked/confirmed > completed > pending
    const statusPriority = {
      'booked': 3,
      'confirmed': 3,
      'completed': 2, 
      'pending': 1
    };
    const getPriority = (status) => statusPriority[normalizeBookingStatus(status)] || 0;
    
    const filteredBookings = [];
    Object.values(bookingGroups).forEach(group => {
      // Sort by status priority (highest first)
      group.sort((a, b) => getPriority(b.status) - getPriority(a.status));
      // Keep only the first (highest priority) booking
      filteredBookings.push(group[0]);
    });
    
    // Get service provider details for each booking
    const bookingsWithDetails = await Promise.all(
      filteredBookings.map(async (booking) => {
        const provider = await User.findById(booking.serviceProviderId);
        const service = await Service.findById(booking.serviceId);
        const bookingObj = mapBookingForResponse(booking);
        return {
          ...bookingObj,
          providerName: bookingObj.providerName || (provider ? provider.fullName : 'Unknown Provider'),
          providerEmail: bookingObj.providerEmail || (provider ? provider.emailAddress : ''),
          serviceName: service ? service.name : booking.serviceName || 'Unknown Service'
        };
      })
    );
    
    res.status(200).json(bookingsWithDetails);
  } catch (error) {
    console.error('Error fetching customer bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message
    });
  }
};

// Get available time slots for a given service and date
export const getAvailableSlots = async (req, res) => {
  try {
    const { serviceId } = req.params; // Correctly get serviceId from params
    const { date, bookingId } = req.query;

    if (!serviceId || !date) {
      return res.status(400).json({
        success: false,
        message: 'Service ID and date are required.',
      });
    }

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found.',
      });
    }

    const duration = service.duration || 60; // Default to 60 minutes
    const requestedDate = new Date(`${date}T00:00:00.000Z`); // Treat date as UTC
    const dayOfWeek = requestedDate.getUTCDay();

    // --- Working Hours and Holiday Validation ---
    if (dayOfWeek === 0) { // Sunday is a holiday
      return res.status(200).json({
        success: true,
        availableSlots: [],
        message: 'Bookings are not available on Sundays.',
      });
    }

    // Working hours: 9 AM to 6 PM
    const workDayStartHour = 9;
    const workDayEndHour = 18;

    // Find all confirmed/completed bookings for that day for the specific service provider
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const existingBookings = await Booking.find({
      serviceId: service._id,
      status: { $in: ACTIVE_BOOKING_STATUSES },
      start: { $lt: dayEnd },
      end: { $gt: dayStart }
    });

    const bookingFilter = (booking) => {
      if (!booking) {
        return false;
      }
      if (bookingId && booking._id && booking._id.toString() === bookingId) {
        return false; // exclude current booking when rescheduling
      }
      return true;
    };

    const trackedBookings = existingBookings.filter(bookingFilter);

    const toMinutesFromTuple = (tuple) => {
      if (!tuple) {
        return null;
      }
      const [hours, minutes, isoDate] = tuple;
      if (isoDate instanceof Date && !Number.isNaN(isoDate.getTime())) {
        return isoDate.getHours() * 60 + isoDate.getMinutes();
      }
      if (typeof hours === 'number' && typeof minutes === 'number') {
        return (hours * 60) + minutes;
      }
      return null;
    };

    const computeBookingInterval = (booking) => {
      const tuple = parseTimeTuple(booking?.bookingTime);
      let startMinutes = toMinutesFromTuple(tuple);

      if (startMinutes === null && booking?.start) {
        const startDate = new Date(booking.start);
        if (!Number.isNaN(startDate.getTime())) {
          startMinutes = (startDate.getHours() * 60) + startDate.getMinutes();
        }
      }

      if (startMinutes === null) {
        return null;
      }

      const bookingDuration = Number.isFinite(Number(booking?.duration)) && Number(booking?.duration) > 0
        ? Number(booking.duration)
        : duration;

      return {
        start: startMinutes,
        end: startMinutes + bookingDuration
      };
    };

    const blockedIntervals = trackedBookings
      .map(computeBookingInterval)
      .filter((interval) => interval && interval.end > interval.start);

    const workDayStartMinutes = workDayStartHour * 60;
    const workDayEndMinutes = workDayEndHour * 60;

    const candidateSlots = [];
    for (let slotStartMinutes = workDayStartMinutes; slotStartMinutes + duration <= workDayEndMinutes; slotStartMinutes += duration) {
      const slotEndMinutes = slotStartMinutes + duration;
      const overlaps = blockedIntervals.some(({ start, end }) => slotStartMinutes < end && slotEndMinutes > start);

      if (!overlaps) {
        candidateSlots.push(slotStartMinutes);
      }
    }

    const formattedSlots = candidateSlots.map((minutes) => {
      const hoursComponent = Math.floor(minutes / 60).toString().padStart(2, '0');
      const minutesComponent = (minutes % 60).toString().padStart(2, '0');
      return `${hoursComponent}:${minutesComponent}`;
    });

    res.status(200).json({
      success: true,
      availableSlots: formattedSlots,
    });
  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available slots.',
      error: error.message,
    });
  }
};

// Reschedule a booking
export const rescheduleBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { date, slot } = req.body;
    
    // Validate required fields
    if (!date || !slot) {
      return res.status(400).json({
        success: false,
        message: 'Date and time slot are required for rescheduling'
      });
    }
    
    // Find the booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Check if user has permission to reschedule
    if (
      req.user.role !== 'admin' && 
      booking.customerId.toString() !== req.user.userId && 
      booking.serviceProviderId.toString() !== req.user.userId
    ) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to reschedule this booking'
      });
    }
    
    // Check if the new slot is available
    const bookingDate = new Date(date);
    const dateString = bookingDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Handle both ISO datetime format and HH:mm time string format for slot start
    let newSlotStart;
    if (slot.includes('T')) {
      // slot is full ISO datetime (e.g., "2025-10-15T09:00:00.000Z")
      newSlotStart = new Date(slot);
    } else {
      // slot is time string "HH:mm" (e.g., "09:00")
      const parsedSlot = parseTimeTuple(slot);
      if (!parsedSlot) {
        return res.status(400).json({
          success: false,
          message: 'Invalid time slot format'
        });
      }
      const [hours, minutes] = parsedSlot;
      newSlotStart = new Date(bookingDate);
      newSlotStart.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    }
    
    const duration = Number(booking.duration) || 60;
    const newSlotEnd = new Date(newSlotStart.getTime() + duration * 60000);
    
    // Check for overlapping bookings (excluding the current booking)
    const dayBookings = await Booking.find({
      serviceProviderId: booking.serviceProviderId, // Check bookings for the provider
      status: { $nin: ['cancelled', 'failed'] },
      start: { $lt: new Date(`${dateString}T23:59:59.999Z`) },
      end: { $gt: new Date(`${dateString}T00:00:00.000Z`) },
      _id: { $ne: bookingId } // Exclude the current booking
    });
    
    const hasConflict = dayBookings.some((existing) => {
      const existingStart = existing.start ? new Date(existing.start) : (() => {
        const fallback = new Date(existing.bookingDate);
        const existingParsed = parseTimeTuple(existing.bookingTime);
        if (existingParsed) {
          const [hours, minutes] = existingParsed;
          fallback.setHours(hours ?? 0, minutes ?? 0, 0, 0);
        }
        return fallback;
      })();

      if (Number.isNaN(existingStart.getTime())) {
        return false;
      }

      const existingDuration = Number(existing.duration) || duration;
      const existingEnd = existing.end
        ? new Date(existing.end)
        : new Date(existingStart.getTime() + existingDuration * 60000);

      if (Number.isNaN(existingEnd.getTime())) {
        return false;
      }

      // Check for overlap: (start < otherEnd) && (end > otherStart)
      return newSlotStart < existingEnd && newSlotEnd > existingStart;
    });
    
    if (hasConflict) {
      return res.status(409).json({
        success: false,
        message: 'This time slot has already been booked. Please select another time.',
        isDoubleBooking: true
      });
    }
    
    // Update the booking with the new date and time
    booking.bookingDate = bookingDate;
    booking.bookingTime = `${newSlotStart.getHours().toString().padStart(2, '0')}:${newSlotStart.getMinutes().toString().padStart(2, '0')}`;
    booking.start = newSlotStart;
    booking.end = newSlotEnd;
    
    // No need to update payment status since we're just rescheduling
    
    await booking.save();
    
    // Notify the other party about the reschedule
    let receiverId, message, senderName;
    
    if (req.user.role === 'customer') {
      // Customer rescheduled, notify service provider
      receiverId = booking.serviceProviderId;
      const customer = await User.findById(req.user.userId);
      senderName = customer ? customer.fullName : 'A customer';
      message = `${senderName} has rescheduled their booking for ${booking.serviceName} to ${new Date(date).toLocaleDateString()} at ${slot}`;
    } else {
      // Service provider or admin rescheduled, notify customer
      receiverId = booking.customerId;
      const provider = await User.findById(req.user.userId);
      senderName = provider ? provider.fullName : 'Your service provider';
      message = `${senderName} has rescheduled your booking for ${booking.serviceName} to ${new Date(date).toLocaleDateString()} at ${slot}`;
    }
    
    const { createNotification } = await import('../controllers/notificationController.js');
    await createNotification({
      sender: req.user.userId,
      receiver: receiverId,
      message,
      type: 'booking_confirmation',
      data: {
        bookingId: booking._id,
        customerId: booking.customerId,
        serviceName: booking.serviceName,
        date,
        time: slot
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Booking rescheduled successfully',
      booking
    });
  } catch (error) {
    console.error('Error rescheduling booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reschedule booking',
      error: error.message
    });
  }
};