const nodemailer = require('nodemailer');

const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN,
    SMTP_USER
} = process.env;


// --- STEP 1: LOG CONFIG VALIDATION ---
// This checks if your .env variables are actually reaching the file
const configCheck = {
    GOOGLE_CLIENT_ID: !!GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN: !!GOOGLE_REFRESH_TOKEN,
    SMTP_USER: !!SMTP_USER
};

console.log("🛠️  MAIL_CONFIG_INTEGRITY_CHECK:", configCheck);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        type: 'OAuth2',
        user: SMTP_USER,
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        refreshToken: GOOGLE_REFRESH_TOKEN,
    }
});

// --- STEP 2: DETAILED ERROR CATCHING ---
transporter.verify((error, success) => {
    if (error) {
        console.error("❌ MAILER_SYSTEM_OFFLINE");
        
        // Output specific failure reasons
        if (error.message.includes("invalid_grant")) {
            console.error("👉 REASON: Invalid/Expired Refresh Token. You need to regenerate it in OAuth Playground.");
        } else if (error.message.includes("invalid_client")) {
            console.error("👉 REASON: Wrong Client ID or Client Secret.");
        } else if (error.message.includes("Unauthorized")) {
            console.error("👉 REASON: SMTP_USER email does not match the email that generated the tokens.");
        } else {
            console.error("👉 TECHNICAL_DETAILS:", error);
        }
    } else {
        console.log("🚀 MAILER_SYSTEM_ONLINE: Google OAuth2 Handshake Success");
    }
});

module.exports = transporter;