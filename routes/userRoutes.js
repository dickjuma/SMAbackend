const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const User = require('../models/User');
const mailer = require('../config/mailer');
const UserSession = require('../models/UserSession');
const { logActivity } = require('../services/activityLogService');

const upload = multer({ storage: multer.memoryStorage() });

const roleWeight = { user: 1, team_lead: 2, manager: 3, admin: 4, superadmin: 5 };

const inferOnlineStatus = (user) => {
  const lastSeen = user.lastSeen || user.lastLogin || user.updatedAt;
  if (!lastSeen) return 'offline';
  const diffMinutes = (Date.now() - new Date(lastSeen).getTime()) / 60000;
  if (String(user.onlineStatus || '').toLowerCase() === 'online') return 'online';
  if (diffMinutes <= 2) return 'online';
  if (diffMinutes <= 30) return 'away';
  return 'offline';
};

const inferPerformance = (user) => {
  if (Number.isFinite(Number(user.performance)) && Number(user.performance) > 0) {
    return Math.min(100, Math.max(0, Number(user.performance)));
  }
  const logins = Number(user.loginCount) || 0;
  const base = 55 + Math.min(35, logins * 2) + (roleWeight[user.role] || 1) * 2;
  return Math.min(100, Math.round(base));
};

const normalizeUser = (u, sessionMeta = {}) => {
  const lastSeen = u.lastSeen || u.lastLogin || u.updatedAt || u.createdAt;
  const totalOnlineMinutes = Number(sessionMeta.totalOnlineMinutes || 0);
  const todayOnlineMinutes = Number(sessionMeta.todayOnlineMinutes || 0);
  return {
    _id: u._id,
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.department || 'Unassigned',
    phone: u.phone || '',
    position: u.position || '',
    location: u.location || '',
    reportsTo: u.reportsTo || '',
    projects: Number(u.projects) || 0,
    skills: Array.isArray(u.skills) ? u.skills : [],
    performance: inferPerformance(u),
    avatar: u.avatar || '',
    active: !!u.active,
    isActive: !!u.active,
    onlineStatus: inferOnlineStatus(u),
    loginCount: Number(u.loginCount) || 0,
    lastLogin: u.lastLogin || null,
    lastSeen: lastSeen || null,
    todayActivity: {
      activeTime: todayOnlineMinutes
    },
    onlineTime: {
      todayMinutes: todayOnlineMinutes,
      totalMinutes: totalOnlineMinutes
    },
    createdAt: u.createdAt,
    updatedAt: u.updatedAt
  };
};

const buildSessionMetaMap = async (userIds = []) => {
  if (!Array.isArray(userIds) || userIds.length === 0) return new Map();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalAgg, todayAgg, activeSessions] = await Promise.all([
    UserSession.aggregate([
      { $match: { user: { $in: userIds } } },
      { $group: { _id: '$user', totalSeconds: { $sum: '$durationSeconds' } } }
    ]),
    UserSession.aggregate([
      { $match: { user: { $in: userIds }, connectedAt: { $gte: today } } },
        { $group: { _id: '$user', totalSeconds: { $sum: '$durationSeconds' } } }
    ]),
    UserSession.find({ user: { $in: userIds }, status: 'active' })
      .select('user connectedAt')
      .lean()
  ]);

  const map = new Map();
  totalAgg.forEach((item) => {
    map.set(String(item._id), { totalOnlineMinutes: Math.round(Number(item.totalSeconds || 0) / 60) });
  });
  todayAgg.forEach((item) => {
    const key = String(item._id);
    const current = map.get(key) || {};
    map.set(key, { ...current, todayOnlineMinutes: Math.round(Number(item.totalSeconds || 0) / 60) });
  });

  activeSessions.forEach((session) => {
    const key = String(session.user);
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(session.connectedAt).getTime()) / 1000));
    const elapsedMinutes = Math.round(elapsedSeconds / 60);
    const current = map.get(key) || {};
    map.set(key, {
      totalOnlineMinutes: Number(current.totalOnlineMinutes || 0) + elapsedMinutes,
      todayOnlineMinutes: Number(current.todayOnlineMinutes || 0) + elapsedMinutes
    });
  });
  return map;
};

