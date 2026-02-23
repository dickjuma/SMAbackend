const mongoose = require('mongoose');

const emailDraftSchema = new mongoose.Schema(
  {
    subject: { type: String, default: '' },
    message: { type: String, default: '' },
    mode: { type: String, enum: ['single', 'bulk'], default: 'single' },
    recipients: [{ type: String, trim: true, lowercase: true }],
    cc: [{ type: String, trim: true, lowercase: true }],
    bcc: [{ type: String, trim: true, lowercase: true }],
    documentModel: { type: String, default: '' },
    documentId: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.models.EmailDraft || mongoose.model('EmailDraft', emailDraftSchema);

