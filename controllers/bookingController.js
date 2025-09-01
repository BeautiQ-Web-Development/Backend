// controllers/bookingController.js
import Booking from '../models/Booking.js';
import User from '../models/User.js';
import Service from '../models/Service.js';

// Get all bookings for a service provider
export const getProviderBookings = async (req, res) => {
  try {
    const providerId = req.user.userId;
    
    // Find all bookings for this provider
    const bookings = await Booking.find({ serviceProviderId: providerId })
      .sort({ bookingDate: -1, bookingTime: -1 });
    
    // Get customer details for each booking
    const bookingsWithDetails = await Promise.all(
      bookings.map(async (booking) => {
        const customer = await User.findById(booking.customerId);
        
        return {
          ...booking.toObject(),
          customerName: customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Customer'
        };
      })
    );
    
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
    
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
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
    
    // Get customer, provider, and service details
    const customer = await User.findById(booking.customerId);
    const provider = await User.findById(booking.serviceProviderId);
    const service = await Service.findById(booking.serviceId);
    
    const bookingDetails = {
      ...booking.toObject(),
      customerName: customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Customer',
      customerEmail: customer ? customer.emailAddress : '',
      providerName: provider ? `${provider.firstName} ${provider.lastName}` : 'Unknown Provider',
      providerEmail: provider ? provider.emailAddress : '',
      serviceName: service ? service.name : booking.serviceName || 'Unknown Service'
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
    const { status } = req.body;
    
    if (!['confirmed', 'completed', 'cancelled'].includes(status)) {
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
    
    booking.status = status;
    await booking.save();
    
    res.status(200).json({
      success: true,
      booking
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
      slot,
      totalPrice,
      serviceLocation,
      address,
      notes
    } = req.body;

    // Validate required fields
    if (!serviceId || !customerId || !serviceProviderId || !date || !slot || !totalPrice) {
      return res.status(400).json({
        success: false,
        message: 'Missing required booking information'
      });
    }
    
    // Check if serviceLocation is provided when using home service
    if (serviceLocation === 'home' && !address) {
      return res.status(400).json({
        success: false,
        message: 'Address is required for home services'
      });
    }
    
    // Check if slot is already booked (double booking prevention)
    const bookingDate = new Date(date);
    const dateString = bookingDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // First check if this time slot is already booked
    const existingBooking = await Booking.findOne({
      serviceId,
      bookingDate: {
        $gte: new Date(`${dateString}T00:00:00.000Z`),
        $lt: new Date(`${dateString}T23:59:59.999Z`)
      },
      bookingTime: slot,
      status: { $nin: ['cancelled'] }
    });
    
    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: 'This time slot has already been booked. Please select another time.',
        isDoubleBooking: true
      });
    }

    // Get service details
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Check if there's already a booking record for this customer, service, date and time
    // This prevents duplicate bookings
    let booking = await Booking.findOne({
      customerId,
      serviceId,
      bookingDate: {
        $gte: new Date(`${dateString}T00:00:00.000Z`),
        $lt: new Date(`${dateString}T23:59:59.999Z`)
      },
      bookingTime: slot
    });
    
    if (booking) {
      // If the booking exists but is cancelled, we can reuse it
      if (booking.status === 'cancelled') {
        booking.status = 'pending';
        booking.paymentStatus = 'pending';
        booking.totalPrice = totalPrice;
        booking.location = serviceLocation || 'salon';
        booking.address = address || null;
        booking.notes = notes || '';
        booking.updatedAt = new Date();
      } else {
        // If the booking exists and is not cancelled, return an error
        return res.status(409).json({
          success: false,
          message: 'You already have a booking for this service on this date and time',
          isDoubleBooking: true
        });
      }
    } else {
      // Create a new booking record if none exists
      booking = new Booking({
        serviceId,
        serviceProviderId,
        customerId,
        serviceType: service.type,
        serviceName: service.name,
        bookingDate: new Date(date),
        bookingTime: slot,
        totalPrice,
        status: 'pending',
        paymentStatus: 'pending',
        location: serviceLocation || 'salon',
        address: address || null,
        notes: notes || ''
      });
    }

    await booking.save();
    
    // Get customer details for notification
    const customer = await User.findById(customerId);
    
    // Send a notification to service provider
    if (customer) {
      const { createNotification } = await import('../controllers/notificationController.js');
      await createNotification({
        sender: customerId,
        receiver: serviceProviderId,
        message: `New booking received for ${service.name}`,
        type: 'booking_confirmation',
        data: {
          bookingId: booking._id,
          customerId: customerId,
          customerName: customer.fullName,
          customerIdNumber: customer.customerId || 'Unknown ID',
          serviceName: service.name,
          date: date,
          time: slot
        }
      });
    }

    res.status(201).json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking',
      error: error.message
    });
  }
};

