const Client = require('../models/client');
const Invoice = require('../models/invoice');
const Quotation = require('../models/quotation');

const getDashboardStats = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // We use Invoice for both totalCount and paid (receipt) count
    const [
      clientCount, 
      totalInvoices, 
      paidInvoices, 
      quotationCount,
      newInvoicesCount
    ] = await Promise.all([
      Client.countDocuments(),
      Invoice.countDocuments(),
      Invoice.countDocuments({ status: 'Paid' }), // This is your Receipt logic 🧾
      Quotation ? Quotation.countDocuments() : Promise.resolve(0),
      Invoice.countDocuments({ createdAt: { $gte: thirtyDaysAgo } })
    ]);

    const growth = totalInvoices > 0 
      ? Number(((newInvoicesCount / totalInvoices) * 100).toFixed(1)) 
      : 0;

    res.status(200).json({
      totalClients: clientCount,
      totalInvoices: totalInvoices,
      totalReceipts: paidInvoices, // Sending the paid count as totalReceipts
      totalQuotations: quotationCount,
      invoiceGrowth: growth
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getDashboardStats };