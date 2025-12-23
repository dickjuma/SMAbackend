const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    basePrice: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' }
}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);