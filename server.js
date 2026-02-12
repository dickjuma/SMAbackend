const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

dotenv.config();

// 1. Security & Auth Imports
const { protect, restrictTo } = require('./middleware/auth');
const authRoutes = require('./routes/authRoutes');

// 2. Business Logic Imports
const clientRoutes = require('./routes/clientRoutes');
const invoiceRoutes = require('./routes/invoiceRoute'); 
const receiptRoutes = require('./routes/receiptRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const quotationRoutes = require('./routes/qoutationRoute');
const emailRoutes = require("./routes/financeRoutes");
const financeRoutes = require('./routes/dispatch.js');

const app = express();

// --- 3. MIDDLEWARE ---
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());
const allowedOrigins = [
  process.env.FRONT_END_URL || "http://localhost:3000",
  process.env.ADMIN_END_URL || "http://localhost:3001"
];

app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

// --- 4. DATABASE CONNECTION ---
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`\x1b[32m%s\x1b[0m`, `✔ MongoDB Connected: ${conn.connection.host}`);
    console.log(`\x1b[34m%s\x1b[0m`, `ℹ Active Database: ${conn.connection.name}`);
  } catch (err) {
    console.error(`\x1b[31m%s\x1b[0m`, `✘ Database Connection Failed: ${err.message}`);
    process.exit(1);
  }
};
connectDB();

// --- 5. API ENDPOINTS ---

/**
 * IDENTITY MANAGEMENT & AUTH
 * This handles Login, Logout, and the UserAdmin Node Management
 * Note: Internal protection is handled inside authRoutes.js
 */
app.use('/api/auth', authRoutes); 

/**
 * SECURE BUSINESS OPERATIONS
 * All routes below require a valid JWT (protect)
 */
app.use('/api/clients', protect, clientRoutes);
app.use('/api/invoices', protect, invoiceRoutes);
app.use('/api/receipts', protect, receiptRoutes);
app.use('/api/quotations', protect, quotationRoutes);
app.use('/api/dashboard', protect, dashboardRoutes);

/**
 * HIGH-LEVEL FINANCIAL & SYSTEM MANAGEMENT
 * Restricted to higher privilege levels
 */
app.use("/api/email", protect, restrictTo('admin', 'superadmin'), emailRoutes);
app.use('/api/finance', protect, restrictTo('admin', 'superadmin'), financeRoutes);

// --- 6. ERROR & SYSTEM FEEDBACK ---

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: "ENDPOINT_NOT_FOUND",
    message: `The path ${req.originalUrl} does not exist on this server.`
  });
});

// Standardized Global Error Handler
app.use((err, req, res, next) => {
  // Handle JWT specific errors for cleaner frontend experience
  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  console.error(`[SYSTEM_CRITICAL] ${req.method} ${req.url}:`, err.message);
  
  res.status(statusCode).json({
    success: false,
    status: statusCode,
    message: err.message || 'INTERNAL_SERVER_ERROR',
    stack: process.env.NODE_ENV === 'production' ? '🔒' : err.stack,
  });
});

// --- 7. STARTUP ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\x1b[36m%s\x1b[0m`, `🚀 SYSTEM_BOOT_COMPLETE`);
  console.log(`\x1b[36m%s\x1b[0m`, `📡 CORE_LISTENING_ON: http://localhost:${PORT}`);
  console.log(`-------------------------------------------------`);
});
