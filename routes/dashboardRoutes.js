const express = require("express");
const router = express.Router();
// We don't need a Receipt model because we use Invoice with a filter
const Client = require("../models/client");
const Quotation = require("../models/quotation");
const Invoice = require("../models/invoice");

router.get("/stats", async (req, res) => {
  try {
    // We destructure 4 variables to match the 4 count requests
    const [clients, quotations, invoices, receipts] = await Promise.all([
      Client.countDocuments({}),
      Quotation.countDocuments({}),
      Invoice.countDocuments({}),                 // Total count
      Invoice.countDocuments({ status: "Paid" }), // Filtered count for receipts ✅
    ]);

    res.json({
      clients,
      quotations,
      invoices,
      receipts
    });
  } catch (error) {
    console.error("Dashboard API Error:", error);
    res.status(500).json({ error: "Failed to fetch ledger statistics" });
  }
});

module.exports = router;