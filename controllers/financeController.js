// src/controllers/registryController.js
const Invoice = require('../models/invoice');
const Quotation = require('../models/quotation');

exports.getRegistry = async (req, res) => {
  try {
    const [allInvoices, allQuotations] = await Promise.all([
      // Added .populate('client') so names show up in the UI
      // Removed .lean() temporarily to ensure mongoose getters work, 
      // or keep it if your model is simple.
      Invoice.find({}).populate('client').lean(), 
      Quotation.find({}).populate('client').lean()
    ]);

    // DEBUG LOG: See exactly what is coming from DB
    console.log(`Total Docs: Invoices(${allInvoices.length}), Quotations(${allQuotations.length})`);

    res.json({
      // 1. Check for 'Not Paid' but also handle variations like 'unpaid' or 'Pending'
      Invoices: allInvoices.filter(inv => 
        inv.status?.trim().toLowerCase() === 'not paid' || 
        inv.status?.trim().toLowerCase() === 'unpaid'
      ),

      // 2. Check for 'Paid'
      Receipts: allInvoices.filter(inv => 
        inv.status?.trim().toLowerCase() === 'paid'
      ),

      Quotations: allQuotations,
      
      // 3. Extract unique clients from invoices to populate the "Bulk" list
      Clients: Array.from(new Set(allInvoices.map(inv => JSON.stringify(inv.client))))
        .filter(Boolean)
        .map(c => JSON.parse(c))
    });
  } catch (error) {
    console.error("Registry Error:", error);
    res.status(500).json({ error: error.message });
  }
};