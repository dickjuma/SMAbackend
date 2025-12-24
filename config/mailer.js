const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({

    host: process.env.SMTP_HOST || 'smtp.gmail.com',
  
    port: 587,
    secure: false, 
    pool: true,
    maxConnections: 3,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS 
    },
    
    family: 4, 
    socketTimeout: 60000, 
    connectionTimeout: 60000,
    greetingTimeout: 60000,
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