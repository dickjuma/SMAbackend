const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const dispatchService = require('../services/DispatchService.js'); // Path to the code from previous step

// 1. Configure Multer for Manual Attachments
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Temporary storage before being sent and cleaned up
        cb(null, 'C:/Users/USER/Desktop/SMA/myapp/uploads/temp');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB Limit
});

// --- ROUTES ---

/**
 * @route   GET /api/finance/registry
 * @desc    Fetch all documents and clients for the EmailComposer sidebar
 */
router.get('/registry', async (req, res) => {
    try {
        const Invoice = require('../models/invoice');
        const Quotation = require('../models/quotation');
        const Service = require('../models/service');
        const Client = require('../models/client');

        const [invoices, quotations, services, clients] = await Promise.all([
            Invoice.find().sort({ createdAt: -1 }).populate('client'),
            Quotation.find().sort({ createdAt: -1 }).populate('client'),
            Service.find().sort({ createdAt: -1 }).populate('client'),
            Client.find().sort({ name: 1 })
        ]);

        res.json({
            Invoices: invoices,
            Quotations: quotations,
            Services: services,
            Clients: clients
        });
    } catch (err) {
        console.error("Registry Fetch Error:", err);
        res.status(500).json({ error: "Failed to sync with local registry." });
    }
});

/**
 * @route   POST /api/finance/dispatch
 * @desc    Process single or bulk email dispatch with auto-PDF generation
 */
router.post('/dispatch', upload.single('file'), async (req, res) => {
    try {
        // req.file is the file from the paperclip icon
        // req.body contains mode, docId, type, subject, message, etc.
        const uploadedFiles = req.file ? [req.file] : [];
        
        const result = await dispatchService.processEmailDispatch(req.body, uploadedFiles);

        res.status(200).json({ 
            success: true, 
            message: "Dispatch relay successful", 
            messageId: result.messageId 
        });
    } catch (err) {
        console.error("Dispatch Route Error:", err);
        res.status(500).json({ 
            error: err.message || "Relay failure. Check SMTP settings." 
        });
    }
});

module.exports = router;