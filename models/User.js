const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['user', 'team_lead', 'manager', 'admin', 'superadmin'],
      default: 'user'
    },
    department: { type: String, default: 'Unassigned', trim: true },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    position: { type: String, default: '' },
    location: { type: String, default: '' },
    reportsTo: { type: String, default: '' },
    projects: { type: Number, default: 0 },
    skills: { type: [String], default: [] },
    performance: { type: Number, default: 0 },
    avatar: { type: String, default: '' },

    active: { type: Boolean, default: true },
    onlineStatus: {
      type: String,
      enum: ['online', 'away', 'busy', 'offline'],
      default: 'offline'
    },
    loginCount: { type: Number, default: 0 },
    lastLogin: { type: Date },
    lastSeen: { type: Date },

    refreshToken: { type: String, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
