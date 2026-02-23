const Invoice = require('../models/invoice');
const dispatchService = require('../services/DispatchService.js.js');

const normalizeStatus = (status) => {
  const value = String(status || 'DRAFT').toUpperCase().trim();
  if (value === 'NOT PAID' || value === 'UNPAID') return 'SENT';
  return value;
};

const computeTotals = (payload = {}) => {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const normalizedItems = items.map((item) => {
    const quantity = Number(item?.quantity || 0);
    const price = Number(item?.price || 0);
    const total = Number(item?.total ?? quantity * price);
    return {
      ...item,
      quantity,
      price,
      total
    };
  });

  const subtotal = Number(payload.subtotal ?? normalizedItems.reduce((sum, item) => sum + Number(item.total || 0), 0));
  const tax = Number(payload.tax || 0);
  const discount = Number(payload.discount || 0);
  const taxAmount = (subtotal * tax) / 100;
  const total = Number(payload.total ?? subtotal + taxAmount - discount);
  const paidAmount = Number(payload.paidAmount || 0);

  return {
    ...payload,
    items: normalizedItems,
    subtotal,
    tax,
    discount,
    total,
    paidAmount,
    balance: Math.max(0, Number(payload.balance ?? total - paidAmount))
  };
};

const sanitizePayload = (payload = {}) => {
  const safe = { ...(payload || {}) };
  delete safe._id;
  delete safe.__v;
  delete safe.createdAt;
  delete safe.updatedAt;
  delete safe.clientDetails;
  return safe;
};

const buildInvoiceNumber = async () => {
  const count = await Invoice.countDocuments();
  return `INV-${String(count + 1).padStart(6, '0')}`;
};

const decorate = (doc) => {
  const invoice = doc?.toObject ? doc.toObject() : doc;
  return {
    ...invoice,
    status: normalizeStatus(invoice.status)
  };
};

exports.getInvoices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 200,
      search = '',
      status = 'all',
      client = 'all',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    if (status && status !== 'all') {
      query.status = normalizeStatus(status);
    }
    if (client && client !== 'all') {
      query.client = client;
    }
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ];
    }

    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
    const safePage = Math.max(1, Number(page) || 1);
    const sortDirection = String(sortOrder).toLowerCase() === 'asc' ? 1 : -1;
    const allowedSort = ['createdAt', 'updatedAt', 'date', 'dueDate', 'total', 'invoiceNumber', 'status'];
    const safeSortBy = allowedSort.includes(sortBy) ? sortBy : 'createdAt';

    const [rows, total] = await Promise.all([
      Invoice.find(query)
        .populate('client')
        .sort({ [safeSortBy]: sortDirection })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),
      Invoice.countDocuments(query)
    ]);

    res.status(200).json({
      data: rows.map(decorate),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.max(1, Math.ceil(total / safeLimit))
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to fetch invoices' });
  }
};

exports.getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('client');
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    return res.status(200).json(decorate(invoice));
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to fetch invoice' });
  }
};

exports.createInvoice = async (req, res) => {
  try {
    const payload = computeTotals(sanitizePayload(req.body || {}));
    payload.status = normalizeStatus(payload.status);
    if (!payload.invoiceNumber) {
      payload.invoiceNumber = await buildInvoiceNumber();
    }

    const newInvoice = new Invoice(payload);
    const saved = await newInvoice.save();
    const populated = await Invoice.findById(saved._id).populate('client');
    res.status(201).json(decorate(populated));
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to create invoice' });
  }
};

exports.updateInvoice = async (req, res) => {
  try {
    const existing = await Invoice.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Invoice not found' });

    const payload = computeTotals(sanitizePayload(req.body || {}));
    payload.status = normalizeStatus(payload.status || existing.status);
    if (!payload.invoiceNumber) {
      payload.invoiceNumber = existing.invoiceNumber || (await buildInvoiceNumber());
    }

    const updated = await Invoice.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    ).populate('client');

    res.status(200).json(decorate(updated));
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to update invoice' });
  }
};

exports.deleteInvoice = async (req, res) => {
  try {
    const deleted = await Invoice.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Invoice not found' });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to delete invoice' });
  }
};

exports.getInvoiceStats = async (req, res) => {
  try {
    const invoices = await Invoice.find({}, 'status total');
    const stats = invoices.reduce(
      (acc, inv) => {
        const status = normalizeStatus(inv.status);
        acc.total += 1;
        acc.amount += Number(inv.total || 0);
        if (status === 'PAID') acc.paid += 1;
        if (status === 'SENT' || status === 'DRAFT' || status === 'OVERDUE' || status === 'PARTIAL') acc.notPaid += 1;
        return acc;
      },
      { total: 0, paid: 0, notPaid: 0, amount: 0, receipts: 0 }
    );
    stats.receipts = stats.paid;
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch invoice stats' });
  }
};

exports.bulkDeleteInvoices = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const result = await Invoice.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deleted: Number(result.deletedCount || 0), message: 'Invoices deleted' });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to bulk delete invoices' });
  }
};

exports.bulkStatusUpdate = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const status = normalizeStatus(req.body?.status || 'DRAFT');
    const result = await Invoice.updateMany({ _id: { $in: ids } }, { $set: { status } });
    res.json({ success: true, updated: Number(result.modifiedCount || 0), message: 'Invoice statuses updated' });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to update invoice statuses' });
  }
};

exports.sendInvoiceEmail = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('client');
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    const targetEmail = invoice.client?.email;
    if (!targetEmail) return res.status(400).json({ message: 'Client email is missing' });

    const subject = `Invoice ${invoice.invoiceNumber || String(invoice._id).slice(-6).toUpperCase()}`;
    const message = 'Please find attached your invoice from SMA Systems.';

    await dispatchService.processEmailDispatch(
      {
        mode: 'single',
        type: 'Invoice',
        docId: String(invoice._id),
        subject,
        message
      },
      []
    );

    invoice.metadata = invoice.metadata || {};
    invoice.metadata.emailSentAt = new Date();
    invoice.metadata.lastSentStatus = 'sent';
    await invoice.save({ validateBeforeSave: false });

    res.json({ success: true, message: `Invoice emailed to ${targetEmail}` });
  } catch (error) {
    res.status(502).json({ message: error.message || 'Failed to send invoice email' });
  }
};

exports.duplicateInvoice = async (req, res) => {
  try {
    const original = await Invoice.findById(req.params.id).lean();
    if (!original) return res.status(404).json({ message: 'Invoice not found' });

    const copyPayload = {
      ...original,
      _id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      invoiceNumber: await buildInvoiceNumber(),
      status: 'DRAFT',
      metadata: {
        downloadCount: 0,
        emailSentAt: null,
        lastSentStatus: ''
      }
    };

    const duplicated = await Invoice.create(copyPayload);
    const populated = await Invoice.findById(duplicated._id).populate('client');
    res.json({ success: true, data: decorate(populated), message: 'Invoice duplicated successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to duplicate invoice' });
  }
};

exports.trackDownload = async (req, res) => {
  try {
    await Invoice.findByIdAndUpdate(
      req.params.id,
      { $inc: { 'metadata.downloadCount': 1 } },
      { new: false }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to track download' });
  }
};
