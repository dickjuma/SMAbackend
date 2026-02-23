const express = require('express');
const router = express.Router();
const {
  getQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  deleteQuotation,
  getQuotationStats,
  convertToInvoice,
  sendQuotationEmail,
  duplicateQuotation
} = require('../controllers/quotationController');

router.get('/stats', getQuotationStats);

router.get('/', getQuotations);
router.get('/:id', getQuotationById);
router.post('/', createQuotation);
router.put('/:id', updateQuotation);
router.delete('/:id', deleteQuotation);

router.post('/:id/convert-to-invoice', convertToInvoice);
router.post('/:id/send-email', sendQuotationEmail);
router.post('/:id/duplicate', duplicateQuotation);

module.exports = router;
