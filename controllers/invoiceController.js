const Invoice = require('../models/invoice');


exports.getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find().populate('client').sort({ createdAt: -1 });
    res.status(200).json(invoices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// CREATE invoice
exports.createInvoice = async (req, res) => {
  try {
    const newInvoice = new Invoice(req.body);
    const saved = await newInvoice.save();
    const populated = await Invoice.findById(saved._id).populate('client');
    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// UPDATE invoice (Fixed export for Line 10 crash)
exports.updateInvoice = async (req, res) => {
  try {
    const updated = await Invoice.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('client');
    res.status(200).json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE invoice
exports.deleteInvoice = async (req, res) => {
  try {
    await Invoice.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Deleted successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};