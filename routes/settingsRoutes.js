const express = require('express');
const router = express.Router();
const AppSettings = require('../models/AppSettings');

const isAdminUser = (user) => {
  const role = String(user?.role || '').toLowerCase();
  return role === 'admin' || role === 'superadmin';
};

const adminOnlySections = new Set(['company', 'documents', 'notifications', 'security', 'integrations']);

const defaultAppSettings = {
  appearance: { theme: 'dark', density: 'cozy', primaryColor: '#0f172a' },
  company: {
    legalName: 'SMA Technologies Limited',
    supportEmail: 'finance@smassystems.com',
    supportPhone: '+254 719 832 719',
    website: 'www.smacore.co.ke',
    addressLine1: '123 Business Street',
    addressLine2: 'Nairobi, Kenya',
    city: 'Nairobi',
    country: 'Kenya',
    taxPin: ''
  },
  general: {
    defaultCurrency: 'KES',
    timezone: 'Africa/Nairobi',
    dateFormat: 'DD/MM/YYYY',
    language: 'en',
    fiscalYearStart: '01-01'
  },
  notifications: {
    emailNotifications: true,
    invoicePaid: true,
    invoiceOverdue: true,
    newClientCreated: true,
    dailyDigest: false,
    weeklyReport: true
  },
  security: {
    sessionTimeoutMins: 480,
    passwordMinLength: 8,
    require2FA: false,
    allowConcurrentSessions: true
  },
  integrations: {
    smtpFromName: 'SMA System',
    smtpReplyTo: 'finance@smassystems.com',
    financeWebhookUrl: ''
  },
  documents: {
    invoice: {
      title: 'INVOICE', companyName: 'SMA TECHNOLOGIES', tagline: 'Enterprise Resource Management',
      addressLine1: '123 Business Street', addressLine2: 'Nairobi, Kenya', phone: '+254 719 832 719',
      email: 'finance@smassystems.com', website: 'www.smacore.co.ke', taxIdLabel: 'KRA PIN',
      taxIdValue: '', footerNote: 'Thank you for your business!', logoUrl: '', prefix: 'INV',
      suffix: '', nextNumber: 1, paymentTermsDays: 30, defaultNotes: '', showLogo: true
    },
    quotation: {
      title: 'QUOTATION', companyName: 'SMA TECHNOLOGIES', tagline: 'Enterprise Resource Management',
      addressLine1: '123 Business Street', addressLine2: 'Nairobi, Kenya', phone: '+254 719 832 719',
      email: 'finance@smassystems.com', website: 'www.smacore.co.ke', taxIdLabel: 'KRA PIN',
      taxIdValue: '', footerNote: 'Thank you for your business!', logoUrl: '', prefix: 'QTN',
      suffix: '', nextNumber: 1, paymentTermsDays: 30, defaultNotes: '', showLogo: true
    },
    receipt: {
      title: 'RECEIPT', companyName: 'SMA TECHNOLOGIES', tagline: 'Enterprise Resource Management',
      addressLine1: '123 Business Street', addressLine2: 'Nairobi, Kenya', phone: '+254 719 832 719',
      email: 'finance@smassystems.com', website: 'www.smacore.co.ke', taxIdLabel: 'KRA PIN',
      taxIdValue: '', footerNote: 'Thank you for your business!', logoUrl: '', prefix: 'RCT',
      suffix: '', nextNumber: 1, paymentTermsDays: 30, defaultNotes: '', showLogo: true
    }
  }
};

const mergeSettings = (remote = {}) => ({
  appearance: { ...defaultAppSettings.appearance, ...(remote.appearance || {}) },
  company: { ...defaultAppSettings.company, ...(remote.company || {}) },
  general: { ...defaultAppSettings.general, ...(remote.general || {}) },
  notifications: { ...defaultAppSettings.notifications, ...(remote.notifications || {}) },
  security: { ...defaultAppSettings.security, ...(remote.security || {}) },
  integrations: { ...defaultAppSettings.integrations, ...(remote.integrations || {}) },
  documents: {
    invoice: { ...defaultAppSettings.documents.invoice, ...(remote.documents?.invoice || {}) },
    quotation: { ...defaultAppSettings.documents.quotation, ...(remote.documents?.quotation || {}) },
    receipt: { ...defaultAppSettings.documents.receipt, ...(remote.documents?.receipt || {}) }
  }
});

const buildPatchFromPayload = (payload = {}, user) => {
  const patch = {};
  const canManageAll = isAdminUser(user);

  Object.keys(payload || {}).forEach((key) => {
    if (key === 'documents') {
      const docs = payload.documents || {};
      if (!canManageAll) return;
      patch.documents = {
        invoice: docs.invoice || undefined,
        quotation: docs.quotation || undefined,
        receipt: docs.receipt || undefined
      };
      return;
    }

    if (adminOnlySections.has(key) && !canManageAll) return;
    if (!['appearance', 'company', 'general', 'notifications', 'security', 'integrations'].includes(key)) return;
    patch[key] = payload[key];
  });

  return patch;
};

async function getSettingsDoc() {
  let doc = await AppSettings.findOne({ key: 'app' });
  if (!doc) {
    doc = await AppSettings.create({ key: 'app', data: defaultAppSettings });
  }
  return doc;
}

router.get('/', async (req, res) => {
  try {
    const doc = await getSettingsDoc();
    const data = mergeSettings(doc?.data || {});
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
});

router.put('/', async (req, res) => {
  try {
    const currentDoc = await getSettingsDoc();
    const incomingPatch = buildPatchFromPayload(req.body || {}, req.user);
    const merged = mergeSettings({
      ...(currentDoc?.data || {}),
      ...incomingPatch,
      documents: {
        ...(currentDoc?.data?.documents || {}),
        ...(incomingPatch.documents || {})
      }
    });

    const doc = await AppSettings.findOneAndUpdate(
      { key: 'app' },
      { $set: { data: merged } },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: doc.data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save settings' });
  }
});

router.post('/reset', async (req, res) => {
  try {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({ success: false, message: 'Only admin users can reset system settings' });
    }

    const doc = await AppSettings.findOneAndUpdate(
      { key: 'app' },
      { $set: { data: defaultAppSettings } },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: doc.data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to reset settings' });
  }
});

module.exports = router;
