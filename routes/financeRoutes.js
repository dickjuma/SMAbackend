const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const dispatchService = require('../services/DispatchService.js.js');
const AppSettings = require('../models/AppSettings');
const EmailLog = require('../models/EmailLog');
const EmailDraft = require('../models/EmailDraft');
const Client = require('../models/client');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.resolve(__dirname, '../uploads/temp')),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname || '')}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const normalizeList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch (error) {
      return value.split(',').map((v) => v.trim()).filter(Boolean);
    }
  }
  return [];
};

const parseMode = (mode) => (String(mode || '').toLowerCase() === 'bulk' ? 'bulk' : 'single');

const getProviderName = () => (process.env.RESEND_API_KEY ? 'resend' : 'smtp');

const defaultSignatures = (user) => ([
  {
    _id: 'default-professional',
    name: 'Finance Professional',
    content: `\n\nBest regards,\n${user?.name || 'SMA Finance Team'}\nFinance Department\nSMA Systems\nfinance@smassystems.com`
  },
  {
    _id: 'default-brief',
    name: 'Short Signature',
    content: `\n\nRegards,\n${user?.name || 'SMA Team'}\nSMA Systems`
  },
  {
    _id: 'default-formal',
    name: 'Formal Signature',
    content: `\n\nSincerely,\n${user?.name || 'SMA Finance Team'}\nFinance Department\nSMA Systems\nfinance@smassystems.com\n+254 719 832 719`
  }
]);

const templateMap = {
  formal: {
    key: 'formal',
    name: 'Corporate Formal',
    subject: ({ type = 'Document', number = 'N/A', clientName = 'Client' }) => `${type} ${number} - ${clientName}`,
    body: ({ type = 'document', clientName = 'Client', number = 'N/A' }) =>
      `Dear ${clientName},\n\nPlease find attached your ${type.toLowerCase()} ${number} for your records.\n\nKind regards,\nFinance Department\nSMA Systems`
  },
  reminder: {
    key: 'reminder',
    name: 'Payment Reminder',
    subject: ({ type = 'Invoice', number = 'N/A' }) => `Reminder: ${type} ${number} - Payment Due`,
    body: ({ clientName = 'Client', type = 'invoice', number = 'N/A' }) =>
      `Hello ${clientName},\n\nThis is a reminder regarding ${type.toLowerCase()} ${number}.\n\nPlease process payment by the due date.\n\nThank you,\nSMA Finance Team`
  },
  urgent: {
    key: 'urgent',
    name: 'Priority Notice',
    subject: ({ type = 'Document', number = 'N/A' }) => `URGENT: ${type} ${number} - Action Required`,
    body: ({ clientName = 'Client', type = 'document', number = 'N/A' }) =>
      `Attention ${clientName},\n\nYour ${type.toLowerCase()} ${number} requires immediate attention.\n\nRegards,\nFinance Department`
  }
};

const getTemplateByKey = (key) => templateMap[key] || templateMap.formal;

const calculateStats = (emails = []) => {
  const normalized = (emails || []).map((e) => decorateHistoryItem(e));
  const totalSent = normalized.length;
  const sentCount = normalized.filter((e) => e.status === 'sent').length;
  const failedCount = normalized.filter((e) => e.status === 'failed').length;
  const partialCount = normalized.filter((e) => e.status === 'partial').length;
  const delivered = totalSent === 0 ? 0 : Math.round(((sentCount + partialCount) / totalSent) * 100);
  const bounceRate = totalSent === 0 ? 0 : Math.round((failedCount / totalSent) * 100);

  const totalOpenCount = normalized.reduce((acc, e) => acc + Number(e?.metadata?.openCount || 0), 0);
  const totalClickCount = normalized.reduce((acc, e) => acc + Number(e?.metadata?.clickCount || 0), 0);
  const openRate = totalSent === 0 ? 0 : Math.round((totalOpenCount / totalSent) * 100);
  const clickRate = totalSent === 0 ? 0 : Math.round((totalClickCount / totalSent) * 100);

  return {
    totalSent,
    delivered,
    bounceRate,
    openRate,
    clickRate,
    unsubscribes: 0
  };
};

