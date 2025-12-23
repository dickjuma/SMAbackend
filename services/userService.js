const User = require('../models/User');
const bcrypt = require('bcryptjs');

class UserService {
    // BUSINESS LOGIC: Create User & Assign Role
    async createUser(adminUser, userData) {
        // Only SuperAdmins can assign roles other than 'user'
        if (userData.role !== 'user' && adminUser.role !== 'superadmin') {
            throw new Error("UNAUTHORIZED_ROLE_ASSIGNMENT_ATTEMPT");
        }

        const hashedPassword = await bcrypt.hash(userData.password, 12);
        
        const newUser = await User.create({
            ...userData,
            password: hashedPassword
        });

        return newUser;
    }

    // BUSINESS LOGIC: Toggle Access (Blocking/Unblocking)
    async toggleUserAccess(targetUserId, requesterRole) {
        if (requesterRole !== 'superadmin') {
            throw new Error("INSUFFICIENT_PERMISSIONS_TO_BLOCK_NODES");
        }

        const user = await User.findById(targetUserId);
        if (!user) throw new Error("USER_NOT_FOUND");

        user.active = !user.active;
        await user.save();
        
        return { 
            id: user._id, 
            status: user.active ? "AUTHORIZED" : "BLOCKED",
            name: user.name 
        };
    }
}

module.exports = new UserService();