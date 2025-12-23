const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");


const Client = require("../models/client");
const Quotation = require("../models/quotation");
const Invoice = require("../models/invoice");

router.get("/stats", async (req, res) => {
  try {
  
    const [clients, quotations, invoices] = await Promise.all([
      Client.countDocuments({}),
      Quotation.countDocuments({}),
      Invoice.countDocuments({}),
      Receipt.countDocuments({ status: "Paid" }), // Example filter
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