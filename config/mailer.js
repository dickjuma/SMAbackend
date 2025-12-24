const nodemailer = require('nodemailer');


const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 465,
    secure: true,
    pool: true,
    maxConnections: 3,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    //
    socketTimeout: 30000, 
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    tls: {
       
        rejectUnauthorized: false 
    }
});


transporter.verify((error) => {
    if (error) {
        console.error(" MAILER_SYSTEM_OFFLINE:", error.message);
    } else {
        console.log(" MAILER_SYSTEM_ONLINE: Dispatch Ready");
    }
});

module.exports = transporter;