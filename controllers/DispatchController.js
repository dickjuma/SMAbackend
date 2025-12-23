const express = require('express');
const router = express.Router();
const multer = require('multer');
const financeController = require('../controllers/financeController');


const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB Limit
});

// Sidebar Data Route
router.get('/registry', financeController.getRegistry);

// Email Dispatch Route
router.post('/dispatch', upload.single('file'), financeController.dispatchEmail);

module.exports = router;