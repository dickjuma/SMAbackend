const jwt = require('jsonwebtoken');
const User = require('../models/User');

const ROLE_ORDER = ['user', 'team_lead', 'manager', 'admin', 'superadmin'];

const normalizeRole = (role) => String(role || '').trim().toLowerCase();
const getRoleRank = (role) => {
  const rank = ROLE_ORDER.indexOf(normalizeRole(role));
  return rank < 0 ? 0 : rank;
};

/**
 * @desc    Verify if the user is logged in and the token is valid
 */
exports.protect = async (req, res, next) => {
  try {
    let token;

    // 1. Check for Bearer token in headers
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token && req.cookies?.token) token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        code: 'AUTH_NO_TOKEN', 
        message: "Authentication required. Please login." 
      });
    }

    // 2. Verify Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Check if user still exists & is active
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        code: 'AUTH_USER_NOT_FOUND', 
        message: "The identity node associated with this token no longer exists." 
      });
    }

    if (!user.active) {
      return res.status(403).json({ 
        success: false, 
        code: 'AUTH_ACCOUNT_LOCKED', 
        message: "Access suspended. Please contact the System Administrator." 
      });
    }

    // 4. Grant access to the next middleware
    req.user = user;
    User.updateOne(
      { _id: user._id },
      { $set: { lastSeen: new Date(), onlineStatus: 'online' } }
    ).catch(() => {});
    next();
  } catch (err) {
    // Handle JWT specific errors (like expiration)
    const message = err.name === 'TokenExpiredError' ? 'Session expired' : 'Invalid session';
    return res.status(401).json({ 
      success: false, 
      code: 'AUTH_INVALID_TOKEN', 
      message: `${message}. Please login again.` 
    });
  }
};

/**
 * @desc    Restrict access based on specific user roles
 * @usage   restrictTo('superadmin', 'admin')
 */
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    const allowed = roles.map(normalizeRole);
    const userRole = normalizeRole(req.user?.role);
    if (!req.user || !allowed.includes(userRole)) {
      return res.status(403).json({ 
        success: false, 
        code: 'AUTH_FORBIDDEN',
        message: "INSUFFICIENT_PRIVILEGE_LEVEL: Protocol Access Denied." 
      });
    }
    next();
  };
};

exports.restrictToMinRole = (minimumRole = 'user') => {
  return (req, res, next) => {
    const required = getRoleRank(minimumRole);
    const actual = getRoleRank(req.user?.role);
    if (!req.user || actual < required) {
      return res.status(403).json({
        success: false,
        code: 'AUTH_FORBIDDEN',
        message: `Minimum role required: ${minimumRole}`
      });
    }
    next();
  };
};