const getModelName = (rawType) => {
  const type = String(rawType || '').toLowerCase();
  if (type === 'invoice') return 'Invoice';
  if (type === 'quotation' || type === 'quote') return 'Quotation';
  if (type === 'receipt') return 'Receipt';
  if (type === 'service') return 'Service';
  return '';
};

const getDocNumber = (doc) =>
  doc?.invoiceNumber || doc?.quotationNumber || doc?.receiptNumber || doc?.serviceNumber || doc?.documentNumber || '';

const decorateHistoryItem = (log = {}) => {
  const recipients = Array.isArray(log.recipients) ? log.recipients.filter(Boolean) : [];
  const recipientResults = Array.isArray(log.recipientResults) ? log.recipientResults : [];
  const normalizedStatus = String(log.status || 'draft').toLowerCase();

  const enrichedResults = recipientResults.length > 0
    ? recipientResults.map((r) => ({
      email: r.email || '',
      status: String(r.status || normalizedStatus || 'sent').toLowerCase(),
      messageId: r.messageId || '',
      error: r.error || '',
      clientName: r.clientName || '',
      documentType: r.documentType || log.documentModel || ''
    }))
    : recipients.map((email) => ({
      email,
      status: normalizedStatus === 'failed' ? 'failed' : 'sent',
      messageId: '',
      error: '',
      clientName: '',
      documentType: log.documentModel || ''
    }));

  return {
    ...log,
    status: normalizedStatus,
    sentAt: log.sentAt || log.createdAt || new Date().toISOString(),
    recipients,
    recipientResults: enrichedResults
  };
};

async function getRegistryHandler(req, res) {
  try {
    const Invoice = require('../models/invoice');
    const Quotation = require('../models/quotation');
    const Service = require('../models/service');
    const Client = require('../models/client');

    const [allInvoices, quotations, services, clients] = await Promise.all([
      Invoice.find().sort({ createdAt: -1 }).populate('client'),
      Quotation.find().sort({ createdAt: -1 }).populate('client'),
      Service.find().sort({ createdAt: -1 }).populate('client'),
      Client.find().sort({ name: 1 })
    ]);

    const payload = {
      Invoices: allInvoices.filter((inv) => String(inv.status || '').toUpperCase() !== 'PAID'),
      Receipts: allInvoices.filter((inv) => String(inv.status || '').toUpperCase() === 'PAID'),
      Quotations: quotations,
      Services: services,
      Clients: clients
    };

    res.json(payload);
  } catch (err) {
    console.error('Registry Fetch Error:', err);
    res.status(500).json({ success: false, error: 'Failed to sync with local registry.' });
  }
}

async function createEmailLog({ req, payload, result, uploadedFiles, dispatchPayload }) {
  const mode = parseMode(payload.mode);
  const recipients = mode === 'bulk'
    ? normalizeList(payload.recipients)
    : normalizeList(payload.recipient);

  let recipientResults = [];
  let status = 'sent';
  const clientLookup = recipients.length
    ? await Client.find({ email: { $in: recipients } }).select('name email').lean()
    : [];
  const clientByEmail = new Map(clientLookup.map((c) => [String(c.email || '').toLowerCase(), c.name || '']));
  const documentModel = getModelName(payload.type);

  if (mode === 'bulk' && Array.isArray(result)) {
    recipientResults = result.map((item) => ({
      email: item.email,
      status: item.status === 'failed' ? 'failed' : 'sent',
      messageId: item.messageId || '',
      error: item.error || '',
      clientName: clientByEmail.get(String(item.email || '').toLowerCase()) || '',
      documentType: documentModel || ''
    }));
    const failed = recipientResults.filter((r) => r.status === 'failed').length;
    status = failed === 0 ? 'sent' : failed === recipientResults.length ? 'failed' : 'partial';
  } else {
    recipientResults = recipients.map((email) => ({
      email,
      status: 'sent',
      messageId: result?.messageId || result?.id || '',
      clientName: clientByEmail.get(String(email || '').toLowerCase()) || '',
      documentType: documentModel || ''
    }));
    status = result?.error ? 'failed' : 'sent';
  }

  const generatedFiles = [];
  if (mode === 'single' && payload.docId) {
    generatedFiles.push(`${documentModel || 'Document'}_${String(payload.docId).slice(-6).toUpperCase()}.pdf`);
  }

  const log = await EmailLog.create({
    mode,
    status,
    subject: payload.subject || '',
    message: payload.message || '',
    recipients,
    cc: normalizeList(payload.cc),
    bcc: normalizeList(payload.bcc),
    documentModel,
    documentId: payload.docId || '',
    clientNames: normalizeList(payload.clientNames).length > 0
      ? normalizeList(payload.clientNames)
      : recipientResults.map((r) => r.clientName).filter(Boolean),
    generatedFiles,
    recipientResults,
    sentBy: req.user?._id || null,
    sentAt: new Date(),
    provider: getProviderName(),
    metadata: {
      dispatchPayload,
      fileCount: (uploadedFiles || []).length
    }
  });

  return log;
}

