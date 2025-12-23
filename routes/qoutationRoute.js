const express = require('express');
const router = express.Router();
const { 
  getQuotations, 
  createQuotation, 
  updateQuotation, 
  deleteQuotation 
} = require('../controllers/quotationController');

router.get('/', getQuotations);
router.post('/', createQuotation);
router.put('/:id', updateQuotation);
router.delete('/:id', deleteQuotation);

module.exports = router;