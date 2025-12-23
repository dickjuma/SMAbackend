const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const signToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1d' });
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Check if email and password exist
        if (!email || !password) {
            return res.status(400).json({ message: "Please provide email and password" });
        }

        // 2. Find user & include password for verification
        const user = await User.findOne({ email }).select('+password');

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Incorrect email or password" });
        }

        // 3. Check if account is active
        if (!user.active) {
            return res.status(403).json({ message: "Account is deactivated" });
        }

        // 4. Generate Token
        const token = signToken(user._id);

        // 5. Remove password from output
        user.password = undefined;

        res.status(200).json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};