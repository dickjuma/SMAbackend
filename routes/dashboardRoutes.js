const express = require('express');
const router = express.Router();
const Client = require('../models/client');
const Quotation = require('../models/quotation');
const Invoice = require('../models/invoice');
const User = require('../models/User');

router.get('/stats', async (req, res) => {
  try {
    const [clients, quotations, invoices, receipts, userRows] = await Promise.all([
      Client.countDocuments({}),
      Quotation.countDocuments({}),
      Invoice.countDocuments({}),
      Invoice.countDocuments({ status: 'Paid' }),
      User.find().lean()
    ]);

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
      quotations,
      invoices,
      receipts,
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

    res.json(payload);
  } catch (error) {
    console.error('Dashboard API Error:', error);
    res.status(500).json({ error: 'Failed to fetch ledger statistics' });
  }
});

module.exports = router;
