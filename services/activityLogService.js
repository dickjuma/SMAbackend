const ActivityLog = require('../models/ActivityLog');
const { emitActivity } = require('./realtimeService');

const methodToActionType = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
  GET: 'read'
};

const methodToVerb = {
  POST: 'created',
  PUT: 'updated',
  PATCH: 'updated',
  DELETE: 'deleted',
  GET: 'viewed'
};

const deriveModule = (path = '') => {
  const segments = String(path || '').split('/').filter(Boolean);
  const apiIdx = segments.indexOf('api');
  if (apiIdx >= 0 && segments[apiIdx + 1]) return segments[apiIdx + 1];
  return segments[0] || 'system';
};

const clip = (value, max = 180) => {
  const str = String(value || '');
  return str.length > max ? `${str.slice(0, max)}...` : str;
};

const sanitizeBody = (body = {}) => {
  if (!body || typeof body !== 'object') return {};
  const clone = { ...body };
  ['password', 'currentPassword', 'newPassword', 'refreshToken', 'token'].forEach((k) => {
    if (clone[k] !== undefined) clone[k] = '***';
  });
  return clone;
};

const moduleLabelMap = {
  clients: 'client',
  invoices: 'invoice',
  quotations: 'quotation',
  receipts: 'receipt',
  users: 'user',
  profile: 'profile',
  settings: 'settings',
  email: 'email',
  finance: 'finance',
  auth: 'authentication'
};

const actionLabelMap = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
  read: 'viewed',
  auth: 'performed auth action',
  presence: 'updated presence',
  other: 'updated'
};

const normalizeTargetText = (targetName, targetId, module) => {
  const label = moduleLabelMap[module] || module || 'record';
  if (targetName) return `${label} (${targetName})`;
  if (targetId) return `${label} #${targetId}`;
  return label;
};

const formatFromDetails = ({ module, details = {}, targetName, targetId }) => {
  const changedFields = Array.isArray(details.changedFields) ? details.changedFields : [];
  const recipients = Array.isArray(details.recipients) ? details.recipients : [];
  const recipient = details.recipient || recipients[0] || '';

  if (module === 'clients' && changedFields.length > 0) {
    return `updated details for ${normalizeTargetText(targetName, targetId, module)}`;
  }
  if (module === 'email' && recipient) {
    return `sent email to ${recipient}`;
  }
  if ((module === 'invoices' || module === 'quotations' || module === 'receipts') && recipient) {
    return `sent ${moduleLabelMap[module]} to ${recipient}`;
  }
  return '';
};

const formatActivityMessage = ({ actorName, actionType, module, targetId, targetName, action = '', details = {} }) => {
  const actor = actorName || 'System';
  const normalizedAction = String(action || '').trim();
  if (normalizedAction) {
    const prefixed = normalizedAction.toLowerCase().startsWith(actor.toLowerCase())
      ? normalizedAction
      : `${actor} ${normalizedAction}`;
    return prefixed;
  }

  const type = actionType || 'other';
  const moduleLabel = module || 'system';
  const detailsText = formatFromDetails({ module: moduleLabel, details, targetName, targetId });
  if (detailsText) return `${actor} ${detailsText}`;

  const verb = actionLabelMap[type] || 'updated';
  const targetText = normalizeTargetText(targetName, targetId, moduleLabel);
  return `${actor} ${verb} ${targetText}`;
};

async function logActivity({
  req,
  actor = null,
  actorName = null,
  action = '',
  actionType = 'other',
  module = null,
  targetModel = '',
  targetId = '',
  targetName = '',
  status = 'success',
  details = {}
} = {}) {
  try {
    const resolvedActor = actor || req?.user?._id || null;
    const resolvedActorName = actorName || req?.user?.name || 'System';
    const resolvedModule = module || deriveModule(req?.originalUrl || req?.url || '');
    const resolvedActionType = actionType || methodToActionType[req?.method] || 'other';
    const resolvedAction = action || `${methodToVerb[req?.method] || 'did'} ${resolvedModule}`;

    const payload = await ActivityLog.create({
      actor: resolvedActor,
      actorName: resolvedActorName,
      action: resolvedAction,
      actionType: resolvedActionType,
      module: resolvedModule,
      targetModel,
      targetId: String(targetId || ''),
      targetName: String(targetName || ''),
      message: formatActivityMessage({
        actorName: resolvedActorName,
        actionType: resolvedActionType,
        module: resolvedModule,
        targetId,
        targetName,
        action: action || '',
        details
      }),
      status: status === 'failed' ? 'failed' : 'success',
      details,
      meta: {
        method: req?.method || '',
        path: req?.originalUrl || req?.url || '',
        ip: req?.ip || '',
        userAgent: clip(req?.headers?.['user-agent'] || '')
      }
    });

    emitActivity({
      _id: payload._id,
      actor: payload.actor,
      actorName: payload.actorName,
      action: payload.action,
      actionType: payload.actionType,
      module: payload.module,
      targetId: payload.targetId,
      targetName: payload.targetName,
      message: payload.message,
      status: payload.status,
      createdAt: payload.createdAt
    });

    return payload;
  } catch (error) {
    console.error('ACTIVITY_LOG_ERROR:', error.message);
    return null;
  }
}

function createHttpActivityLogger() {
  return (req, res, next) => {
    const method = String(req.method || '').toUpperCase();
    const shouldTrack = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (!shouldTrack) return next();

    const excludedPrefixes = ['/api/admin/activity', '/api/auth/refresh-token', '/api/auth/validate-token'];
    if (excludedPrefixes.some((prefix) => String(req.originalUrl || '').startsWith(prefix))) return next();

    const start = Date.now();
    const bodySnapshot = sanitizeBody(req.body || {});

    res.on('finish', () => {
      const statusCode = Number(res.statusCode || 500);
      if (!req.user) return;

      const module = deriveModule(req.originalUrl || '');
      const targetId = req.params?.id || req.body?.id || '';
      const actionType = methodToActionType[method] || 'other';

      logActivity({
        req,
        actionType,
        module,
        targetId,
        status: statusCode >= 400 ? 'failed' : 'success',
        details: {
          statusCode,
          durationMs: Date.now() - start,
          changedFields: Object.keys(bodySnapshot || {}),
          body: bodySnapshot
        }
      });
    });

    next();
  };
}

module.exports = {
  logActivity,
  createHttpActivityLogger
};
