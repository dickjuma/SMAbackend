const nodemailer = require('nodemailer');

// 🛡️ Centralized SMTP Configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    pool: true, // 🏊‍♂️ Keep connection open for multiple emails
    maxConnections: 3, 
    socketTimeout: 60000, 
    connectionTimeout: 60000,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: { 
        rejectUnauthorized: false, // 🔓 Useful for certain server environments
        minVersion: 'TLSv1.2' 
    }
});

// 🔍 Automatic health check on startup
transporter.verify((error) => {
    if (error) {
        console.error("❌ MAILER_SYSTEM_OFFLINE:", error.message);
    } else {
        console.log("✅ MAILER_SYSTEM_ONLINE: Dispatch Ready");
    }
});

module.exports = transporter;