const mongoose = require('mongoose');

const recipientResultSchema = new mongoose.Schema(
  {
    email: { type: String, trim: true, lowercase: true },
    status: { type: String, enum: ['sent', 'failed'], default: 'sent' },
    messageId: { type: String, default: '' },
    error: { type: String, default: '' },
    clientName: { type: String, default: '' },
    documentType: { type: String, default: '' }
  },
  { _id: false }
);

const emailLogSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['single', 'bulk'], required: true },
    status: { type: String, enum: ['sent', 'failed', 'partial', 'draft'], default: 'sent' },
    subject: { type: String, default: '' },
    message: { type: String, default: '' },
    recipients: [{ type: String, trim: true, lowercase: true }],
    cc: [{ type: String, trim: true, lowercase: true }],
    bcc: [{ type: String, trim: true, lowercase: true }],
    documentModel: { type: String, default: '' },
    documentId: { type: String, default: '' },
    documentNumber: { type: String, default: '' },
    clientNames: [{ type: String }],
    generatedFiles: [{ type: String }],
    recipientResults: [recipientResultSchema],
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sentAt: { type: Date, default: Date.now },
    provider: { type: String, default: 'resend' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.models.EmailLog || mongoose.model('EmailLog', emailLogSchema);