const buildStats = (users) => {
  const rolesMap = users.reduce((acc, u) => {
    const key = u.role || 'user';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const deptMap = users.reduce((acc, u) => {
    const key = u.department || 'Unassigned';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const online = users.filter((u) => (u.onlineStatus || 'offline') === 'online').length;
  const active = users.filter((u) => u.isActive).length;
  const avgPerformance = users.length
    ? Math.round(users.reduce((s, u) => s + (Number(u.performance) || 0), 0) / users.length)
    : 0;
  const engagement = users.length
    ? Math.round((users.reduce((s, u) => s + Math.min(100, (Number(u.loginCount) || 0) * 5), 0) / users.length))
    : 0;

  return {
    total: users.length,
    online,
    active,
    departments: Object.entries(deptMap).map(([department, count]) => ({ department, count })),
    roles: Object.entries(rolesMap).map(([role, count]) => ({ role, count })),
    productivity: avgPerformance,
    engagement
  };
};

const parseCSVLine = (line) => {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  out.push(current.trim());
  return out;
};

const generateTempPassword = (length = 12) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
};

const sendUserAccessEmail = async ({ to, name, password, mode = 'created' }) => {
  const subject =
    mode === 'reset'
      ? 'SMA Account Password Reset'
      : 'SMA Account Created';

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:20px;">
      <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
        <div style="background:#0f172a;color:#fff;padding:16px 20px;font-weight:700;">SMA SYSTEMS</div>
        <div style="padding:20px;color:#0f172a;">
          <p>Hello ${name || 'User'},</p>
          <p>Your account ${mode === 'reset' ? 'password was reset' : 'has been created'}.</p>
          <p style="margin:16px 0 8px 0;"><strong>Login Email:</strong> ${to}</p>
          <p style="margin:8px 0 16px 0;"><strong>Temporary Password:</strong> <code>${password}</code></p>
          <p>Please sign in and change this password immediately.</p>
        </div>
      </div>
    </div>
  `;

  await mailer.sendMail({
    to,
    subject,
    html
  });
};

router.get('/', async (req, res) => {
  try {
    const {
      search = '',
      role = '',
      department = '',
      status = '',
      online = '',
      dateRange = '',
      sortBy = 'name',
      sortOrder = 'asc',
      page = '1',
      limit = '200'
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } },
        { position: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) query.role = role;
    if (department) query.department = department;

    if (status) {
      const s = String(status).toLowerCase();
      if (s === 'active') query.active = true;
      if (s === 'inactive') query.active = false;
    }

    if (dateRange) {
      const match = String(dateRange).match(/(\d+)/);
      if (match) {
        const days = Number(match[1]);
        if (Number.isFinite(days) && days > 0) {
          const since = new Date();
          since.setDate(since.getDate() - days);
          query.createdAt = { $gte: since };
        }
      }
    }

    const rawRows = await User.find(query).lean();
    const sessionMetaMap = await buildSessionMetaMap(rawRows.map((r) => r._id));
    const rows = rawRows.map((u) => normalizeUser(u, sessionMetaMap.get(String(u._id)) || {}));

    let filtered = rows;
    if (online) {
      const o = String(online).toLowerCase();
      if (['online', 'away', 'busy', 'offline'].includes(o)) {
        filtered = filtered.filter((u) => (u.onlineStatus || 'offline') === o);
      }
    }

    const sortMap = {
      name: (u) => (u.name || '').toLowerCase(),
      email: (u) => (u.email || '').toLowerCase(),
      role: (u) => roleWeight[u.role] || 0,
      department: (u) => (u.department || '').toLowerCase(),
      createdAt: (u) => new Date(u.createdAt || 0).getTime(),
      updatedAt: (u) => new Date(u.updatedAt || 0).getTime(),
      lastSeen: (u) => new Date(u.lastSeen || 0).getTime()
    };

    const keyFn = sortMap[sortBy] || sortMap.name;
    const desc = String(sortOrder).toLowerCase() === 'desc';
    filtered.sort((a, b) => {
      const av = keyFn(a);
      const bv = keyFn(b);
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
      return 0;
    });

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(500, Math.max(1, Number(limit) || 200));
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / limitNum));
    const start = (pageNum - 1) * limitNum;
    const data = filtered.slice(start, start + limitNum);

    res.json({
      success: true,
      data,
      stats: buildStats(filtered),
      pagination: { page: pageNum, total, pages }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, password, role, department, phone, position } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ message: 'name and email are required' });
    }

    const normalizedEmail = String(email).toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const plainPassword = String(password || generateTempPassword()).trim();
    if (plainPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const hashed = await bcrypt.hash(plainPassword, 12);
    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashed,
      role: role || 'user',
      department: department || 'Unassigned',
      phone: phone || '',
      position: position || '',
      active: true,
      lastSeen: new Date(),
      onlineStatus: 'offline'
    });

    try {
      await sendUserAccessEmail({
        to: normalizedEmail,
        name: user.name,
        password: plainPassword,
        mode: 'created'
      });
    } catch (mailError) {
      console.error('USER_WELCOME_MAIL_ERROR:', mailError.message);
    }

    await logActivity({
      req,
      actor: req.user?._id,
      actorName: req.user?.name || 'System',
      action: `created user ${user.name}`,
      actionType: 'create',
      module: 'users',
      targetModel: 'User',
      targetId: user._id,
      targetName: user.name,
      status: 'success',
      details: { role: user.role, department: user.department, email: user.email }
    });

    res.status(201).json({ success: true, data: normalizeUser(user.toObject(), {}) });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to create user' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.password;
    delete updates.refreshToken;
    if (updates.isActive !== undefined) {
      updates.active = !!updates.isActive;
      delete updates.isActive;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    }).lean();

    if (!user) return res.status(404).json({ message: 'User not found' });
    await logActivity({
      req,
      actor: req.user?._id,
      actorName: req.user?.name || 'System',
      action: `updated user ${user.name}`,
      actionType: 'update',
      module: 'users',
      targetModel: 'User',
      targetId: user._id,
      targetName: user.name,
      status: 'success',
      details: { updatedFields: Object.keys(updates || {}) }
    });
    const sessionMetaMap = await buildSessionMetaMap([user._id]);
    res.json({ success: true, data: normalizeUser(user, sessionMetaMap.get(String(user._id)) || {}) });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to update user' });
  }
});

router.patch('/:id/toggle-status', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.active = !user.active;
    if (!user.active) user.onlineStatus = 'offline';
    user.lastSeen = new Date();
    await user.save({ validateBeforeSave: false });
    await logActivity({
      req,
      actor: req.user?._id,
      actorName: req.user?.name || 'System',
      action: `${user.active ? 'activated' : 'deactivated'} user ${user.name}`,
      actionType: 'update',
      module: 'users',
      targetModel: 'User',
      targetId: user._id,
      targetName: user.name,
      status: 'success',
      details: { active: user.active }
    });

    res.json({
      success: true,
      message: `User ${user.active ? 'activated' : 'deactivated'} successfully`,
      data: normalizeUser(user.toObject())
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to toggle status' });
  }
});

router.post('/:id/reset-password', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const newPassword = generateTempPassword(12);
    user.password = await bcrypt.hash(newPassword, 12);
    user.lastSeen = new Date();
    user.onlineStatus = 'offline';
    user.refreshToken = null;
    await user.save();
    await logActivity({
      req,
      actor: req.user?._id,
      actorName: req.user?.name || 'System',
      action: `reset password for ${user.name}`,
      actionType: 'update',
      module: 'users',
      targetModel: 'User',
      targetId: user._id,
      targetName: user.name,
      status: 'success'
    });

    await sendUserAccessEmail({
      to: user.email,
      name: user.name,
      password: newPassword,
      mode: 'reset'
    });

    return res.json({
      success: true,
      message: 'Password reset successfully. New password sent via email.'
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Failed to reset password' });
  }
});

router.post('/bulk-update', async (req, res) => {
  try {
    const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
    const updates = req.body?.updates || {};
    if (!userIds.length) return res.status(400).json({ message: 'userIds is required' });

    const mapped = { ...updates };
    if (typeof updates.isActive === 'boolean') {
      mapped.active = updates.isActive;
      if (!updates.isActive) mapped.onlineStatus = 'offline';
      delete mapped.isActive;
    }

    await User.updateMany({ _id: { $in: userIds } }, { $set: mapped });
    await logActivity({
      req,
      actor: req.user?._id,
      actorName: req.user?.name || 'System',
      action: `bulk updated ${userIds.length} users`,
      actionType: 'update',
      module: 'users',
      targetModel: 'User',
      status: 'success',
      details: { userIds, updates: mapped }
    });
    res.json({ success: true, message: 'Users updated successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to bulk update users' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await logActivity({
      req,
      actor: req.user?._id,
      actorName: req.user?.name || 'System',
      action: `deleted user ${user.name}`,
      actionType: 'delete',
      module: 'users',
      targetModel: 'User',
      targetId: user._id,
      targetName: user.name,
      status: 'success'
    });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to delete user' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    const query = ids.length ? { _id: { $in: ids } } : {};
    const users = await User.find(query).lean();

    const header = 'name,email,role,department,phone,position,active,onlineStatus,loginCount,lastSeen,createdAt\n';
    const rows = users
      .map((u) => [
        u.name,
        u.email,
        u.role,
        u.department || '',
        u.phone || '',
        u.position || '',
        String(!!u.active),
        u.onlineStatus || 'offline',
        String(Number(u.loginCount) || 0),
        u.lastSeen ? new Date(u.lastSeen).toISOString() : '',
        u.createdAt ? new Date(u.createdAt).toISOString() : ''
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','))
      .join('\n');

    const csv = `${header}${rows}\n`;
    const filename = `users_export_${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: 'Failed to export users' });
  }
});

