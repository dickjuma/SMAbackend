const Quotation = require('../models/quotation');

// GET all quotations
exports.getQuotations = async (req, res) => {
  try {
    // We populate 'client' to get the Name and Email instead of just an ID
    const quotations = await Quotation.find()
      .populate('client', 'name email') 
      .sort({ createdAt: -1 });
    res.status(200).json(quotations);
  } catch (error) {
    res.status(500).json({ message: "Error fetching data", error: error.message });
  }
};

// CREATE new quotation
exports.createQuotation = async (req, res) => {
  try {
    const newQuotation = new Quotation(req.body);
    const savedQuotation = await newQuotation.save();
    
    // Populate the client info before sending back to frontend
    const populated = await Quotation.findById(savedQuotation._id).populate('client', 'name email');
    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: "Error saving quotation", error: error.message });
  }
};

// UPDATE quotation
exports.updateQuotation = async (req, res) => {
  try {
    const updated = await Quotation.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('client', 'name email');
    
    res.status(200).json(updated);
  } catch (error) {
    res.status(400).json({ message: "Error updating quotation", error: error.message });
  }
};

// DELETE quotation
exports.deleteQuotation = async (req, res) => {
  try {
    await Quotation.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Quotation deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting", error: error.message });
  }
};