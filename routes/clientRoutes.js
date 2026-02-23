const express = require('express');
const router = express.Router();
const Client = require('../models/client');
const clientController = require('../controllers/clientController');

router.get('/stats', async (req, res) => {
  try {
    const [total, active, archived] = await Promise.all([
      Client.countDocuments(),
      Client.countDocuments({ status: 'Active' }),
      Client.countDocuments({ status: 'Archived' })
    ]);

    res.json({ success: true, data: { total, active, archived } });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch client stats' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json(client);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch client' });
  }
});

router.get('/', clientController.getClients);
router.post('/', clientController.createClient);
router.put('/:id', clientController.updateClient);
router.patch('/:id', clientController.toggleStatus);
router.patch('/:id/status', clientController.toggleStatus);
router.delete('/:id', clientController.deleteClient);

router.post('/bulk-delete', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    await Client.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, message: 'Clients deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: 'Failed to bulk delete clients' });
  }
});

module.exports = router;
