import Appointment from '../models/Appointment.js';
import Service     from '../models/Service.js';

export const getAvailableSlots = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { date }      = req.query; // YYYY-MM-DD

    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    const duration = service.duration; // minutes

    // define working windows
    const morningStart = new Date(`${date}T09:00:00`);
    const morningEnd   = new Date(`${date}T12:00:00`);
    const afterStart   = new Date(`${date}T14:30:00`);
    const afterEnd     = new Date(`${date}T17:30:00`);

    // generate candidate slots
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

    // fetch confirmed appointments on that day
    const booked = await Appointment.find({
      serviceId,
      start: { $gte: new Date(`${date}T00:00:00`), $lt: new Date(`${date}T23:59:59`) },
      status: 'confirmed'
    });

    // filter out overlaps
    const available = slots.filter(slot => {
      const endSlot = new Date(slot.getTime() + duration*60000);
      return !booked.some(a => slot < a.end && endSlot > a.start);
    });

    res.json({ available: available.map(d => d.toISOString()) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
