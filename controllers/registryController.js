// src/controllers/registryController.js
const Invoice = require('../models/invoice');
const Quotation = require('../models/quotation');

exports.getRegistry = async (req, res) => {
  try {
    const [allInvoices, allQuotations] = await Promise.all([
      Invoice.find({}).populate('client').lean(), 
      Quotation.find({}).populate('client').lean()
    ]);

    console.log(`Syncing Registry: Invoices(${allInvoices.length}), Quotations(${allQuotations.length})`);

    res.json({
      // 1. ALL INVOICES: Remove the status filter here. 
      // This ensures they stay in the "Invoices" tab even after payment.
      Invoices: allInvoices,

      // 2. RECEIPTS: This remains a filtered view of the same collection.
      // Only invoices marked as 'paid' appear here.
      Receipts: allInvoices.filter(inv => 
        inv.status?.trim().toLowerCase() === 'paid'
      ),

      Quotations: allQuotations,
      
      // 3. CLIENTS: Extracting unique clients for the bulk dispatch list
      Clients: Array.from(new Set(allInvoices.map(inv => inv.client ? JSON.stringify(inv.client) : null)))
        .filter(Boolean)
        .map(c => JSON.parse(c))
    });
  } catch (error) {
    console.error("Registry Error:", error);
    res.status(500).json({ error: error.message });
  }
};