router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ message: 'CSV file is required' });

    const text = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length);
    if (lines.length < 2) return res.status(400).json({ message: 'CSV has no data rows' });

    const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
    const getIndex = (name) => headers.indexOf(name);

    const idx = {
      name: getIndex('name'),
      email: getIndex('email'),
      password: getIndex('password'),
      role: getIndex('role'),
      department: getIndex('department'),
      phone: getIndex('phone'),
      position: getIndex('position')
    };

    if (idx.name < 0 || idx.email < 0) {
      return res.status(400).json({ message: 'CSV must include name and email columns' });
    }

    let importedCount = 0;
    const errors = [];

    for (let i = 1; i < lines.length; i += 1) {
      const row = parseCSVLine(lines[i]);
      const email = String(row[idx.email] || '').toLowerCase().trim();
      const name = String(row[idx.name] || '').trim();

      if (!name || !email) continue;

      const existing = await User.findOne({ email });
      if (existing) {
        errors.push({ row: i + 1, message: `Skipped existing email: ${email}` });
        continue;
      }

      const rawPassword = idx.password >= 0 ? String(row[idx.password] || '').trim() : '';
      const password = rawPassword || `Temp@${Math.floor(100000 + Math.random() * 900000)}`;
      const hashed = await bcrypt.hash(password, 12);

      const role = idx.role >= 0 ? String(row[idx.role] || 'user').trim() : 'user';
      const department = idx.department >= 0 ? String(row[idx.department] || 'Unassigned').trim() : 'Unassigned';

      await User.create({
        name,
        email,
        password: hashed,
        role: ['user', 'team_lead', 'manager', 'admin', 'superadmin'].includes(role) ? role : 'user',
        department: department || 'Unassigned',
        phone: idx.phone >= 0 ? String(row[idx.phone] || '').trim() : '',
        position: idx.position >= 0 ? String(row[idx.position] || '').trim() : '',
        active: true,
        onlineStatus: 'offline'
      });

      try {
        await sendUserAccessEmail({
          to: email,
          name,
          password,
          mode: 'created'
        });
      } catch (mailError) {
        errors.push({ row: i + 1, message: `Created user but failed to email credentials to ${email}` });
      }

      importedCount += 1;
    }

    res.status(200).json({
      success: true,
      importedCount,
      skippedCount: errors.length,
      errors
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to import users' });
  }
});

module.exports = router;
