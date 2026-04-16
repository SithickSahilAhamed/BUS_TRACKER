/**
 * Location History Model
 * Stores complete GPS tracking history for analytics
 */

const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    busId: {
      type: String,
      required: true,
      index: true, // Index for faster queries
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    accuracy: {
      type: Number, // GPS accuracy in meters (optional)
      default: null,
    },
    speed: {
      type: Number, // Speed in km/h (optional)
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true, // Index for faster historical queries
    },
  },
  { timestamps: false }
);

// TTL Index: Auto-delete records older than 30 days
locationSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('Location', locationSchema);
