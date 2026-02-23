const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

router.get('/stats', invoiceController.getInvoiceStats);

router.get('/', invoiceController.getInvoices);
router.get('/:id', invoiceController.getInvoiceById);
router.post('/', invoiceController.createInvoice);
router.put('/:id', invoiceController.updateInvoice);
router.delete('/:id', invoiceController.deleteInvoice);

router.post('/bulk-delete', invoiceController.bulkDeleteInvoices);

router.post('/bulk-status', invoiceController.bulkStatusUpdate);

router.post('/:id/send-email', invoiceController.sendInvoiceEmail);
router.post('/:id/duplicate', invoiceController.duplicateInvoice);
router.post('/:id/track-download', invoiceController.trackDownload);

module.exports = router;
