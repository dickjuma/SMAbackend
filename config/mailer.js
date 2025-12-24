const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
   
    secure: Number(process.env.SMTP_PORT) === 465, 
    
 
    family: 4, 
    
    pool: true,
    maxConnections: 3, 
    socketTimeout: 60000, 
    connectionTimeout: 60000,
    greetingTimeout: 60000,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: { 
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2' 
    }
});

transporter.verify((error) => {
    if (error) {
        console.error(" MAILER_SYSTEM_OFFLINE:");
        console.error("Error Code:", error.code);
        console.error("Message:", error.message);
    } else {
        console.log(" MAILER_SYSTEM_ONLINE: Dispatch Ready");
    }
});

module.exports = transporter;