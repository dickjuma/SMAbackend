const mongoose = require('mongoose');

const QuotationSchema = new mongoose.Schema({
  // Reference to the Client Model
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  quotationNumber: {
    type: String,
    trim: true,
    default: ''
  },
  date: {
    type: String,
    required: true
  },
  expiryDate: {
    type: String,
    default: ''
  },
  validity: {
    type: Number,
    default: 30
  },
  currency: {
    type: String,
    default: 'USD'
  },
  status: {
    type: String,
    default: 'DRAFT'
  },
  items: [{
    description: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    price: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true }
  }],
  subtotal: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  terms: { type: String, default: '' },
  notes: {
    type: String,
    default: ''
  },
  metadata: {
    emailSentAt: { type: Date, default: null },
    lastSentStatus: { type: String, default: '' }
  }
}, { timestamps: true });

module.exports = mongoose.model('Quotation', QuotationSchema);
