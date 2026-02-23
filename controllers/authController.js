const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const mailer = require('../config/mailer');
const UserSession = require('../models/UserSession');
const { logActivity } = require('../services/activityLogService');

const signAccessToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1d' });
const signRefreshToken = (id) => jwt.sign({ id }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '30d' });

const safeUser = (user) => ({
  id: user._id,
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  department: user.department || 'Unassigned',
  phone: user.phone || '',
  address: user.address || '',
  position: user.position || '',
  location: user.location || '',
  reportsTo: user.reportsTo || '',
  projects: Number(user.projects) || 0,
  skills: Array.isArray(user.skills) ? user.skills : [],
  performance: Number(user.performance) || 0,
  avatar: user.avatar || '',
  active: !!user.active,
  isActive: !!user.active,
  onlineStatus: user.onlineStatus || 'offline',
  loginCount: Number(user.loginCount) || 0,
  lastLogin: user.lastLogin || null,
  lastSeen: user.lastSeen || user.lastLogin || null
});

const notifyProfileChange = async ({ user, changes = {}, action = 'details updated' }) => {
  try {
    const changedKeys = Object.keys(changes);
    const changesText = changedKeys.length ? changedKeys.join(', ') : 'profile information';

    await mailer.sendMail({
      from: process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || 'SMA Systems <finance@smassystems.com>',
      to: user.email,
      subject: 'Your profile was updated',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;">
          <h2 style="margin:0 0 12px;">Profile Update Notice</h2>
          <p>Hello ${user.name || 'User'},</p>
          <p>Your profile was updated successfully (${action}).</p>
          <p><strong>Updated fields:</strong> ${changesText}</p>
          <p>If this was not you, contact admin immediately.</p>
          <p style="margin-top:16px;">SMA Systems</p>
        </div>
      `
    });
  } catch (error) {
    console.error('[ProfileEmail] failed:', error.message);
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password', error: 'VALIDATION_ERROR' });
    }

    const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'No account found with this email', error: 'USER_NOT_FOUND' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Incorrect email or password', error: 'INVALID_CREDENTIALS' });
    }

    if (!user.active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated', error: 'ACCOUNT_DEACTIVATED' });
    }

    const token = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);

    user.lastLogin = new Date();
    user.lastSeen = new Date();
    user.onlineStatus = 'online';
    user.loginCount = (Number(user.loginCount) || 0) + 1;
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    await logActivity({
      req,
      actor: user._id,
      actorName: user.name,
      action: 'user login',
      actionType: 'auth',
      module: 'auth',
      targetId: user._id,
      status: 'success',
      details: { email: user.email }
    });

    res.status(200).json({
      success: true,
      token,
      refreshToken,
      sessionId: String(user._id),
      user: safeUser(user)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, error: 'SERVER_ERROR' });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const incoming = req.body?.refreshToken;
    if (!incoming) return res.status(400).json({ message: 'refreshToken is required' });

    const decoded = jwt.verify(incoming, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.active) return res.status(401).json({ message: 'Invalid refresh token' });

    if (!user.refreshToken || user.refreshToken !== incoming) {
      return res.status(401).json({ message: 'Refresh token mismatch' });
    }

    const token = signAccessToken(user._id);
    res.json({ success: true, token });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};

exports.logout = async (req, res) => {
  try {
    if (req.user?._id) {
      await User.findByIdAndUpdate(req.user._id, {
        $set: { refreshToken: null, onlineStatus: 'offline', lastSeen: new Date() }
      });
      await logActivity({
        req,
        actor: req.user._id,
        actorName: req.user.name,
        action: 'user logout',
        actionType: 'auth',
        module: 'auth',
        targetId: req.user._id,
        status: 'success'
      });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
};

exports.validateToken = async (req, res) => {
  res.json({ success: true, valid: true, user: safeUser(req.user) });
};

exports.getProfile = async (req, res) => {
  const userId = req.user?._id;
  const sinceToday = new Date();
  sinceToday.setHours(0, 0, 0, 0);

  const [allSessions, todaySessions] = await Promise.all([
    UserSession.find({ user: userId, status: 'ended' }).select('durationSeconds').lean(),
    UserSession.find({
      user: userId,
      connectedAt: { $gte: sinceToday }
    })
      .select('durationSeconds status connectedAt')
      .lean()
  ]);

  const totalSeconds = allSessions.reduce((sum, s) => sum + Number(s.durationSeconds || 0), 0);
  const todaySeconds = todaySessions.reduce((sum, s) => {
    if (s.status === 'ended') return sum + Number(s.durationSeconds || 0);
    const live = Math.max(0, Math.round((Date.now() - new Date(s.connectedAt).getTime()) / 1000));
    return sum + live;
  }, 0);
  const currentSession = todaySessions.find((s) => s.status === 'active');
  const currentSessionSeconds = currentSession
    ? Math.max(0, Math.round((Date.now() - new Date(currentSession.connectedAt).getTime()) / 1000))
    : 0;

  const toHourLabel = (seconds) => `${(seconds / 3600).toFixed(1)}h`;

  const data = safeUser(req.user);
  data.stats = {
    totalLogins: Number(req.user?.loginCount || 0),
    trackedTime: {
      totalSeconds,
      todaySeconds,
      currentSessionSeconds,
      totalLabel: toHourLabel(totalSeconds),
      todayLabel: toHourLabel(todaySeconds),
      currentSessionLabel: toHourLabel(currentSessionSeconds)
    }
  };

  res.json({ success: true, data });
};

exports.updateProfile = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const updates = {
      name: req.body?.name,
      department: req.body?.department,
      phone: req.body?.phone,
      address: req.body?.address,
      position: req.body?.position,
      location: req.body?.location
    };

    Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);
    const changedFields = {};
    Object.keys(updates).forEach((key) => {
      const nextValue = typeof updates[key] === 'string' ? updates[key].trim() : updates[key];
      updates[key] = nextValue;
      if ((currentUser[key] || '') !== (nextValue || '')) {
        changedFields[key] = { from: currentUser[key] || '', to: nextValue || '' };
      }
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    if (Object.keys(changedFields).length > 0) {
      await notifyProfileChange({ user, changes: changedFields, action: 'details updated' });
      await logActivity({
        req,
        actor: user._id,
        actorName: user.name,
        action: 'updated profile details',
        actionType: 'update',
        module: 'profile',
        targetId: user._id,
        status: 'success',
        details: { changedFields: Object.keys(changedFields) }
      });
    }
    res.json({ success: true, data: safeUser(user) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || 'Failed to update profile' });
  }
};

exports.uploadProfileAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No avatar file uploaded' });
    }

    const ext = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
    const fileName = `avatar-${String(req.user._id)}-${Date.now()}${ext}`;
    const uploadsDir = path.resolve(__dirname, '../uploads/avatars');
    const absolutePath = path.join(uploadsDir, fileName);
    const publicPath = `/uploads/avatars/${fileName}`;

    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(absolutePath, req.file.buffer);

    const existingUser = await User.findById(req.user._id);
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const previousAvatar = String(existingUser.avatar || '');
    if (previousAvatar.startsWith('/uploads/avatars/')) {
      const previousFile = path.resolve(__dirname, `..${previousAvatar}`);
      if (fs.existsSync(previousFile)) {
        fs.unlink(previousFile, () => {});
      }
    }

    existingUser.avatar = publicPath;
    await existingUser.save({ validateBeforeSave: false });
    await notifyProfileChange({ user: existingUser, changes: { avatar: true }, action: 'profile photo updated' });
    await logActivity({
      req,
      actor: existingUser._id,
      actorName: existingUser.name,
      action: 'updated profile photo',
      actionType: 'update',
      module: 'profile',
      targetId: existingUser._id,
      status: 'success'
    });

    res.json({ success: true, data: safeUser(existingUser) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || 'Failed to upload avatar' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const user = await User.findById(req.user._id).select('+password');

    const isValid = await bcrypt.compare(currentPassword || '', user.password || '');
    if (!isValid) return res.status(401).json({ message: 'Current password is incorrect' });

    user.password = await bcrypt.hash(newPassword || '', 12);
    await user.save();
    await logActivity({
      req,
      actor: user._id,
      actorName: user.name,
      action: 'changed password',
      actionType: 'auth',
      module: 'security',
      targetId: user._id,
      status: 'success'
    });
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Failed to change password' });
  }
};

exports.updatePresence = async (req, res) => {
  try {
    const status = ['online', 'away', 'busy', 'offline'].includes(req.body?.status) ? req.body.status : 'online';
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { onlineStatus: status, lastSeen: new Date() } },
      { new: true }
    );
    await logActivity({
      req,
      actor: user._id,
      actorName: user.name,
      action: `presence set to ${status}`,
      actionType: 'presence',
      module: 'presence',
      targetId: user._id,
      status: 'success'
    });
    res.json({ success: true, status: user.onlineStatus, lastSeen: user.lastSeen });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Failed to update presence' });
  }
};
