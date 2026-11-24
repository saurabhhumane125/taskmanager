import 'dotenv/config';
import mongoose from 'mongoose';

try {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing. Set it in .env first.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.db.admin().ping();
  const count = await mongoose.connection.db.collection('tasks').countDocuments();
  console.log(`MongoDB is connected. Database: ${mongoose.connection.name}. Saved tasks: ${count}.`);
} catch (error) {
  console.error(`Database check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
