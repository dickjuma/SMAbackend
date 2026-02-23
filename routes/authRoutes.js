const express = require('express');
const multer = require('multer');
const router = express.Router();
const User = require('../models/User');
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!String(file.mimetype || '').toLowerCase().startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

// Public
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);

// Protected
router.use(protect);

router.post('/logout', authController.logout);
router.post('/validate-token', authController.validateToken);
router.get('/profile', authController.getProfile);
router.put('/profile', authController.updateProfile);
router.post('/profile/avatar', (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (!err) return next();
    return res.status(400).json({
      success: false,
      message: err.message || 'Failed to process avatar upload'
    });
  });
}, authController.uploadProfileAvatar);
router.post('/change-password', authController.changePassword);
router.post('/presence', authController.updatePresence);

// Existing admin protocols
router.get('/users', restrictTo('admin', 'superadmin'), async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'REGISTRY_READ_ERROR' });
  }
});

router.post('/register', restrictTo('superadmin'), adminController.provisionUser);
router.patch('/status/:id', restrictTo('superadmin'), adminController.updateAccessStatus);
router.patch('/role/:id', restrictTo('superadmin'), adminController.updateRole);
router.delete('/purge/:id', restrictTo('superadmin'), adminController.purgeUser);

module.exports = router;
