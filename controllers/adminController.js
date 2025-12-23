const User = require('../models/User');
const bcrypt = require('bcryptjs');

// 1. TOGGLE ACCESS STATUS
exports.updateAccessStatus = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        // STRICT PROTECTION: Prevent self-lockout
        if (req.params.id === req.user.id) {
            return res.status(400).json({ message: "CRITICAL: You cannot deactivate your own node." });
        }

        user.active = !user.active;
        
        // If deactivating, kill their session
        if (!user.active) user.refreshToken = null; 
        
        await user.save({ validateBeforeSave: false });
        
        res.status(200).json({ status: "SUCCESS", active: user.active });
    } catch (err) {
        res.status(500).json({ message: "Update failed" });
    }
};

// 2. PROVISION NEW IDENTITY
exports.provisionUser = async (req, res) => {
    try {
        const { name, email, password, role, department } = req.body;
        
        // Check if user exists first to provide a cleaner error
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "Email already registered in registry." });

        const hashedPassword = await bcrypt.hash(password, 12);
        
        const newUser = await User.create({
            name, 
            email, 
            password: hashedPassword, 
            role: role || 'user', 
            department
        });

        // Remove password from response for security
        newUser.password = undefined;

        res.status(201).json({ status: "SUCCESS", data: newUser });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// 3. UPDATE ROLE (Required by Router to avoid crashes)
exports.updateRole = async (req, res) => {
    try {
        const { role } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id, 
            { role }, 
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) return res.status(404).json({ message: "User node not found" });

        res.status(200).json({ status: "SUCCESS", data: user });
    } catch (err) {
        res.status(400).json({ message: "Role update failed" });
    }
};

// 4. PURGE USER (Required by Router to avoid crashes)
exports.purgeUser = async (req, res) => {
  try {
      // Safety: Prevent deleting self
      if (req.params.id === req.user.id) {
          return res.status(400).json({ message: "SELF_PURGE_PROHIBITED" });
      }

      const user = await User.findByIdAndDelete(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      res.status(200).json({ status: "SUCCESS", message: "Node purged from system" });
  } catch (err) {
      res.status(500).json({ message: "Deletion failed" });
  }
};