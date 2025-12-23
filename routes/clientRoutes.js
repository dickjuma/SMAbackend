const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');

// @route   GET /api/clients
// @desc    Get all clients (Supports ?status=Active query)
router.get('/', clientController.getClients);

// @route   POST /api/clients
// @desc    Register a new client
router.post('/', clientController.createClient);

// @route   PUT /api/clients/:id
// @desc    Update full client profile
router.put('/:id', clientController.updateClient);

// @route   PATCH /api/clients/:id/status
// @desc    Toggle between Active and Archived
router.patch('/:id/status', clientController.toggleStatus);

// @route   DELETE /api/clients/:id
// @desc    Permanently remove a client
router.delete('/:id', clientController.deleteClient);

module.exports = router;