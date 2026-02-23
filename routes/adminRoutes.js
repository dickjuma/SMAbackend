const express = require('express');
const router = express.Router();
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const UserSession = require('../models/UserSession');

const toMinutesLabel = (mins = 0) => `${Math.max(0, Math.round(mins))}m`;

const getTimeAgo = (date) => {
  if (!date) return 'just now';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const normalizeLog = (log) => {
  const timestamp = log.createdAt || log.timestamp || new Date();
  return {
    _id: log._id,
    id: log._id,
    actor: log.actor,
    actorName: log.actorName || 'System',
    action: log.action || '',
    displayAction: log.action || '',
    actionType: log.actionType || 'other',
    module: log.module || 'system',
    target: log.targetName || log.targetId || '',
    targetName: log.targetName || '',
    targetId: log.targetId || '',
    message: log.message || log.action || 'Activity event',
    status: log.status || 'success',
    details: log.details || {},
    timestamp,
    createdAt: timestamp,
    timeAgo: getTimeAgo(timestamp),
    onlineDurationLabel: log.details?.onlineDurationLabel || '-'
  };
};

router.get('/activity', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 300);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;

    const filters = {};
    if (req.query.userId) filters.actor = req.query.userId;
    if (req.query.module) filters.module = String(req.query.module).toLowerCase();
    if (req.query.actionType) filters.actionType = String(req.query.actionType).toLowerCase();
    if (req.query.status) filters.status = String(req.query.status).toLowerCase();
    if (req.query.search) {
      const pattern = String(req.query.search).trim();
      filters.$or = [
        { actorName: { $regex: pattern, $options: 'i' } },
        { action: { $regex: pattern, $options: 'i' } },
        { module: { $regex: pattern, $options: 'i' } },
        { targetName: { $regex: pattern, $options: 'i' } },
        { message: { $regex: pattern, $options: 'i' } }
      ];
    }

    const [rows, total] = await Promise.all([
      ActivityLog.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ActivityLog.countDocuments(filters)
    ]);

    const normalized = rows.map(normalizeLog);
    res.json({
      success: true,
      notifications: normalized,
      activities: normalized,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load activity' });
  }
});

router.get('/users/:id/activity', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const limit = Math.min(Number(req.query.limit) || 100, 400);
    const actionType = req.query.actionType ? String(req.query.actionType).toLowerCase() : '';
    const moduleFilter = req.query.module ? String(req.query.module).toLowerCase() : '';

    const activityQuery = { actor: user._id };
    if (actionType) activityQuery.actionType = actionType;
    if (moduleFilter) activityQuery.module = moduleFilter;

    const logs = await ActivityLog.find(activityQuery).sort({ createdAt: -1 }).limit(limit).lean();

    const [allSessions, activeSession, dailySessions] = await Promise.all([
      UserSession.find({ user: user._id, status: 'ended' }).select('durationSeconds connectedAt disconnectedAt').lean(),
      UserSession.findOne({ user: user._id, status: 'active' }).sort({ connectedAt: -1 }).lean(),
      UserSession.aggregate([
        { $match: { user: user._id } },
        {
          $project: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$connectedAt' } },
            durationSeconds: '$durationSeconds'
          }
        },
        {
          $group: {
            _id: '$day',
            totalSeconds: { $sum: '$durationSeconds' },
            sessions: { $sum: 1 }
          }
        },
        { $sort: { _id: -1 } },
        { $limit: 14 }
      ])
    ]);

    const endedSeconds = allSessions.reduce((sum, s) => sum + Number(s.durationSeconds || 0), 0);
    const totalSessions = allSessions.length + (activeSession ? 1 : 0);
    const activeSeconds = activeSession
      ? Math.max(0, Math.round((Date.now() - new Date(activeSession.connectedAt).getTime()) / 1000))
      : 0;
    const totalSeconds = endedSeconds + activeSeconds;
    const averageSeconds = totalSessions ? Math.round(totalSeconds / totalSessions) : 0;

    const chart = dailySessions
      .map((row) => ({
        date: row._id,
        minutes: Math.round(Number(row.totalSeconds || 0) / 60),
        sessions: Number(row.sessions || 0)
      }))
      .reverse();

    const sessionStats = {
      totalSessions,
      totalTimeLabel: toMinutesLabel(totalSeconds / 60),
      averageSessionLabel: toMinutesLabel(averageSeconds / 60),
      currentSessionLabel: activeSession ? toMinutesLabel(activeSeconds / 60) : '-',
      lastSignedInAt: user.lastLogin || null,
      onlineStatus: user.onlineStatus || 'offline',
      chart
    };

    res.json({
      success: true,
      logs: logs.map(normalizeLog),
      activities: logs.map(normalizeLog),
      sessionStats
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load user activity' });
  }
});

module.exports = router;
