const mongoose = require('mongoose');

const QuotationSchema = new mongoose.Schema({
  // Reference to the Client Model
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  date: {
    type: String,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  items: [{
    description: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    price: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true }
  }],
  notes: {
    type: String
  }
}, { timestamps: true });

module.exports = mongoose.model('Quotation', QuotationSchema);