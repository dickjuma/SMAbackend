const Invoice = require('../models/invoice');

// Get all invoices
const getAllInvoices = async (search) => {
  const query = {};
  
  // If search param exists, filter by client name
  if (search) {
    query.client = { $regex: search, $options: 'i' };
  }

  return await Invoice.find(query).sort({ date: -1 });
};

// Create invoice
const createInvoice = async (data) => {
  return await Invoice.create(data);
};

// Update invoice
const updateInvoice = async (id, data) => {
  return await Invoice.findByIdAndUpdate(id, data, { new: true });
};

// Delete invoice
const deleteInvoice = async (id) => {
  return await Invoice.findByIdAndDelete(id);
};

// Toggle Status specifically (Helper)
const toggleStatus = async (id) => {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw new Error("Invoice not found");
  
  invoice.status = invoice.status === 'Paid' ? 'Not Paid' : 'Paid';
  return await invoice.save();
};

// Mock function for "Send to Customer"
const sendInvoiceEmail = async (id) => {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw new Error("Invoice not found");

  // TODO: Integrate Nodemailer or SendGrid here
  console.log(`Sending email to client ${invoice.client} for amount ${invoice.total}`);
  
  return { success: true, message: `Invoice sent to ${invoice.client}` };
};

module.exports = {
  getAllInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  toggleStatus,
  sendInvoiceEmail
};