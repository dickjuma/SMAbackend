const User = require('../models/User');
const bcrypt = require('bcryptjs');
const transporter = require('../config/mailer');
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
        
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "Email already registered." });

        const hashedPassword = await bcrypt.hash(password, 12);
        
        const newUser = await User.create({
            name, 
            email, 
            password: hashedPassword, 
            role: role || 'user', 
            department
        });

        
        transporter.sendMail({
            from: `"SMA Registry" <${process.env.SMTP_USER}>`,
            to: newUser.email,
            subject: 'PROVISIONING_COMPLETE: Your System Identity',
            html: `
               <div style="margin: 0; padding: 0; background-color: #f8fafc; width: 100%;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td align="center" style="padding: 20px 10px;">
                <div style="max-width: 600px; width: 100%; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
                    
                    <div style="background-color: #0f172a; padding: 30px 20px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-family: sans-serif; font-size: 18px; letter-spacing: 1px; text-transform: uppercase;">System Access Granted</h1>
                    </div>

                    <div style="padding: 30px 20px; font-family: sans-serif; line-height: 1.6; color: #1e293b;">
                        <p style="font-size: 16px; margin-top: 0;">Dear <strong>${newUser.name}</strong>,</p>
                        <p style="font-size: 14px;">Your administrative account for <strong>SMA Systems</strong> has been successfully provisioned. Please use the credentials below to access your dashboard.</p>
                        
                        <div style="background-color: #f1f5f9; border-left: 4px solid #3b82f6; padding: 15px; margin: 25px 0;">
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 13px;">
                                <tr>
                                    <td style="padding-bottom: 8px; color: #64748b; width: 80px; vertical-align: top;">URL:</td>
                                    <td style="padding-bottom: 8px;"><strong>https:</strong></td>
                                </tr>
                                <tr>
                                    <td style="padding-bottom: 8px; color: #64748b; vertical-align: top;">ID:</td>
                                    <td style="padding-bottom: 8px;"><code style="background: #e2e8f0; padding: 2px 4px; border-radius: 4px;">${newUser.email}</code></td>
                                </tr>
                                <tr>
                                    <td style="color: #64748b; vertical-align: top;">Token:</td>
                                    <td><code style="background: #e2e8f0; padding: 2px 4px; border-radius: 4px;">${password}</code></td>
                                </tr>
                            </table>
                        </div>

                        <p style="font-size: 12px; color: #475569; margin-bottom: 0;"><em>Note: For security, you will be prompted to update your temporary token upon initial login.</em></p>
                    </div>

                    <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="font-family: sans-serif; font-size: 10px; color: #94a3b8; margin: 0; line-height: 1.4;">
                            SMA_SYSTEMS_OPERATIONS • INTERNAL REF: ${newUser._id}<br>
                            Automated security notification. Do not reply.
                        </p>
                    </div>
                </div>
            </td>
        </tr>
    </table>
</div>`
        }).catch(err => console.error("MAIL_ERROR:", err.message));

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