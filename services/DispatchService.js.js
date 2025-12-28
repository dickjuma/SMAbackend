const nodemailer = require('nodemailer');
const { google } = require('googleapis'); // npm install googleapis
const path = require('path');
const fs = require('fs');
const html_to_pdf = require('html-pdf-node');

const Invoice = require('../models/invoice');
const Quotation = require('../models/quotation');
const Service = require('../models/service');

class DispatchService {
    constructor() {
        this.baseDir = path.join(__dirname, '../../uploads');
        this.logoPath = path.join(__dirname, '../../assets/logo.png');

        // Setup OAuth2 Client
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            "https://developers.google.com/oauthplayground"
        );

        this.oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });

        this.initStorage();
    }

    // Helper to get an active transporter with a fresh token
    async getTransporter() {
        try {
            const { token } = await this.oauth2Client.getAccessToken();
            
            return nodemailer.createTransport({
                service: 'gmail',
                pool: true, // Optimizes for bulk
                maxConnections: 5,
                auth: {
                    type: 'OAuth2',
                    user: process.env.SMTP_USER,
                    clientId: process.env.GOOGLE_CLIENT_ID,
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
                    accessToken: token
                }
            });
        } catch (error) {
            console.error("OAuth2 Token Generation Failed:", error.message);
            throw new Error("MAILER_AUTH_FAILURE");
        }
    }

    initStorage() {
        const subDirs = ['invoices', 'quotations', 'receipts', 'services', 'temp'];
        subDirs.forEach(sub => {
            const targetPath = path.join(this.baseDir, sub);
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath, { recursive: true });
            }
        });
    }

    getLogoBase64() {
        try {
            if (fs.existsSync(this.logoPath)) {
                const bitmap = fs.readFileSync(this.logoPath);
                return `data:image/png;base64,${Buffer.from(bitmap).toString('base64')}`;
            }
        } catch (e) {
            console.warn("Logo asset not found at:", this.logoPath);
        }
        return null;
    }

    async processEmailDispatch(payload, uploadedFiles = []) {
        const { mode, docId, type, subject, message, recipients } = payload;

        // Initialize transporter with OAuth2
        const transporter = await this.getTransporter();

        if (mode === 'single') {
            const modelMap = { 
                'Invoice': Invoice, 
                'Receipt': Invoice, 
                'Quotation': Quotation, 
                'Service': Service 
            };
            
            const Model = modelMap[type];
            if (!Model) throw new Error(`Invalid doc type: ${type}`);

            const doc = await Model.findById(docId).populate('client').lean();
            if (!doc) throw new Error(`${type} record not found.`);

            const clientData = doc.client || {};
            const targetEmail = clientData.email || doc.email;
            
            const shortId = doc._id.toString().slice(-6).toUpperCase();
            const folder = type.toLowerCase() + 's';
            const fileName = `${type.toUpperCase()}_${shortId}.pdf`;
            const filePath = path.join(this.baseDir, folder, fileName);

            await this.generateAndStorePDF(doc, type, filePath);

            const attachments = [{
                filename: fileName,
                path: filePath,
                contentType: 'application/pdf'
            }, ...uploadedFiles.map(f => ({ 
                filename: f.originalname, 
                path: f.path 
            }))];

            const info = await this.send(transporter, targetEmail, subject, message, type, doc, attachments);
            this.cleanup(uploadedFiles);
            return info;
        }

        if (mode === 'bulk') {
            const emailList = typeof recipients === 'string' ? JSON.parse(recipients) : recipients;
            const attachments = uploadedFiles.map(f => ({ filename: f.originalname, path: f.path }));
            
            const results = [];
            for (const email of emailList) {
                try {
                    const result = await this.send(transporter, email, subject, message, 'BULK', null, attachments);
                    results.push({ email, status: 'sent', messageId: result.messageId });
                } catch (err) {
                    results.push({ email, status: 'failed', error: err.message });
                }
            }
            
            this.cleanup(uploadedFiles);
            return results;
        }
    }

    async generateAndStorePDF(doc, type, targetPath) {
        const logo = this.getLogoBase64();
        const shortId = doc._id.toString().slice(-6).toUpperCase();
        const accentColor = { 
            'Invoice': '#2563eb', 
            'Receipt': '#10b981', 
            'Quotation': '#f59e0b', 
            'Service': '#6366f1' 
        }[type] || '#0f172a';

        const clientName = doc.client?.name || doc.name || 'Client Entity';
        const clientEmail = doc.client?.email || doc.email || 'contact@client.com';
        const items = doc.items || [{ 
            description: doc.description || doc.name || 'Services Rendered', 
            quantity: 1, 
            total: doc.basePrice || doc.price || 0 
        }];
        const totalSum = items.reduce((a, b) => a + (Number(b.total) || 0), 0);

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #1e293b; }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; }
                    .logo-box { font-weight: 900; background: #0f172a; color: white; padding: 10px; }
                    .accent { color: ${accentColor}; font-weight: 900; text-transform: uppercase; }
                    .table { width: 100%; border-collapse: collapse; margin-top: 30px; }
                    .table th { text-align: left; font-size: 10px; text-transform: uppercase; color: #64748b; padding: 10px; background: #f8fafc; }
                    .table td { padding: 15px 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
                    .total-box { float: right; margin-top: 20px; background: #0f172a; color: white; padding: 20px; border-radius: 10px; min-width: 200px; }
                    .paid-stamp { border: 4px solid #10b981; color: #10b981; padding: 10px; transform: rotate(15deg); display: inline-block; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        ${logo ? `<img src="${logo}" style="height: 50px;" />` : `<div class="logo-box">SMA SYSTEMS</div>`}
                    </div>
                    <div style="text-align: right">
                        <h2 class="accent">${type}</h2>
                        <div style="font-size: 10px; color: #94a3b8;">REF: ${shortId} | ${new Date().toLocaleDateString()}</div>
                    </div>
                </div>
                <div style="margin-top: 40px;">
                    <small style="color: #94a3b8; font-weight: bold;">ISSUED TO:</small>
                    <div style="font-weight: bold;">${clientName}</div>
                    <div style="font-size: 12px; color: #64748b;">${clientEmail}</div>
                </div>
                ${type === 'Receipt' ? `<div style="text-align: center; margin: 20px;"><div class="paid-stamp">PAID IN FULL</div></div>` : ''}
                <table class="table">
                    <thead>
                        <tr><th>Description</th><th style="text-align: right;">Amount</th></tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td>${item.description}</td>
                                <td style="text-align: right; font-weight: bold;">${doc.currency || 'KES'} ${Number(item.total).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="total-box">
                    <div style="font-size: 10px; opacity: 0.7;">TOTAL BALANCE</div>
                    <div style="font-size: 24px; font-weight: 900;">${doc.currency || 'KES'} ${totalSum.toLocaleString()}</div>
                </div>
            </body>
            </html>
        `;

        const options = { 
            format: 'A4', 
            printBackground: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        };
        
        const file = { content: htmlContent };
        const pdfBuffer = await html_to_pdf.generatePdf(file, options);
        fs.writeFileSync(targetPath, pdfBuffer);
    }

    async send(transporter, to, subject, message, type, doc, attachments) {
        return transporter.sendMail({
            from: `"SMA Finance Hub" <${process.env.SMTP_USER}>`,
            to,
            subject,
            attachments,
            html: `
                <div style="font-family: sans-serif; background-color: #f8fafc; padding: 40px;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden;">
                        <div style="background: #0f172a; padding: 20px; color: white;">
                            <span style="font-weight: bold; letter-spacing: 2px;">SMA_SYSTEMS</span>
                        </div>
                        <div style="padding: 40px;">
                            <p style="color: #334155; line-height: 1.6; white-space: pre-wrap;">${message}</p>
                        </div>
                        <div style="padding: 20px; background: #f1f5f9; font-size: 10px; color: #94a3b8; text-align: center;">
                            CONFIDENTIAL • REF: ${doc ? doc._id : 'BATCH'} • ${new Date().getFullYear()}
                        </div>
                    </div>
                </div>`
        });
    }

    cleanup(files) {
        files.forEach(f => { 
            try { 
                if (fs.existsSync(f.path)) fs.unlinkSync(f.path); 
            } catch(e) {
                console.warn("Cleanup failed for file:", f.path);
            } 
        });
    }
}

module.exports = new DispatchService();