async function dispatchHandler(req, res) {
  try {
    const mode = parseMode(req.body?.mode);
    const recipients = normalizeList(req.body?.recipients);
    const cc = normalizeList(req.body?.cc);
    const bcc = normalizeList(req.body?.bcc);
    const attachments = req.files || [];

    const payload = {
      ...req.body,
      mode,
      recipients,
      cc,
      bcc
    };

    if (mode === 'single') {
      if (!payload.docId) {
        return res.status(400).json({ success: false, message: 'docId is required for single mode' });
      }
    } else if (recipients.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one recipient is required for bulk mode' });
    }

    const dispatchPayload = {
      mode,
      docId: payload.docId,
      type: payload.type,
      subject: payload.subject,
      message: payload.message,
      recipients,
      cc,
      bcc
    };

    const result = await dispatchService.processEmailDispatch(payload, attachments);
    const log = await createEmailLog({ req, payload, result, uploadedFiles: attachments, dispatchPayload });

    res.status(200).json({
      success: true,
      message: 'Dispatch relay successful',
      messageId: Array.isArray(result) ? null : (result?.messageId || result?.id || null),
      data: log,
      generatedFiles: log.generatedFiles || []
    });
  } catch (err) {
    console.error('Dispatch Route Error:', err);
    res.status(502).json({ success: false, message: err.message || 'Relay failure. Check email settings.' });
  }
}

router.get('/registry', getRegistryHandler);
router.get('/registry/data', getRegistryHandler);

router.post('/dispatch', upload.any(), dispatchHandler);
router.post('/send', upload.any(), dispatchHandler);

router.get('/signatures', async (req, res) => {
  res.json({ success: true, data: defaultSignatures(req.user) });
});

router.get('/templates', async (req, res) => {
  const templates = Object.values(templateMap).map((t) => ({ key: t.key, name: t.name }));
  res.json({ success: true, data: templates });
});

