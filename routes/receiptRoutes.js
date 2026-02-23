const express = require('express');
const router = express.Router();
const receiptController = require('../controllers/receiptController');

router.get('/stats', receiptController.getReceiptStats);
router.get('/:id', receiptController.getReceiptById);
router.get('/', receiptController.getReceipts);
router.post('/', receiptController.createManualReceipt);
router.put('/:id', receiptController.updateReceipt);
router.delete('/:id', receiptController.deleteReceipt);

module.exports = router;
