const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('./models/User'); 

dotenv.config();

const seed = async () => {
  try {
    console.log("Connecting to:", process.env.MONGODB_URI);
    await mongoose.connect(process.env.MONGODB_URI);
    
    // 1. Clean up existing admin to prevent "Duplicate Key" errors
    await User.deleteMany({ email: 'admin@sma.com' });
    
    const hashed = await bcrypt.hash('admin123', 12);
    
    await User.create({
      name: 'System Root',
      email: 'admin@sma.com',
      password: hashed,
      role: 'superadmin',
      department: 'Infrastructure',
      active: true
    });

    console.log("-----------------------------------------------");
    console.log("✅ SUCCESS: SuperAdmin Created");
    console.log("📧 Email: admin@sma.com");
    console.log("🔑 Password: admin123");
    console.log("-----------------------------------------------");
    
  } catch (err) {
    console.error("❌ SEED ERROR:", err.message);
  } finally {
    mongoose.connection.close();
    process.exit();
  }
};

seed();