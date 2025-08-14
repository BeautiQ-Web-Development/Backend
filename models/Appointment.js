import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  start: { type: Date, required: true },
  end:   { type: Date, required: true },
  status:{ type: String, enum: ['pending','confirmed','cancelled'], default: 'confirmed' }
});

export default mongoose.model('Appointment', appointmentSchema);
