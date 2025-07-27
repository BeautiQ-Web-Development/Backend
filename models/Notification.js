import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  type: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Notification', NotificationSchema);
