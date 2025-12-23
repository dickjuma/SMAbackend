const Invoice = require('../models/invoice');

// 1. Fetch all receipts (Invoices where status is "Paid")
const getReceipts = async (req, res) => {
  try {
    const { search } = req.query;
    let query = { status: "Paid" };

    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const receipts = await Invoice.find(query)
      .populate('client') 
      .sort({ date: -1 });

    res.status(200).json(receipts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 2. Create a Manual Receipt (Forces status to "Paid")
const createManualReceipt = async (req, res) => {
  try {
    const receiptData = {
      ...req.body,
      status: "Paid" 
    };
    
    const newReceipt = await Invoice.create(receiptData);
    const populatedReceipt = await Invoice.findById(newReceipt._id).populate('client');
    
    res.status(201).json(populatedReceipt);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 3. Delete/Void Receipt
const deleteReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Invoice.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Record not found in ledger" });
    }

    res.status(200).json({ message: "Transaction voided successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- CRITICAL FIX: ONLY ONE EXPORT BLOCK ---
module.exports = { 
  getReceipts, 
  createManualReceipt, 
  deleteReceipt 
};