const clientService = require('../services/clientService');


const getClients = async (req, res) => {
  try {
    
    const clients = await clientService.getAllClients(req.query);
    res.status(200).json(clients);
  } catch (error) {
    res.status(500).json({ message: "Server error while fetching clients" });
  }
};


const createClient = async (req, res) => {
  try {
    const newClient = await clientService.createClient(req.body);
    res.status(201).json(newClient);
  } catch (error) {
 
    res.status(400).json({ message: error.message });
  }
};

/**
 * Update client profile
 */
const updateClient = async (req, res) => {
  try {
    const updatedClient = await clientService.updateClient(req.params.id, req.body);
    if (!updatedClient) {
      return res.status(404).json({ message: "Client record not found" });
    }
    res.status(200).json(updatedClient);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * NEW: Toggle Client Status (Archive/Activate)
 * Use this instead of delete for clients with invoice history
 */
const toggleStatus = async (req, res) => {
  try {
    const { status } = req.body; // Expecting { "status": "Archived" }
    const updated = await clientService.toggleClientStatus(req.params.id, status);
    res.status(200).json(updated);
  } catch (error) {
    res.status(400).json({ message: "Failed to update status" });
  }
};

/**
 * Hard delete a client
 */
const deleteClient = async (req, res) => {
  try {
    const result = await clientService.deleteClient(req.params.id);
    if (!result) return res.status(404).json({ message: "Client not found" });
    
    res.status(200).json({ message: "Client record purged successfully" });
  } catch (error) {
    res.status(500).json({ message: "Deletion failed: Client may be linked to other records" });
  }
};

module.exports = { 
  getClients, 
  createClient, 
  updateClient, 
  toggleStatus, 
  deleteClient 
};