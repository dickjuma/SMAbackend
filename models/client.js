const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true 
  }, 
  phone: { 
    type: String, 
    required: true,
    trim: true 
  },
  // CRUCIAL: For KRA eTIMS / VAT Compliance
  kraPin: { 
    type: String, 
    default: '',
    uppercase: true,
    trim: true 
  },
  // CRUCIAL: To automate Invoice Due Dates
  paymentTerms: { 
    type: String, 
    enum: ['Immediate', 'Net 15', 'Net 30', 'Net 60'],
    default: 'Net 30' 
  },
  // CRUCIAL: For multi-currency invoicing
  currency: { 
    type: String, 
    default: 'KES',
    uppercase: true 
  },
  address: { 
    street: { type: String, default: '' },
    building: { type: String, default: '' },
    city: { type: String, default: '' },
    postalCode: { type: String, default: '' }
  },
  country: { 
    type: String, 
    default: 'Kenya' 
  },
  status: {
    type: String,
    enum: ['Active', 'Archived'],
    default: 'Active'
  },
  notes: { 
    type: String, 
    default: '' 
  },
}, {
  timestamps: true // Automatically creates createdAt and updatedAt
});

clientSchema.index({ name: 'text', email: 'text' });

const Client = mongoose.models.Client || mongoose.model('Client', clientSchema);

module.exports = Client;