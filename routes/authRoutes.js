const express = require('express');
const router = express.Router();
const User = require('../models/User'); 
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/auth');

// --- 1. PUBLIC GATEWAY ---
router.post('/login', authController.login);

// --- 2. PROTECTED ZONE (Requires valid JWT) ---
router.use(protect);

/**
 * IDENTITY MANAGEMENT PROTOCOLS
 * Strictly limited to SuperAdmin to protect system integrity.
 */

// Action: View Registry (Admin & SuperAdmin)
router.get('/users', restrictTo('admin', 'superadmin'), async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: "REGISTRY_READ_ERROR" });
    }
});

// Action: Provision_Node (Create User)
router.post('/register', restrictTo('superadmin'), adminController.provisionUser);

// Action: Toggle Access Status (Suspend/Restore)
router.patch('/status/:id', restrictTo('superadmin'), adminController.updateAccessStatus);

// Action: Save_Role (Update Privilege Level)
router.patch('/role/:id', restrictTo('superadmin'), adminController.updateRole);

// Action: Purge_Node (Permanent Deletion)
router.delete('/purge/:id', restrictTo('superadmin'), adminController.purgeUser);

module.exports = router;