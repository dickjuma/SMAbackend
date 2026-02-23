const express = require('express');
const router = express.Router();
const Client = require('../models/client');
const Quotation = require('../models/quotation');
const Invoice = require('../models/invoice');
const User = require('../models/User');
const EmailLog = require('../models/EmailLog');

const toStatus = (value) => String(value || '').toUpperCase().trim();

router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const prev30Start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [
      clients,
      activeClients,
      quotationsCount,
      invoicesRows,
      userRows,
      emailRows,
      newClientsLast30Days,
      newInvoicesLast30Days,
      newQuotationsLast30Days,
      prevInvoicesLast30Days,
      newEmailsLast30Days
    ] = await Promise.all([
      Client.countDocuments({}),
      Client.countDocuments({ status: 'Active' }),
      Quotation.countDocuments({}),
      Invoice.find().lean(),
      User.find().lean(),
      EmailLog.find().lean(),
      Client.countDocuments({ createdAt: { $gte: last30 } }),
      Invoice.countDocuments({ createdAt: { $gte: last30 } }),
      Quotation.countDocuments({ createdAt: { $gte: last30 } }),
      Invoice.countDocuments({ createdAt: { $gte: prev30Start, $lt: last30 } }),
      EmailLog.countDocuments({ createdAt: { $gte: last30 }, status: { $in: ['sent', 'partial'] } })
    ]);

    const invoices = invoicesRows.length;
    const paidInvoices = invoicesRows.filter((inv) => toStatus(inv.status) === 'PAID').length;
    const partialInvoices = invoicesRows.filter((inv) => toStatus(inv.status) === 'PARTIAL').length;
    const overdueInvoices = invoicesRows.filter((inv) => toStatus(inv.status) === 'OVERDUE').length;
    const receipts = paidInvoices;

    const invoiceTurnover = invoicesRows.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    const receiptTurnover = invoicesRows
      .filter((inv) => toStatus(inv.status) === 'PAID')
      .reduce((sum, inv) => sum + Number(inv.paidAmount || inv.total || 0), 0);
    const outstandingInvoiceAmount = Math.max(0, invoiceTurnover - receiptTurnover);

    const quotationRows = await Quotation.find().lean();
    const quotationTurnover = quotationRows.reduce((sum, q) => sum + Number(q.total || 0), 0);
    const newReceiptsLast30Days = invoicesRows.filter((inv) => {
      const isPaid = toStatus(inv.status) === 'PAID';
      const updatedAt = inv.updatedAt ? new Date(inv.updatedAt) : null;
      return isPaid && updatedAt && updatedAt >= last30;
    }).length;

    const emailsSent = emailRows.filter((log) => ['sent', 'partial'].includes(String(log.status || '').toLowerCase())).length;

    const collectionRate = invoiceTurnover > 0 ? Math.round((receiptTurnover / invoiceTurnover) * 10000) / 100 : 0;
    const invoiceGrowth = prevInvoicesLast30Days > 0
      ? ((newInvoicesLast30Days - prevInvoicesLast30Days) / prevInvoicesLast30Days) * 100
      : newInvoicesLast30Days > 0
        ? 100
        : 0;

    const online = userRows.filter((u) => (u.onlineStatus || 'offline') === 'online').length;
    const active = userRows.filter((u) => !!u.active).length;

    const deptMap = userRows.reduce((acc, u) => {
      const d = u.department || 'Unassigned';
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {});

    const roleMap = userRows.reduce((acc, u) => {
      const r = u.role || 'user';
      acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});

    const productivity = userRows.length
      ? Math.round(userRows.reduce((sum, u) => sum + (Number(u.performance) || 0), 0) / userRows.length)
      : 0;

    const engagement = userRows.length
      ? Math.round(userRows.reduce((sum, u) => sum + Math.min(100, (Number(u.loginCount) || 0) * 5), 0) / userRows.length)
      : 0;

    const payload = {
      clients,
      quotations: quotationsCount,
      invoices,
      receipts,
      emailsSent,
      activeClients,
      invoiceTurnover,
      quotationTurnover,
      receiptTurnover,
      outstandingInvoiceAmount,
      collectionRate,
      invoiceGrowth,
      recentActivity: {
        newClientsLast30Days,
        newInvoicesLast30Days,
        newQuotationsLast30Days,
        newReceiptsLast30Days,
        newEmailsLast30Days
      },
      invoiceStatusBreakdown: {
        paid: paidInvoices,
        overdue: overdueInvoices,
        partial: partialInvoices
      },
      stats: {
        total: userRows.length,
        online,
        active,
        departments: Object.entries(deptMap).map(([department, count]) => ({ department, count })),
        roles: Object.entries(roleMap).map(([role, count]) => ({ role, count })),
        productivity,
        engagement
      }
    };

    res.json({ success: true, data: payload, ...payload });
  } catch (error) {
    console.error('Dashboard API Error:', error);
    res.status(500).json({ error: 'Failed to fetch ledger statistics' });
  }
});

module.exports = router;
