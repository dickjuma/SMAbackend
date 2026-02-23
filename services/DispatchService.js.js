const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const { Resend } = require('resend');
const path = require('path');
const fs = require('fs');
const htmlToPdf = require('html-pdf-node');

const Invoice = require('../models/invoice');
const Quotation = require('../models/quotation');
const Service = require('../models/service');
const AppSettings = require('../models/AppSettings');

class DispatchService {
  constructor() {
    this.baseDir = path.join(__dirname, '../../uploads');
    this.logoPath = path.join(__dirname, '../../assets/logo.png');
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );

    this.oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    this.initStorage();
  }

  async getTransporter() {
    const { token } = await this.oauth2Client.getAccessToken();

    return nodemailer.createTransport({
      service: 'gmail',
      pool: true,
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
  }

  initStorage() {
    const subDirs = ['invoices', 'quotations', 'receipts', 'services', 'temp'];
    subDirs.forEach((sub) => {
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
      console.warn('Logo asset not found at:', this.logoPath);
    }
    return null;
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-GB');
  }

  formatMoney(value, currency) {
    const amount = Number(value || 0);
    return `${currency || 'KES'} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  getDocumentNumber(doc, type) {
    if (type === 'Invoice' || type === 'Receipt') return doc?.invoiceNumber || `INV-${String(doc?._id || '').slice(-6).toUpperCase()}`;
    if (type === 'Quotation') return doc?.quotationNumber || `QTN-${String(doc?._id || '').slice(-6).toUpperCase()}`;
    if (type === 'Service') return doc?.serviceNumber || `SRV-${String(doc?._id || '').slice(-6).toUpperCase()}`;
    return doc?.documentNumber || `DOC-${String(doc?._id || '').slice(-6).toUpperCase()}`;
  }

  async getDocumentBranding(type) {
    const defaults = {
      companyName: 'SMA SYSTEMS',
      tagline: 'Enterprise Resource Management',
      email: 'finance@smassystems.com',
      phone: '+254 719 832 719',
      website: 'smassystems.com',
      addressLine1: 'Nairobi, Kenya',
      addressLine2: '',
      taxIdLabel: 'Tax ID',
      taxIdValue: '',
      footerNote: 'This is a system-generated document from SMA Systems.',
      title: type.toUpperCase()
    };

    try {
      const settings = await AppSettings.findOne({ key: 'app' }).lean();
      const data = settings?.data || {};
      const key = type === 'Receipt' ? 'receipt' : type === 'Quotation' ? 'quotation' : 'invoice';
      const docSettings = data?.documents?.[key] || {};
      const company = data?.company || {};
      return {
        ...defaults,
        ...docSettings,
        companyName: docSettings.companyName || company.legalName || defaults.companyName,
        email: docSettings.email || company.supportEmail || defaults.email,
        phone: docSettings.phone || company.supportPhone || defaults.phone,
        website: docSettings.website || company.website || defaults.website,
        addressLine1: docSettings.addressLine1 || company.addressLine1 || defaults.addressLine1,
        addressLine2: docSettings.addressLine2 || company.addressLine2 || defaults.addressLine2,
        taxIdValue: docSettings.taxIdValue || company.taxPin || defaults.taxIdValue
      };
    } catch (error) {
      return defaults;
    }
  }

  async processEmailDispatch(payload, uploadedFiles = []) {
    const { mode, docId, type, subject, message, recipients, cc, bcc } = payload;
    const parseList = (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value !== 'string') return [];
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    };
    const ccList = parseList(cc);
    const bccList = parseList(bcc);

    if (mode === 'single') {
      const modelMap = {
        Invoice,
        Receipt: Invoice,
        Quotation,
        Service
      };

      const Model = modelMap[type];
      if (!Model) throw new Error(`Invalid doc type: ${type}`);

      const doc = await Model.findById(docId).populate('client').lean();
      if (!doc) throw new Error(`${type} record not found.`);

      const clientData = doc.client || {};
      const targetEmail = clientData.email || doc.email;
      if (!targetEmail) throw new Error('Recipient email missing');

      const shortId = doc._id.toString().slice(-6).toUpperCase();
      const folder = type.toLowerCase() + 's';
      const fileName = `${type.toUpperCase()}_${shortId}.pdf`;
      const filePath = path.join(this.baseDir, folder, fileName);

      await this.generateAndStorePDF(doc, type, filePath);

      const attachments = [
        { filename: fileName, path: filePath, contentType: 'application/pdf' },
        ...uploadedFiles.map((f) => ({ filename: f.originalname, path: f.path }))
      ];

      const info = await this.send(targetEmail, subject, message, type, doc, attachments, { cc: ccList, bcc: bccList });
      this.cleanup(uploadedFiles);
      return info;
    }

    if (mode === 'bulk') {
      const emailList = typeof recipients === 'string' ? JSON.parse(recipients) : recipients;
      const attachments = uploadedFiles.map((f) => ({ filename: f.originalname, path: f.path }));

      const results = [];
      for (const email of emailList || []) {
        try {
          const result = await this.send(email, subject, message, 'BULK', null, attachments, { cc: ccList, bcc: bccList });
          results.push({ email, status: 'sent', messageId: result?.messageId || result?.id || null });
        } catch (err) {
          results.push({ email, status: 'failed', error: err.message });
        }
      }

      this.cleanup(uploadedFiles);
      return results;
    }

    throw new Error('Invalid dispatch mode');
  }

  async generateAndStorePDF(doc, type, targetPath) {
    const logo = this.getLogoBase64();
    const branding = await this.getDocumentBranding(type);
    const accentColor = {
      Invoice: '#1d4ed8',
      Receipt: '#059669',
      Quotation: '#b45309',
      Service: '#4f46e5'
    }[type] || '#0f172a';

    const currency = doc?.currency || 'KES';
    const documentNumber = this.getDocumentNumber(doc, type);
    const issueDate = this.formatDate(doc?.date || doc?.createdAt || new Date());
    const dueDate = this.formatDate(doc?.dueDate || doc?.expiryDate);
    const clientName = doc?.client?.name || doc?.clientDetails?.name || doc?.name || 'Client';
    const clientEmail = doc?.client?.email || doc?.clientDetails?.email || doc?.email || '-';
    const clientPhone = doc?.client?.phone || doc?.clientDetails?.phone || '-';
    const clientAddress = doc?.client?.address || doc?.clientDetails?.address || '-';

    const rawItems = Array.isArray(doc?.items) && doc.items.length > 0
      ? doc.items
      : [
          {
            description: doc?.description || doc?.name || `${type} line item`,
            quantity: 1,
            price: Number(doc?.basePrice || doc?.price || doc?.amount || doc?.total || 0),
            total: Number(doc?.basePrice || doc?.price || doc?.amount || doc?.total || 0)
          }
        ];

    const items = rawItems.map((item) => {
      const quantity = Number(item?.quantity || 1);
      const unitPrice = Number(item?.price || item?.rate || item?.unitPrice || 0);
      const lineTotal = Number(item?.total || quantity * unitPrice || 0);
      return {
        description: item?.description || item?.name || 'Item',
        quantity,
        unitPrice,
        lineTotal
      };
    });

    const subtotal = Number(doc?.subtotal || items.reduce((sum, item) => sum + item.lineTotal, 0));
    const taxPercent = Number(doc?.tax || 0);
    const taxAmount = Number((subtotal * taxPercent) / 100);
    const discount = Number(doc?.discount || 0);
    const grandTotal = Number(doc?.total || subtotal + taxAmount - discount);
    const paidAmount = Number(doc?.paidAmount || (String(doc?.status || '').toUpperCase() === 'PAID' ? grandTotal : 0));
    const balance = Math.max(0, Number(doc?.balance ?? grandTotal - paidAmount));
    const status = String(doc?.status || (type === 'Receipt' ? 'PAID' : 'SENT')).toUpperCase();

    const rowsHtml = items
      .map(
        (item, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${this.escapeHtml(item.description)}</td>
            <td class="right">${item.quantity.toLocaleString('en-US')}</td>
            <td class="right">${this.formatMoney(item.unitPrice, currency)}</td>
            <td class="right strong">${this.formatMoney(item.lineTotal, currency)}</td>
          </tr>
        `
      )
      .join('');

    const htmlContent = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; padding: 34px; font-size: 12px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; }
          .company-title { font-size: 22px; font-weight: 800; letter-spacing: .3px; margin: 0; }
          .tagline { color: #64748b; margin-top: 4px; font-size: 11px; }
          .doc-title { color: ${accentColor}; font-size: 20px; font-weight: 800; margin: 0; text-align: right; }
          .doc-sub { color: #475569; font-size: 11px; margin-top: 6px; text-align: right; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 20px; }
          .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; min-height: 100px; }
          .label { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .7px; margin-bottom: 6px; font-weight: 700; }
          .line { margin: 0 0 4px; }
          .table-wrap { margin-top: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f8fafc; color: #334155; font-size: 10px; text-transform: uppercase; letter-spacing: .7px; text-align: left; padding: 10px; border-bottom: 1px solid #e2e8f0; }
          td { padding: 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
          td.right, th.right { text-align: right; }
          td.strong { font-weight: 700; }
          .totals { margin-top: 14px; width: 340px; margin-left: auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
          .total-row { display: flex; justify-content: space-between; padding: 9px 12px; border-bottom: 1px solid #f1f5f9; }
          .total-row:last-child { border-bottom: 0; background: #f8fafc; font-weight: 800; font-size: 13px; }
          .status { display: inline-block; margin-top: 10px; padding: 5px 9px; border-radius: 999px; font-size: 10px; font-weight: 700; color: white; background: ${accentColor}; }
          .footer { margin-top: 22px; border-top: 1px solid #e2e8f0; padding-top: 12px; color: #475569; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            ${logo ? `<img src="${logo}" style="height:46px;margin-bottom:8px;" />` : ''}
            <p class="company-title">${this.escapeHtml(branding.companyName || 'SMA SYSTEMS')}</p>
            <div class="tagline">${this.escapeHtml(branding.tagline || '')}</div>
          </div>
          <div>
            <p class="doc-title">${this.escapeHtml(branding.title || type.toUpperCase())}</p>
            <div class="doc-sub">No: ${this.escapeHtml(documentNumber)}</div>
            <div class="doc-sub">Issue Date: ${issueDate}</div>
            <div class="doc-sub">Due Date: ${dueDate}</div>
            <span class="status">${this.escapeHtml(status)}</span>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="label">Bill To</div>
            <p class="line"><strong>${this.escapeHtml(clientName)}</strong></p>
            <p class="line">Email: ${this.escapeHtml(clientEmail)}</p>
            <p class="line">Phone: ${this.escapeHtml(clientPhone)}</p>
            <p class="line">Address: ${this.escapeHtml(clientAddress)}</p>
          </div>
          <div class="card">
            <div class="label">From</div>
            <p class="line"><strong>${this.escapeHtml(branding.companyName)}</strong></p>
            <p class="line">${this.escapeHtml(branding.addressLine1 || '-')}</p>
            <p class="line">${this.escapeHtml(branding.addressLine2 || '-')}</p>
            <p class="line">Email: ${this.escapeHtml(branding.email || '-')}</p>
            <p class="line">Phone: ${this.escapeHtml(branding.phone || '-')}</p>
            <p class="line">${this.escapeHtml(branding.taxIdLabel || 'Tax ID')}: ${this.escapeHtml(branding.taxIdValue || '-')}</p>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:40px;">#</th>
                <th>Description</th>
                <th class="right" style="width:90px;">Qty</th>
                <th class="right" style="width:130px;">Unit Price</th>
                <th class="right" style="width:130px;">Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>

        <div class="totals">
          <div class="total-row"><span>Subtotal</span><span>${this.formatMoney(subtotal, currency)}</span></div>
          <div class="total-row"><span>Tax (${taxPercent.toFixed(2)}%)</span><span>${this.formatMoney(taxAmount, currency)}</span></div>
          <div class="total-row"><span>Discount</span><span>${this.formatMoney(discount, currency)}</span></div>
          <div class="total-row"><span>Paid</span><span>${this.formatMoney(paidAmount, currency)}</span></div>
          <div class="total-row"><span>Balance</span><span>${this.formatMoney(balance, currency)}</span></div>
          <div class="total-row"><span>Total</span><span>${this.formatMoney(grandTotal, currency)}</span></div>
        </div>

        <div class="footer">
          <p><strong>Notes:</strong> ${this.escapeHtml(doc?.notes || branding.footerNote || '-')}</p>
          <p><strong>Terms:</strong> ${this.escapeHtml(doc?.terms || 'Payment due as per agreement.')}</p>
          <p>This document was generated by SMA Systems on ${this.formatDate(new Date())}.</p>
        </div>
      </body>
    </html>`;

    const options = {
      format: 'A4',
      printBackground: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };

    const file = { content: htmlContent };
    const pdfBuffer = await htmlToPdf.generatePdf(file, options);
    fs.writeFileSync(targetPath, pdfBuffer);
  }

  async send(to, subject, message, type, doc, attachments, envelope = {}) {
    const html = `<div style="font-family:sans-serif;background-color:#f8fafc;padding:40px;">
      <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
        <div style="background:#0f172a;padding:20px;color:white;"><span style="font-weight:bold;letter-spacing:2px;">SMA_SYSTEMS</span></div>
        <div style="padding:40px;"><p style="color:#334155;line-height:1.6;white-space:pre-wrap;">${message || ''}</p></div>
        <div style="padding:20px;background:#f1f5f9;font-size:10px;color:#94a3b8;text-align:center;">
          CONFIDENTIAL | REF: ${doc ? doc._id : 'BATCH'} | ${new Date().getFullYear()}
        </div>
      </div></div>`;

    const from = process.env.EMAIL_FROM || `SMA Systems <${process.env.SMTP_USER}>`;

    if (this.resend) {
      const resendAttachments = (attachments || []).map((a) => ({
        filename: a.filename,
        content: fs.readFileSync(a.path)
      }));

      const result = await this.resend.emails.send({
        from,
        to: Array.isArray(to) ? to : [to],
        cc: Array.isArray(envelope.cc) && envelope.cc.length > 0 ? envelope.cc : undefined,
        bcc: Array.isArray(envelope.bcc) && envelope.bcc.length > 0 ? envelope.bcc : undefined,
        subject: subject || 'SMA Dispatch',
        html,
        attachments: resendAttachments
      });

      return { id: result?.data?.id || result?.id, messageId: result?.data?.id || result?.id };
    }

    const transporter = await this.getTransporter();
    return transporter.sendMail({
      from,
      to,
      cc: Array.isArray(envelope.cc) && envelope.cc.length > 0 ? envelope.cc : undefined,
      bcc: Array.isArray(envelope.bcc) && envelope.bcc.length > 0 ? envelope.bcc : undefined,
      subject: subject || 'SMA Dispatch',
      attachments,
      html
    });
  }

  cleanup(files) {
    (files || []).forEach((f) => {
      try {
        if (f?.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
      } catch (e) {
        console.warn('Cleanup failed for file:', f?.path);
      }
    });
  }
}

module.exports = new DispatchService();