// Get all bookings for a customer
export const getCustomerBookings = async (req, res) => {
  try {
    const customerId = req.user.userId;
    
    // Only get bookings that are pending, confirmed, or completed (exclude cancelled)
    // This ensures we don't show duplicate bookings if some were cancelled
    const bookings = await Booking.find({ 
      customerId,
      status: { $in: ['pending', 'confirmed', 'completed'] }
    }).sort({ bookingDate: -1, bookingTime: -1 });
    
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
    // Priority: confirmed > completed > pending
    const statusPriority = {
      'confirmed': 3,
      'completed': 2, 
      'pending': 1
    };
    
    const filteredBookings = [];
    Object.values(bookingGroups).forEach(group => {
      // Sort by status priority (highest first)
      group.sort((a, b) => statusPriority[b.status] - statusPriority[a.status]);
      // Keep only the first (highest priority) booking
      filteredBookings.push(group[0]);
    });
    
    // Get service provider details for each booking
    const bookingsWithDetails = await Promise.all(
      filteredBookings.map(async (booking) => {
        const provider = await User.findById(booking.serviceProviderId);
        const service = await Service.findById(booking.serviceId);
        
        // If booking already has providerName, use it, otherwise get it from provider
        const bookingObj = booking.toObject();
        return {
          ...bookingObj,
          providerName: bookingObj.providerName || (provider ? `${provider.firstName} ${provider.lastName}` : 'Unknown Provider'),
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

// Added from appointmentController - Get available time slots for a service
export const getAvailableSlots = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { date } = req.query; // YYYY-MM-DD

    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ 
      success: false, 
      message: 'Service not found' 
    });

    const duration = service.duration; // minutes

    // Define working windows
    const morningStart = new Date(`${date}T09:00:00`);
    const morningEnd   = new Date(`${date}T12:00:00`);
    const afterStart   = new Date(`${date}T14:30:00`);
    const afterEnd     = new Date(`${date}T17:30:00`);

    // Generate candidate slots
    const slots = [];
    const genSlots = (start, end) => {
      let cur = new Date(start);
      while (new Date(cur.getTime() + duration*60000) <= end) {
        slots.push(new Date(cur));
        cur = new Date(cur.getTime() + duration*60000);
      }
    };
    genSlots(morningStart, morningEnd);
    genSlots(afterStart, afterEnd);

    // Fetch all non-cancelled bookings on that day to prevent double bookings
    const booked = await Booking.find({
      serviceId,
      bookingDate: { $gte: new Date(`${date}T00:00:00`), $lt: new Date(`${date}T23:59:59`) },
      status: { $nin: ['cancelled'] } // Include all bookings except cancelled ones
    });

    // Filter out overlaps
    const available = slots.filter(slot => {
      const slotTimeStr = `${slot.getHours().toString().padStart(2, '0')}:${slot.getMinutes().toString().padStart(2, '0')}`;
      const endSlot = new Date(slot.getTime() + duration*60000);
      
      // Check if this slot is already booked
      const isSlotBooked = booked.some(booking => {
        // If exact time match
        if (booking.bookingTime === slotTimeStr) return true;
        
        // Or if there's an overlap
        const bookingStartTime = booking.start;
        const bookingEndTime = booking.end;
        return (slot < bookingEndTime && endSlot > bookingStartTime);
      });
      
      return !isSlotBooked;
    });

    res.json({ 
      success: true,
      available: available.map(d => d.toISOString()) 
    });
  } catch (err) {
    console.error('Error getting available slots:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to get available slots',
      error: err.message
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
    
    // Find if the slot is already booked (excluding the current booking)
    const existingBooking = await Booking.findOne({
      serviceId: booking.serviceId,
      bookingDate: {
        $gte: new Date(`${dateString}T00:00:00.000Z`),
        $lt: new Date(`${dateString}T23:59:59.999Z`)
      },
      bookingTime: slot,
      status: { $nin: ['cancelled'] },
      _id: { $ne: bookingId } // Exclude the current booking
    });
    
    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: 'This time slot has already been booked. Please select another time.',
        isDoubleBooking: true
      });
    }
    
    // Update the booking
    booking.bookingDate = bookingDate;
    booking.bookingTime = slot;
    
    // Auto-generate start and end times
    const [hours, minutes] = slot.split(':').map(Number);
    booking.start = new Date(bookingDate);
    booking.start.setHours(hours, minutes, 0, 0);
    booking.end = new Date(booking.start.getTime() + booking.duration * 60000);
    
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
