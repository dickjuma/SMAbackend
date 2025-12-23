const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema({
  // Reference to the Client model
  client: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Client', 
    required: true 
  },
  date: { type: String, required: true },
  currency: { type: String, default: 'USD' },
  status: { type: String, enum: ['Paid', 'Not Paid'], default: 'Not Paid' },
  items: [{
    description: String,
    quantity: Number,
    price: Number,
    total: Number
  }],
  notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Invoice', InvoiceSchema);