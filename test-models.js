// Test file to verify models work
import User from './models/User.js';
import Service from './models/Service.js';
import Package from './models/Package.js';
import Booking from './models/Booking.js';

console.log('✅ All models imported successfully');
console.log('✅ User model:', User.modelName);
console.log('✅ Service model:', Service.modelName);
console.log('✅ Package model:', Package.modelName);
console.log('✅ Booking model:', Booking.modelName);

export { User, Service, Package, Booking };