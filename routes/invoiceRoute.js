const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

// All handlers are now verified as functions
router.get('/', invoiceController.getInvoices);
router.post('/', invoiceController.createInvoice);
router.put('/:id', invoiceController.updateInvoice); 
router.delete('/:id', invoiceController.deleteInvoice);

module.exports = router;