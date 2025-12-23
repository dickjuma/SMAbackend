const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const html_to_pdf = require('html-pdf-node');

const Invoice = require('../models/invoice');
const Quotation = require('../models/quotation');
const Service = require('../models/service');

class DispatchService {
    constructor() {
        this.baseDir = 'C:/Users/USER/Desktop/SMA/myapp/uploads';
        this.logoPath = 'C:/Users/USER/Desktop/SMA/myapp/assets/logo.png';
        
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: Number(process.env.SMTP_PORT) === 465,
            pool: true,
            maxConnections: 3, 
            socketTimeout: 60000, 
            connectionTimeout: 60000,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            tls: { 
                rejectUnauthorized: false,
                minVersion: 'TLSv1.2' 
            }
        });

        this.initStorage();
    }

    initStorage() {
        const subDirs = ['invoices', 'quotations', 'receipts', 'services', 'temp'];
        subDirs.forEach(sub => {
            const targetPath = path.join(this.baseDir, sub);
            if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
        });
    }

    getLogoBase64() {
        try {
            if (fs.existsSync(this.logoPath)) {
                const bitmap = fs.readFileSync(this.logoPath);
                return `data:image/png;base64,${Buffer.from(bitmap).toString('base64')}`;
            }
        } catch (e) {
            console.warn("Logo not found, falling back to text branding.");
        }
        return null;
    }

    async processEmailDispatch(payload, uploadedFiles = []) {
        const { mode, docId, type, subject, message, recipients } = payload;

        try {
            await this.transporter.verify();
        } catch (err) {
            console.error("Transporter connection failed:", err);
        }

        if (mode === 'single') {
            /** * CHANGE LOG: Mapped 'Receipt' to 'Invoice' model.
             * This ensures that when a user selects a receipt, the system pulls 
             * the original Invoice data instead of looking for a non-existent record.
             */
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

            // The generateAndStorePDF logic uses the 'type' to apply the "PAID" stamp if it's a Receipt
            await this.generateAndStorePDF(doc, type, filePath);

            const attachments = [{
                filename: fileName,
                path: filePath,
                contentType: 'application/pdf'
            }, ...uploadedFiles.map(f => ({ filename: f.originalname, path: f.path }))];

            const info = await this.send(targetEmail, subject, message, type, doc, attachments);
            this.cleanup(uploadedFiles);
            return info;
        }

        if (mode === 'bulk') {
            const emailList = typeof recipients === 'string' ? JSON.parse(recipients) : recipients;
            const attachments = uploadedFiles.map(f => ({ filename: f.originalname, path: f.path }));
            
            const results = [];
            for (const email of emailList) {
                const result = await this.send(email, subject, message, 'BULK', null, attachments);
                results.push(result);
            }
            
            this.cleanup(uploadedFiles);
            return results;
        }
    }

    async generateAndStorePDF(doc, type, targetPath) {
        const logo = this.getLogoBase64();
        const shortId = doc._id.toString().slice(-6).toUpperCase();
        const accentColor = { 'Invoice': '#2563eb', 'Receipt': '#10b981', 'Quotation': '#f59e0b', 'Service': '#6366f1' }[type] || '#0f172a';

        const clientName = doc.client?.name || doc.name || 'Client Entity';
        const clientEmail = doc.client?.email || doc.email || 'contact@client.com';
        const clientAddress = doc.client?.address || 'Verified Client Address';

        const items = doc.items || [{ 
            description: doc.description || doc.name || 'Professional Services Rendered', 
            quantity: 1, 
            total: doc.basePrice || doc.price || 0 
        }];
        const totalSum = items.reduce((a, b) => a + (Number(b.total) || 0), 0);

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap');
                    body { font-family: 'Plus Jakarta Sans', sans-serif; -webkit-print-color-adjust: exact; }
                </style>
            </head>
            <body class="p-0 m-0 bg-white">
                <div class="p-12">
                    <div class="flex justify-between items-start border-b-2 border-slate-100 pb-8">
                        <div class="flex items-center gap-4">
                            ${logo ? `<img src="${logo}" class="h-12 w-auto" />` : `<div class="bg-slate-900 text-white p-2 font-black italic">SMA</div>`}
                            <div>
                                <h1 class="text-xl font-extrabold tracking-tight text-slate-900">SMA_SYSTEMS</h1>
                                <p class="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em]">Enterprise Finance Division</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <h2 class="text-3xl font-black uppercase italic" style="color: ${accentColor}">${type}</h2>
                            <p class="text-[10px] font-mono font-bold text-slate-400">REFERENCE: ${shortId}</p>
                            <p class="text-[10px] font-mono text-slate-400">DATE: ${new Date().toLocaleDateString()}</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-12 my-12">
                        <div>
                            <p class="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Issued_To</p>
                            <p class="text-md font-extrabold text-slate-900 uppercase">${clientName}</p>
                            <p class="text-xs text-slate-500 font-medium">${clientEmail}</p>
                            <p class="text-xs text-slate-500 font-medium">${clientAddress}</p>
                        </div>
                        <div class="flex justify-end">
                            ${type === 'Receipt' ? `
                            <div class="border-4 border-emerald-500/20 bg-emerald-50 px-8 py-2 rounded-xl rotate-12 flex items-center justify-center">
                                <span class="text-emerald-500 font-black text-2xl tracking-tighter">PAID_IN_FULL</span>
                            </div>` : `
                            <div class="text-right">
                                <p class="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Payment_Terms</p>
                                <p class="text-xs font-bold text-slate-700">Due Upon Receipt</p>
                                <p class="text-[9px] text-slate-400 mt-1">Bank Transfer / Corporate Check</p>
                            </div>`}
                        </div>
                    </div>

                    <table class="w-full border-collapse">
                        <thead>
                            <tr class="bg-slate-50">
                                <th class="py-4 px-6 text-left text-[9px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-200">Asset_Description</th>
                                <th class="py-4 px-6 text-right text-[9px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-200">Valuation</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(item => `
                                <tr>
                                    <td class="py-5 px-6 text-xs font-bold text-slate-700 border-b border-slate-50 uppercase">${item.description}</td>
                                    <td class="py-5 px-6 text-right text-xs font-mono font-black text-slate-900 border-b border-slate-50">
                                        ${doc.currency || 'USD'} ${Number(item.total).toLocaleString()}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div class="mt-8 flex justify-end">
                        <div class="w-64 bg-slate-900 p-6 rounded-2xl shadow-xl">
                            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total_Balance</p>
                            <div class="flex items-baseline gap-1 text-white">
                                <span class="text-sm font-bold opacity-50">${doc.currency || 'USD'}</span>
                                <span class="text-3xl font-black tracking-tighter">${totalSum.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div class="mt-24 pt-12 border-t border-slate-100 flex justify-between items-end">
                        <div class="max-w-xs">
                            <p class="text-[8px] font-bold text-slate-400 uppercase tracking-tighter leading-relaxed">
                                This is a system-generated document authorized by the SMA Finance Protocol. 
                                Digital signatures are encrypted and stored in the primary ledger.
                                <br/><span class="font-mono mt-2 block">HASH_STAMP: ${doc._id}</span>
                            </p>
                        </div>
                        <div class="text-right">
                            <div class="w-48 h-12 border-b-2 border-slate-900 mb-2 ml-auto"></div>
                            <p class="text-[9px] font-black uppercase text-slate-900">Authorized Director</p>
                            <p class="text-[8px] font-bold text-slate-400 uppercase">SMA Systems Operations</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;

        const options = { format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } };
        const pdfBuffer = await html_to_pdf.generatePdf({ content: htmlContent }, options);
        fs.writeFileSync(targetPath, pdfBuffer);
    }

    async send(to, subject, message, type, doc, attachments) {
        return this.transporter.sendMail({
            from: `"SMA Finance Hub" <${process.env.SMTP_USER}>`,
            to,
            subject,
            attachments,
            html: `
                <div style="font-family: sans-serif; background-color: #f8fafc; padding: 40px;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden;">
                        <div style="background: #0f172a; padding: 30px; color: white;">
                            <span style="font-size: 10px; font-weight: 900; letter-spacing: 3px; color: #10b981;">SMA_SYSTEMS</span>
                        </div>
                        <div style="padding: 40px;">
                            <p style="font-size: 15px; color: #334155; line-height: 1.6; white-space: pre-wrap;">${message}</p>
                        </div>
                        <div style="padding: 20px 40px; background: #f1f5f9; font-size: 9px; color: #94a3b8; text-align: center;">
                            CONFIDENTIAL • REF: ${doc ? doc._id : 'BATCH'} • ${new Date().getFullYear()}
                        </div>
                    </div>
                </div>`
        });
    }

    cleanup(files) {
        files.forEach(f => { try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch(e) {} });
    }
}

module.exports = new DispatchService();