const mongoose = require('mongoose');

const userSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    socketId: { type: String, default: '', index: true },
    connectedAt: { type: Date, required: true, default: Date.now, index: true },
    disconnectedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'ended'], default: 'active', index: true },
    source: { type: String, default: 'websocket' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' }
  },
  { timestamps: true }
);

userSessionSchema.index({ user: 1, connectedAt: -1 });

module.exports = mongoose.models.UserSession || mongoose.model('UserSession', userSessionSchema);

