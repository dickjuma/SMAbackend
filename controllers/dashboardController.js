const Client = require('../models/client');
const Invoice = require('../models/invoice');
const Quotation = require('../models/quotation'); 

const getDashboardStats = async (req, res) => {
  try {
    // Fetch counts in parallel for performance
    const [clientCount, invoiceCount, receiptCount, quotationCount] = await Promise.all([
      Client.countDocuments(),
      Invoice.countDocuments(),
      Invoice.countDocuments({ status: 'Paid' }), // Receipts are paid invoices
      Quotation ? Quotation.countDocuments() : Promise.resolve(0),
    ]);

    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newInvoices = await Invoice.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Simple growth calculation
    const invoiceGrowth = invoiceCount > 0 
      ? `+${((newInvoices / invoiceCount) * 100).toFixed(0)}%` 
      : "0%";

    res.status(200).json({
      clients: { count: clientCount, change: "+2%", trend: "up" },
      invoices: { count: invoiceCount, change: invoiceGrowth, trend: "up" },
      receipts: { count: receiptCount, change: "+5%", trend: "up" },
      quotations: { count: quotationCount, change: "-1%", trend: "down" }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getDashboardStats };