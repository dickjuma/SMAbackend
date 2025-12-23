const Client = require('../models/client');


const getAllClients = async (query = {}) => {
  // We can now filter for only 'Active' clients if needed for the Invoice dropdown
  return await Client.find(query).sort({ createdAt: -1 });
};


const createClient = async (clientData) => {

  const existing = await Client.findOne({ email: clientData.email.toLowerCase() });
  if (existing) {
    throw new Error('A client with this email already exists.');
  }


  const formattedData = {
    ...clientData,
    address: {
      street: clientData.street || '',
      building: clientData.building || '',
      city: clientData.city || '',
      postalCode: clientData.postalCode || ''
    }
  };

  const newClient = await Client.create(formattedData);
  

  
  return newClient;
};

/**
 * Update client details
 */
const updateClient = async (id, updateData) => {
 
  return await Client.findByIdAndUpdate(
    id, 
    { $set: updateData }, 
    { new: true, runValidators: true }
  );
};


const toggleClientStatus = async (id, status) => {
  return await Client.findByIdAndUpdate(
    id,
    { status: status },
    { new: true }
  );
};

/**
 * Permanent Delete
 * Only use this if no invoices are linked to the client
 */
const deleteClient = async (id) => {
  return await Client.findByIdAndDelete(id);
};

module.exports = {
  getAllClients,
  createClient,
  updateClient,
  toggleClientStatus,
  deleteClient
};