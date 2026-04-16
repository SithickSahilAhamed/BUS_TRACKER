/**
 * MongoDB Connection — TypeScript
 */
import mongoose from 'mongoose';
import logger from '../lib/logger';

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI =
      process.env.MONGODB_URI || 'mongodb://localhost:27017/bus-tracking';

    await mongoose.connect(mongoURI);
    logger.info('✅ MongoDB Connected', { host: mongoose.connection.host });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.fatal('❌ MongoDB Connection Error', new Error(msg));
    process.exit(1);
  }
};

export default connectDB;
