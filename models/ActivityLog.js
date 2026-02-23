const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    actorName: { type: String, default: 'System', trim: true },
    action: { type: String, required: true, trim: true },
    actionType: {
      type: String,
      enum: ['create', 'read', 'update', 'delete', 'auth', 'presence', 'system', 'other'],
      default: 'other',
      index: true
    },
    module: { type: String, default: 'system', trim: true, index: true },
    targetModel: { type: String, default: '', trim: true },
    targetId: { type: String, default: '', trim: true },
    targetName: { type: String, default: '', trim: true },
    message: { type: String, default: '', trim: true },
    status: { type: String, enum: ['success', 'failed'], default: 'success', index: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    meta: {
      method: { type: String, default: '' },
      path: { type: String, default: '' },
      ip: { type: String, default: '' },
      userAgent: { type: String, default: '' }
    }
  },
  { timestamps: true }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);

