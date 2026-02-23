const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const dispatchService = require('../services/DispatchService.js.js');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'C:/Users/USER/Desktop/SMA/myapp/uploads/temp'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/registry', async (req, res) => {
  try {
    const Invoice = require('../models/invoice');
    const Quotation = require('../models/quotation');
    const Service = require('../models/service');
    const Client = require('../models/client');

    const [allInvoices, quotations, services, clients] = await Promise.all([
      Invoice.find().sort({ createdAt: -1 }).populate('client'),
      Quotation.find().sort({ createdAt: -1 }).populate('client'),
      Service.find().sort({ createdAt: -1 }).populate('client'),
      Client.find().sort({ name: 1 })
    ]);

    res.json({
      Invoices: allInvoices.filter((inv) => inv.status !== 'Paid'),
      Receipts: allInvoices.filter((inv) => inv.status === 'Paid'),
      Quotations: quotations,
      Services: services,
      Clients: clients
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync with local registry.' });
  }
});

router.post('/dispatch', upload.single('file'), async (req, res) => {
  try {
    const uploadedFiles = req.file ? [req.file] : [];
    const result = await dispatchService.processEmailDispatch(req.body, uploadedFiles);
    res.status(200).json({ success: true, message: 'Dispatch relay successful', messageId: result?.messageId, result });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Relay failure. Check email settings.' });
  }
});

module.exports = router;
