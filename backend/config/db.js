/**
 * MongoDB Connection Configuration
 * Handles connection to MongoDB Atlas or local MongoDB instance
 */

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // MongoDB connection string
    // For local: mongodb://localhost:27017/bus-tracking
    // For Atlas: mongodb+srv://user:password@cluster.mongodb.net/bus-tracking
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bus-tracking';

    const conn = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ MongoDB Connected:', conn.connection.host);
    return conn;
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
