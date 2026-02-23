const Client = require('../models/client');


const getAllClients = async (query = {}) => {
  const {
    page,
    limit,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    search,
    ...filters
  } = query || {};

  const mongoQuery = { ...filters };

  if (search) {
    mongoQuery.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  const safeLimit = Math.min(1000, Math.max(1, Number(limit) || 200));
  const safePage = Math.max(1, Number(page) || 1);
  const direction = String(sortOrder).toLowerCase() === 'asc' ? 1 : -1;
  const allowedSort = ['createdAt', 'updatedAt', 'name', 'email', 'status'];
  const safeSortBy = allowedSort.includes(sortBy) ? sortBy : 'createdAt';

  return await Client.find(mongoQuery)
    .sort({ [safeSortBy]: direction })
    .skip((safePage - 1) * safeLimit)
    .limit(safeLimit);
};


const createClient = async (clientData) => {

  const existing = await Client.findOne({ email: clientData.email.toLowerCase() });
  if (existing) {
    throw new Error('A client with this email already exists.');
  }


  const formattedData = {
    ...clientData,
    email: String(clientData.email || '').trim().toLowerCase(),
    address: {
      street: clientData.address?.street || clientData.street || '',
      building: clientData.address?.building || clientData.building || '',
      city: clientData.address?.city || clientData.city || '',
      postalCode: clientData.address?.postalCode || clientData.postalCode || '',
      country: clientData.address?.country || clientData.country || 'Kenya',
      gpsCoordinates: clientData.address?.gpsCoordinates || ''
    },
    country: clientData.address?.country || clientData.country || 'Kenya',
    tags: Array.isArray(clientData.tags) ? clientData.tags : [],
    contacts: Array.isArray(clientData.contacts) ? clientData.contacts : []
  };

  const newClient = await Client.create(formattedData);
  

  
  return newClient;
};

/**
 * Update client details
 */
const updateClient = async (id, updateData) => {
  const mergedAddress = {
    street: updateData.address?.street || updateData.street || '',
    building: updateData.address?.building || updateData.building || '',
    city: updateData.address?.city || updateData.city || '',
    postalCode: updateData.address?.postalCode || updateData.postalCode || '',
    country: updateData.address?.country || updateData.country || 'Kenya',
    gpsCoordinates: updateData.address?.gpsCoordinates || ''
  };

  const safeUpdate = {
    ...updateData,
    address: mergedAddress,
    country: mergedAddress.country
  };

  if (safeUpdate.email) {
    safeUpdate.email = String(safeUpdate.email).trim().toLowerCase();
  }

  return await Client.findByIdAndUpdate(
    id, 
    { $set: safeUpdate }, 
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