router.get('/drafts', async (req, res) => {
  try {
    const drafts = await EmailDraft.find({ createdBy: req.user._id }).sort({ updatedAt: -1 }).limit(100);
    res.json({ success: true, data: drafts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load drafts' });
  }
});

router.post('/drafts', async (req, res) => {
  try {
    const draft = await EmailDraft.create({
      subject: req.body?.subject || '',
      message: req.body?.message || '',
      mode: parseMode(req.body?.mode),
      recipients: normalizeList(req.body?.recipients),
      cc: normalizeList(req.body?.cc),
      bcc: normalizeList(req.body?.bcc),
      documentModel: getModelName(req.body?.type),
      documentId: req.body?.docId || '',
      createdBy: req.user._id
    });
    res.json({ success: true, data: draft });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Failed to save draft' });
  }
});

router.delete('/drafts/:id', async (req, res) => {
  try {
    await EmailDraft.deleteOne({ _id: req.params.id, createdBy: req.user._id });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Failed to delete draft' });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const doc = await AppSettings.findOne({ key: 'app' }).lean();
    const data = doc?.data || {};
    const settings = {
      fromName: data?.integrations?.smtpFromName || 'SMA System',
      replyTo: data?.integrations?.smtpReplyTo || 'finance@smassystems.com',
      provider: getProviderName(),
      financeWebhookUrl: data?.integrations?.financeWebhookUrl || '',
      emailComposer: data?.emailComposer || {}
    };
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch email settings' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const current = await AppSettings.findOne({ key: 'app' }).lean();
    const currentData = current?.data || {};
    const nextData = {
      ...currentData,
      integrations: {
        ...(currentData.integrations || {}),
        smtpFromName: req.body?.fromName || currentData?.integrations?.smtpFromName || 'SMA System',
        smtpReplyTo: req.body?.replyTo || currentData?.integrations?.smtpReplyTo || 'finance@smassystems.com',
        financeWebhookUrl: req.body?.financeWebhookUrl || currentData?.integrations?.financeWebhookUrl || ''
      },
      emailComposer: {
        ...(currentData.emailComposer || {}),
        ...(req.body?.emailComposer || {})
      }
    };

    const doc = await AppSettings.findOneAndUpdate(
      { key: 'app' },
      { $set: { data: nextData } },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: doc.data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save email settings' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const period = String(req.query?.period || '30d');
    const days = Number(period.replace(/[^\d]/g, '')) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const emails = await EmailLog.find({ sentAt: { $gte: since } }).lean();
    const stats = calculateStats(emails);
    res.json({ success: true, data: stats, ...stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load email stats' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const filter = String(req.query?.filter || 'all').toLowerCase();
    const search = String(req.query?.search || '').trim();
    const limit = Math.min(Number(req.query?.limit) || 50, 200);
    const page = Math.max(Number(req.query?.page) || 1, 1);
    const skip = (page - 1) * limit;

    const query = {};
    if (filter !== 'all') query.status = filter;
    if (req.query?.startDate || req.query?.endDate) {
      query.sentAt = {};
      if (req.query?.startDate) query.sentAt.$gte = new Date(req.query.startDate);
      if (req.query?.endDate) query.sentAt.$lte = new Date(req.query.endDate);
    }
    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { recipients: { $elemMatch: { $regex: search, $options: 'i' } } },
        { clientNames: { $elemMatch: { $regex: search, $options: 'i' } } },
        { documentModel: { $regex: search, $options: 'i' } }
      ];
    }

    const [emails, total] = await Promise.all([
      EmailLog.find(query).sort({ sentAt: -1 }).skip(skip).limit(limit).lean(),
      EmailLog.countDocuments(query)
    ]);
    const normalizedEmails = emails.map(decorateHistoryItem);
    const pagination = { total, page, limit, pages: Math.ceil(total / limit) };

    res.json({
      success: true,
      emails: normalizedEmails,
      pagination,
      data: {
        emails: normalizedEmails,
        pagination
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load email history' });
  }
});

router.get('/clients/bulk', async (req, res) => {
  try {
    const Client = require('../models/client');
    const search = String(req.query?.search || '').trim();
    const query = search
      ? { $or: [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }] }
      : {};
    const clients = await Client.find(query).select('name email company phone').sort({ name: 1 }).limit(500).lean();
    res.json({ success: true, data: clients });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load clients' });
  }
});

router.post('/template/apply', async (req, res) => {
  const templateName = String(req.body?.templateName || 'formal');
  const docType = String(req.body?.documentType || 'Document');
  const docNumber = String(req.body?.documentNumber || 'N/A');
  const clientName = String(req.body?.clientName || 'Client');
  const template = getTemplateByKey(templateName);

  res.json({
    success: true,
    data: {
      templateName: template.key,
      subject: template.subject({ type: docType, number: docNumber, clientName }),
      message: template.body({ type: docType, number: docNumber, clientName }),
      body: template.body({ type: docType, number: docNumber, clientName })
    }
  });
});

router.post('/test', async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(400).json({ success: false, message: 'No user email found for test dispatch' });

    const result = await dispatchService.processEmailDispatch(
      {
        mode: 'bulk',
        recipients: [email],
        subject: 'SMA Email Composer Test',
        message: 'This is a test email from Email Composer.'
      },
      []
    );

    const log = await EmailLog.create({
      mode: 'bulk',
      status: 'sent',
      subject: 'SMA Email Composer Test',
      message: 'This is a test email from Email Composer.',
      recipients: [email],
      recipientResults: [{ email, status: 'sent', messageId: Array.isArray(result) ? (result[0]?.messageId || '') : (result?.messageId || '') }],
      sentBy: req.user?._id || null,
      provider: getProviderName()
    });

    res.json({ success: true, message: 'Test email sent successfully', data: log });
  } catch (error) {
    res.status(502).json({ success: false, message: error.message || 'Failed to send test email' });
  }
});

router.get('/health', async (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    provider: getProviderName(),
    resendConfigured: Boolean(process.env.RESEND_API_KEY)
  });
});

router.post('/bulk/operations', async (req, res) => {
  try {
    const action = String(req.body?.action || '').toLowerCase();
    const ids = normalizeList(req.body?.ids);
    if (!action || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'action and ids are required' });
    }

    if (action === 'delete') {
      await EmailLog.deleteMany({ _id: { $in: ids } });
      return res.json({ success: true, data: { deleted: ids.length } });
    }

    if (action === 'resend') {
      const logs = await EmailLog.find({ _id: { $in: ids } }).lean();
      const results = [];
      for (const log of logs) {
        try {
          const payload = log?.metadata?.dispatchPayload || {
            mode: log.mode,
            docId: log.documentId,
            type: log.documentModel,
            subject: log.subject,
            message: log.message,
            recipients: log.recipients
          };
          await dispatchService.processEmailDispatch(payload, []);
          results.push({ id: String(log._id), status: 'sent' });
        } catch (error) {
          results.push({ id: String(log._id), status: 'failed', error: error.message });
        }
      }
      return res.json({ success: true, data: results });
    }

    return res.status(400).json({ success: false, message: 'Unsupported bulk action' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Bulk operation failed' });
  }
});

router.get('/analytics/overview', async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const emails = await EmailLog.find({ sentAt: { $gte: since } }).sort({ sentAt: 1 }).lean();
    const stats = calculateStats(emails);
    const byDay = {};
    emails.forEach((email) => {
      const key = new Date(email.sentAt).toISOString().slice(0, 10);
      byDay[key] = (byDay[key] || 0) + 1;
    });
    const trend = Object.entries(byDay).map(([date, total]) => ({ date, total }));
    res.json({ success: true, data: { ...stats, trend } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load analytics overview' });
  }
});

router.get('/track/open/:trackingId', async (req, res) => {
  try {
    await EmailLog.updateOne(
      { _id: req.params.trackingId },
      { $set: { 'metadata.lastOpenedAt': new Date() }, $inc: { 'metadata.openCount': 1 } }
    );
  } catch (error) {
    // Ignore tracking failures to avoid blocking the pixel response
  }

  const pixel = Buffer.from('R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.end(pixel);
});

router.get('/track/click/:trackingId', async (req, res) => {
  const targetUrl = String(req.query?.url || '').trim();
  if (!targetUrl) return res.status(400).json({ success: false, message: 'Missing target url' });

  try {
    await EmailLog.updateOne(
      { _id: req.params.trackingId },
      { $set: { 'metadata.lastClickedAt': new Date(), 'metadata.lastClickedUrl': targetUrl }, $inc: { 'metadata.clickCount': 1 } }
    );
  } catch (error) {
    // Ignore tracking failures and still redirect user.
  }

  return res.redirect(targetUrl);
});

router.post('/:id/resend', async (req, res) => {
  try {
    const log = await EmailLog.findById(req.params.id).lean();
    if (!log) return res.status(404).json({ success: false, message: 'Email log not found' });

    const payload = log?.metadata?.dispatchPayload || {
      mode: log.mode,
      docId: log.documentId,
      type: log.documentModel,
      subject: log.subject,
      message: log.message,
      recipients: log.recipients
    };

    const result = await dispatchService.processEmailDispatch(payload, []);
    const newLog = await createEmailLog({
      req,
      payload,
      result,
      uploadedFiles: [],
      dispatchPayload: { ...payload, resendOf: String(log._id) }
    });

    res.json({ success: true, message: 'Email resent successfully', data: newLog });
  } catch (error) {
    res.status(502).json({ success: false, message: error.message || 'Failed to resend email' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const email = await EmailLog.findById(req.params.id).lean();
    if (!email) return res.status(404).json({ success: false, message: 'Email log not found' });
    res.json({ success: true, data: email });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Invalid email id' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await EmailLog.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Failed to delete email log' });
  }
});

module.exports = router;
