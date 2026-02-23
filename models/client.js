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
    default: 'NET30'
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
    postalCode: { type: String, default: '' },
    country: { type: String, default: 'Kenya' },
    gpsCoordinates: { type: String, default: '' }
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
  tags: [{ type: String }],
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Medium'
  },
  assignedTo: {
    type: String,
    default: ''
  },
  creditLimit: {
    type: Number,
    default: 0
  },
  industry: {
    type: String,
    default: ''
  },
  website: {
    type: String,
    default: ''
  },
  socialMedia: {
    linkedin: { type: String, default: '' },
    twitter: { type: String, default: '' },
    facebook: { type: String, default: '' }
  },
  contacts: [{
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    department: { type: String, default: '' },
    isPrimary: { type: Boolean, default: false }
  }],
  revenue: {
    type: Number,
    default: 0
  },
  documentCounts: {
    invoices: { type: Number, default: 0 },
    quotations: { type: Number, default: 0 },
    receipts: { type: Number, default: 0 }
  },
  totalAmounts: {
    invoiced: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    quoted: { type: Number, default: 0 }
  }
}, {
  timestamps: true // Automatically creates createdAt and updatedAt
});

clientSchema.index({ name: 'text', email: 'text' });

const Client = mongoose.models.Client || mongoose.model('Client', clientSchema);

module.exports = Client;
