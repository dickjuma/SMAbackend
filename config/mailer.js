const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  SMTP_USER,
  RESEND_API_KEY,
  EMAIL_FROM
} = process.env;

const fromAddress = EMAIL_FROM || `SMA Systems <${SMTP_USER}>`;

if (RESEND_API_KEY) {
  const resend = new Resend(RESEND_API_KEY);

  module.exports = {
    async sendMail(options = {}) {
      const result = await resend.emails.send({
        from: options.from || fromAddress,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject || 'SMA Notification',
        html: options.html || options.text || ''
      });
      return { messageId: result?.data?.id || result?.id || null };
    }
  };
} else {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: SMTP_USER,
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      refreshToken: GOOGLE_REFRESH_TOKEN
    }
  });

  transporter.verify((error) => {
    if (error) {
      console.error('MAILER_SYSTEM_OFFLINE:', error.message);
    } else {
      console.log('MAILER_SYSTEM_ONLINE');
    }
  });

  module.exports = transporter;
}
