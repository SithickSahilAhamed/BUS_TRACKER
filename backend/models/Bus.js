/**
 * Bus Model
 * Stores bus information and active status
 */

const mongoose = require('mongoose');

const busSchema = new mongoose.Schema(
  {
    busId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // Example: "BUS001", "B101", etc.
    },
    busName: {
      type: String,
      default: 'Unknown Bus',
    },
    routeName: {
      type: String,
      default: 'General Route',
    },
    driverName: {
      type: String,
      default: 'Unknown Driver',
    },
    driverPin: {
      type: String,
      // SHA-256 of '1234' + salt — default PIN is 1234
      default: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
    },
    // Route info for Google Maps Directions API
    origin: { type: String, default: '' },
    destination: { type: String, default: '' },
    waypoints: { type: [String], default: [] },
    isActive: {
      type: Boolean,
      default: false, // true when trip is active
    },
    lastLocation: {
      latitude: {
        type: Number,
        default: 13.0827, // Default: Chennai, India
      },
      longitude: {
        type: Number,
        default: 80.2707, // Default: Chennai, India
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Update updatedAt before saving
busSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Bus', busSchema);
