const Quotation = require('../models/quotation');
const Invoice = require('../models/invoice');
const dispatchService = require('../services/DispatchService.js.js');

const normalizeStatus = (status) => String(status || 'DRAFT').toUpperCase().trim();

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

  return {
    ...payload,
    items: normalizedItems,
    subtotal,
    tax,
    discount,
    total
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

const buildQuotationNumber = async () => {
  const count = await Quotation.countDocuments();
  return `QTN-${String(count + 1).padStart(6, '0')}`;
};

exports.getQuotations = async (req, res) => {
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
    if (status && status !== 'all') query.status = normalizeStatus(status);
    if (client && client !== 'all') query.client = client;
    if (search) {
      query.$or = [
        { quotationNumber: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { terms: { $regex: search, $options: 'i' } }
      ];
    }

    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
    const safePage = Math.max(1, Number(page) || 1);
    const sortDirection = String(sortOrder).toLowerCase() === 'asc' ? 1 : -1;
    const allowedSort = ['createdAt', 'updatedAt', 'date', 'expiryDate', 'total', 'quotationNumber', 'status'];
    const safeSortBy = allowedSort.includes(sortBy) ? sortBy : 'createdAt';

    const [rows, total] = await Promise.all([
      Quotation.find(query)
        .populate('client', 'name email phone')
        .sort({ [safeSortBy]: sortDirection })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),
      Quotation.countDocuments(query)
    ]);

    res.status(200).json({
      data: rows,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.max(1, Math.ceil(total / safeLimit))
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching quotations', error: error.message });
  }
};

exports.getQuotationById = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id).populate('client', 'name email phone');
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
    return res.status(200).json(quotation);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch quotation', error: error.message });
  }
};

exports.createQuotation = async (req, res) => {
  try {
    const payload = computeTotals(sanitizePayload(req.body || {}));
    payload.status = normalizeStatus(payload.status);
    if (!payload.quotationNumber) payload.quotationNumber = await buildQuotationNumber();

    const newQuotation = new Quotation(payload);
    const savedQuotation = await newQuotation.save();
    const populated = await Quotation.findById(savedQuotation._id).populate('client', 'name email phone');
    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: 'Error saving quotation', error: error.message });
  }
};

exports.updateQuotation = async (req, res) => {
  try {
    const existing = await Quotation.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Quotation not found' });

    const payload = computeTotals(sanitizePayload(req.body || {}));
    payload.status = normalizeStatus(payload.status || existing.status);
    if (!payload.quotationNumber) {
      payload.quotationNumber = existing.quotationNumber || (await buildQuotationNumber());
    }

    const updated = await Quotation.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    ).populate('client', 'name email phone');

    res.status(200).json(updated);
  } catch (error) {
    res.status(400).json({ message: 'Error updating quotation', error: error.message });
  }
};

exports.deleteQuotation = async (req, res) => {
  try {
    const deleted = await Quotation.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Quotation not found' });
    res.status(200).json({ message: 'Quotation deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting', error: error.message });
  }
};

exports.getQuotationStats = async (req, res) => {
  try {
    const quotations = await Quotation.find({}, 'status total');
    const data = quotations.reduce(
      (acc, item) => {
        const status = normalizeStatus(item.status);
        acc.total += 1;
        acc.amount += Number(item.total || 0);
        if (status === 'ACCEPTED' || status === 'CONVERTED') acc.accepted += 1;
        if (status === 'DECLINED' || status === 'EXPIRED') acc.lost += 1;
        return acc;
      },
      { total: 0, accepted: 0, lost: 0, amount: 0 }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch quotation stats' });
  }
};

exports.convertToInvoice = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

    const invoiceCount = await Invoice.countDocuments();
    const invoice = await Invoice.create({
      client: quotation.client,
      invoiceNumber: `INV-${String(invoiceCount + 1).padStart(6, '0')}`,
      date: quotation.date,
      dueDate: quotation.expiryDate || quotation.date,
      currency: quotation.currency,
      status: 'DRAFT',
      items: quotation.items,
      subtotal: quotation.subtotal || 0,
      tax: quotation.tax || 0,
      discount: quotation.discount || 0,
      total: quotation.total || 0,
      notes: quotation.notes || ''
    });

    quotation.status = 'CONVERTED';
    await quotation.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: 'Quotation converted to invoice successfully',
      data: invoice
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to convert quotation' });
  }
};

exports.sendQuotationEmail = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id).populate('client');
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
    const targetEmail = quotation.client?.email;
    if (!targetEmail) return res.status(400).json({ message: 'Client email is missing' });

    const subject = `Quotation ${quotation.quotationNumber || String(quotation._id).slice(-6).toUpperCase()}`;
    const message = 'Please find attached your quotation from SMA Systems.';

    await dispatchService.processEmailDispatch(
      {
        mode: 'single',
        type: 'Quotation',
        docId: String(quotation._id),
        subject,
        message
      },
      []
    );

    quotation.metadata = quotation.metadata || {};
    quotation.metadata.emailSentAt = new Date();
    quotation.metadata.lastSentStatus = 'sent';
    await quotation.save({ validateBeforeSave: false });

    res.json({ success: true, message: `Quotation emailed to ${targetEmail}` });
  } catch (error) {
    res.status(502).json({ message: error.message || 'Failed to send quotation email' });
  }
};

exports.duplicateQuotation = async (req, res) => {
  try {
    const original = await Quotation.findById(req.params.id).lean();
    if (!original) return res.status(404).json({ message: 'Quotation not found' });

    const duplicated = await Quotation.create({
      ...original,
      _id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      quotationNumber: await buildQuotationNumber(),
      status: 'DRAFT',
      metadata: {
        emailSentAt: null,
        lastSentStatus: ''
      }
    });

    const populated = await Quotation.findById(duplicated._id).populate('client', 'name email phone');
    res.json({ success: true, data: populated, message: 'Quotation duplicated successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to duplicate quotation' });
  }
};
