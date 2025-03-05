// import mongoose from 'mongoose';

// const userSchema = new mongoose.Schema({
//   fullName: {
//     type: String,
//     required: true
//   },
//   currentAddress: {
//     type: String,
//     required: true
//   },
//   emailAddress: {
//     type: String,
//     required: true,
//     unique: true,
//     lowercase: true
//   },
//   mobileNumber: {
//     type: String,
//     required: true
//   },
//   password: {
//     type: String,
//     required: true
//   },
//   role: {
//     type: String,
//     required: true,
//     enum: ['customer', 'serviceProvider', 'admin'],
//     default: 'customer'
//   },
//   // Additional fields for service providers
//   businessName: {
//     type: String,
//     required: function() {
//       return this.role === 'serviceProvider';
//     }
//   },
//   services: [{
//     name: String,
//     description: String,
//     price: Number
//   }],
//   location: {
//     address: String,
//     city: String,
//     state: String,
//     zipCode: String
//   },
//   businessHours: {
//     type: Map,
//     of: {
//       open: String,
//       close: String
//     }
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now
//   },
//   resetToken: String,
//   resetTokenExpiry: Date
// });

// export default mongoose.model('User', userSchema);


import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true
  },
  currentAddress: {
    type: String,
    required: true
  },
  emailAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  mobileNumber: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: ['customer', 'serviceProvider', 'admin'],
    default: 'customer'
  },
  // Additional fields for service providers
  businessName: {
    type: String,
    required: function() {
      // Make it not required during creation but validate later
      return false;
    }
  },
  approved: {
    type: Boolean,
    default: function() {
      return this.role !== 'serviceProvider'; // Only service providers need approval
    }
  },
  services: [{
    name: String,
    description: String,
    price: Number
  }],
  location: {
    address: String,
    city: String,
    state: String,
    zipCode: String
  },
  businessHours: {
    type: Map,
    of: {
      open: String,
      close: String
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  resetToken: String,
  resetTokenExpiry: Date
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);