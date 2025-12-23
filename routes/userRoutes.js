const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, restrictTo } = require('../middleware/auth');

// Apply protection to ALL routes below this line
router.use(protect);
router.use(restrictTo('superadmin'));

router.route('/')
  .get(userController.getAllUsers)
  .post(userController.provisionUser);

router.patch('/:id/role', userController.updateRole);
router.patch('/:id/status', userController.toggleStatus);
router.delete('/:id', userController.purgeUser);

module.exports = router;