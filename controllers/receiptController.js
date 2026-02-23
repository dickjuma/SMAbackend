const Invoice = require('../models/invoice');

const getReceipts = async (req, res) => {
  try {
    const { search } = req.query;
    const query = { status: 'Paid' };

    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ];
    }

    const receipts = await Invoice.find(query).populate('client').sort({ date: -1 });
    res.status(200).json(receipts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getReceiptById = async (req, res) => {
  try {
    const receipt = await Invoice.findById(req.params.id).populate('client');
    if (!receipt || receipt.status !== 'Paid') return res.status(404).json({ message: 'Receipt not found' });
    res.status(200).json(receipt);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getReceiptStats = async (req, res) => {
  try {
    const receipts = await Invoice.find({ status: 'Paid' }).lean();
    const total = receipts.length;
    const totalAmount = receipts.reduce((sum, r) => {
      const subtotal = Array.isArray(r.items)
        ? r.items.reduce((s, it) => s + (Number(it.total) || 0), 0)
        : 0;
      return sum + subtotal;
    }, 0);

    res.status(200).json({
      success: true,
      data: {
        total,
        totalAmount,
        averageAmount: total > 0 ? totalAmount / total : 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createManualReceipt = async (req, res) => {
  try {
    const receiptData = { ...req.body, status: 'Paid' };
    const newReceipt = await Invoice.create(receiptData);
    const populatedReceipt = await Invoice.findById(newReceipt._id).populate('client');

    res.status(201).json(populatedReceipt);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateReceipt = async (req, res) => {
  try {
    const payload = { ...req.body, status: 'Paid' };
    const updated = await Invoice.findByIdAndUpdate(req.params.id, payload, { new: true }).populate('client');
    if (!updated) return res.status(404).json({ message: 'Receipt not found' });
    res.status(200).json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Invoice.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: 'Record not found in ledger' });
    }

    res.status(200).json({ message: 'Transaction voided successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getReceipts,
  getReceiptById,
  getReceiptStats,
  createManualReceipt,
  updateReceipt,
  deleteReceipt
};
