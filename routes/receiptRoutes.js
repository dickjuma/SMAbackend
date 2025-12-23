const express = require('express');
const router = express.Router();
const receiptController = require('../controllers/receiptController');

// @route   GET /api/receipts
// @desc    Retrieve all settled transactions with client details
router.get('/', receiptController.getReceipts);

// @route   POST /api/receipts
// @desc    Manually commit a new payment record to the ledger
router.post('/', receiptController.createManualReceipt);

// @route   DELETE /api/receipts/:id
// @desc    Permanently remove a transaction record by ID
router.delete('/:id', receiptController.deleteReceipt);

module.exports = router;