const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema({
  // Reference to the Client model
  client: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Client', 
    required: true 
  },
  invoiceNumber: {
    type: String,
    trim: true,
    default: ''
  },
  date: { type: String, required: true },
  dueDate: { type: String, default: '' },
  currency: { type: String, default: 'USD' },
  status: { type: String, default: 'DRAFT' },
  paymentTerms: { type: Number, default: 30 },
  items: [{
    description: String,
    quantity: Number,
    price: Number,
    total: Number
  }],
  subtotal: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  paymentMethod: { type: String, default: '' },
  notes: { type: String, default: '' },
  metadata: {
    downloadCount: { type: Number, default: 0 },
    emailSentAt: { type: Date, default: null },
    lastSentStatus: { type: String, default: '' }
  }
}, { timestamps: true });

module.exports = mongoose.model('Invoice', InvoiceSchema);
