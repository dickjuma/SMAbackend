const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const path = require('path');

dotenv.config();

const { protect, restrictTo, restrictToMinRole } = require('./middleware/auth');
const { initializeRealtime } = require('./services/realtimeService');
const { createHttpActivityLogger } = require('./services/activityLogService');

const authRoutes = require('./routes/authRoutes');
const clientRoutes = require('./routes/clientRoutes');
const invoiceRoutes = require('./routes/invoiceRoute');
const receiptRoutes = require('./routes/receiptRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const quotationRoutes = require('./routes/qoutationRoute');
const emailRoutes = require('./routes/financeRoutes');
const financeRoutes = require('./routes/dispatch.js');
const settingsRoutes = require('./routes/settingsRoutes');
const productRoutes = require('./routes/productRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const server = http.createServer(app);

app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const allowedOrigins = [
  process.env.FRONT_END_URL,
  process.env.FRONTEND_URL,
  process.env.ADMIN_END_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'https://smacrm-5.onrender.com'
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  })
);

app.use(createHttpActivityLogger());

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Active Database: ${conn.connection.name}`);
  } catch (err) {
    console.error(`Database Connection Failed: ${err.message}`);
    process.exit(1);
  }
};
connectDB();

app.use('/api/auth', authRoutes);

app.use('/api/clients', protect, clientRoutes);
app.use('/api/invoices', protect, invoiceRoutes);
app.use('/api/receipts', protect, receiptRoutes);
app.use('/api/quotations', protect, quotationRoutes);
app.use('/api/dashboard', protect, dashboardRoutes);
app.use('/api/settings', protect, restrictToMinRole('admin'), settingsRoutes);
app.use('/api/products', protect, productRoutes);
app.use('/api/users', protect, restrictTo('admin', 'superadmin'), userRoutes);
app.use('/api/admin', protect, restrictTo('admin', 'superadmin'), adminRoutes);

app.use('/api/email', protect, restrictTo('admin', 'superadmin'), emailRoutes);
app.use('/api/finance', protect, restrictTo('admin', 'superadmin'), financeRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'ENDPOINT_NOT_FOUND',
    message: `The path ${req.originalUrl} does not exist on this server.`
  });
});

app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  console.error(`[SYSTEM_CRITICAL] ${req.method} ${req.url}:`, err.message);

  res.status(statusCode).json({
    success: false,
    status: statusCode,
    message: err.message || 'INTERNAL_SERVER_ERROR',
    stack: process.env.NODE_ENV === 'production' ? 'hidden' : err.stack
  });
});

const PORT = process.env.PORT || 5000;
initializeRealtime({ server, corsOrigins: allowedOrigins });

server.listen(PORT, () => {
  console.log(`SYSTEM_BOOT_COMPLETE`);
  console.log(`CORE_LISTENING_ON: http://localhost:${PORT}`);
});
