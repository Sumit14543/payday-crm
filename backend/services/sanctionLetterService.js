const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const { ensureUploadDir, uploadPath } = require('../config/uploads');
const emailService = require('./emailService');
const { getActiveBrand } = require('../config/db');

const sanctionsDir = uploadPath('sanctions');
const brandDir = uploadPath('brand');

function getWaqtBrandDetails() {
  return {
    slug: 'waqtfinance',
    name: 'Waqt Finance',
    cin: 'CIN-U67120RJ1995PTC009521',
    gstin: 'GSTIN : 08AAACW1509R1ZX',
    website: 'www.waqtfinance.com',
    lender: 'WAQT FINANCE PRIVATE LIMITED',
    address: '15 K- 5 Jyoti Nagar Housing Board Colony, Sahakar Marg, Jaipur, Rajasthan 302005',
    phone: '+91 92170 86608',
    email: 'customercare@waqtfinance.com',
    logoUrl: '/logo.webp',
    themeColor: '#059669',
  };
}

const BRAND = new Proxy({}, {
  get(target, prop) {
    const brand = getActiveBrand();
    if (brand && brand.slug === 'geetpay') {
      return getWaqtBrandDetails()[prop];
    }
    return brand ? brand[prop] : getWaqtBrandDetails()[prop];
  }
});

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function moneyOnly(value) {
  return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

async function resolveLogoPath() {
  const activeBrand = getActiveBrand();
  const brandSlug = (activeBrand && activeBrand.slug === 'geetpay') ? 'waqtfinance' : ((activeBrand && activeBrand.slug) || 'waqtfinance');
  const logoUrl = (activeBrand && activeBrand.slug === 'geetpay') ? '/logo.webp' : ((activeBrand && activeBrand.logoUrl) || '/logo.webp');
  const logoFileName = path.basename(logoUrl);

  const sourceLogoPath = [
    process.env.SANCTION_LOGO_PATH,
    process.env.BRAND_LOGO_PATH,
    path.resolve(__dirname, '..', '..', 'frontend', 'public', logoFileName),
    path.resolve(process.cwd(), '..', 'testing', logoFileName),
    path.resolve(process.cwd(), '..', 'payday', logoFileName),
    path.resolve(process.cwd(), logoFileName),
  ].filter(Boolean).find((candidate) => fs.existsSync(candidate));

  if (!sourceLogoPath) return '';

  const brandSlugLogoPath = path.join(brandDir, `${brandSlug}-logo.png`);
  const brandSlugLogoMetaPath = path.join(brandDir, `${brandSlug}-logo.json`);

  await fs.promises.mkdir(brandDir, { recursive: true });
  const sourceStat = await fs.promises.stat(sourceLogoPath);
  const sourceMeta = `${sourceLogoPath}:${sourceStat.size}:${sourceStat.mtimeMs}`;
  const cachedMeta = fs.existsSync(brandSlugLogoMetaPath)
    ? await fs.promises.readFile(brandSlugLogoMetaPath, 'utf8').catch(() => '')
    : '';

  if (!fs.existsSync(brandSlugLogoPath) || cachedMeta !== sourceMeta) {
    await sharp(sourceLogoPath).png().resize({ width: 160, withoutEnlargement: true }).toFile(brandSlugLogoPath);
    await fs.promises.writeFile(brandSlugLogoMetaPath, sourceMeta);
  }

  return brandSlugLogoPath;
}

function getBrandInitials(name) {
  if (!name) return { l1: 'W', l2: 'F' };
  if (name.toLowerCase().includes('geet')) return { l1: 'G', l2: 'P' };
  if (name.toLowerCase().includes('waqt')) return { l1: 'W', l2: 'F' };

  const clean = name.replace(/[^a-zA-Z\s]/g, '').trim();
  const words = clean.split(/\s+/);
  let l1 = words[0] ? words[0][0] : 'W';
  let l2 = '';
  if (words[1] && words[1][0]) {
    l2 = words[1][0];
  } else if (words[0]) {
    const capMatches = words[0].match(/[A-Z]/g);
    if (capMatches && capMatches.length > 1) {
      l1 = capMatches[0];
      l2 = capMatches[1];
    } else if (words[0].length > 1) {
      l2 = words[0][1].toUpperCase();
    }
  }
  return { l1, l2: l2 || 'F' };
}

function drawHeader(doc, logoPath) {
  doc.save();
  doc.rect(0, 0, 595, 104).fill('#ffffff');
  doc.fillColor('#111827').font('Helvetica').fontSize(8.5);
  doc.text(BRAND.cin, 55, 32, { width: 180 });
  doc.text(BRAND.gstin, 55, 47, { width: 180 });
  doc.text(BRAND.website, 415, 38, { width: 125, align: 'right' });

  doc.polygon([38, 25], [50, 18], [50, 78], [38, 86]).fill('#ef4444');
  doc.polygon([557, 25], [545, 18], [545, 78], [557, 86]).fill('#ef4444');

  if (logoPath) {
    doc.image(logoPath, 266, 25, { width: 64, height: 64, fit: [64, 64] });
  } else {
    doc.roundedRect(270, 24, 56, 56, 8).fill('#f8fafc').stroke('#e5e7eb');
    const { l1, l2 } = getBrandInitials(BRAND.name);
    doc.fillColor('#ef4444').fontSize(22).font('Helvetica-Bold').text(l1, 282, 35);
    doc.fillColor('#2563eb').text(l2, 299, 35);
  }

  doc.moveTo(55, 100).lineTo(540, 100).lineWidth(1).strokeColor('#0f766e').stroke();
  doc.restore();
}

function drawFooter(doc) {
  const y = 724;
  doc.save();
  doc.moveTo(55, y - 12).lineTo(540, y - 12).lineWidth(1).strokeColor('#0f766e').stroke();
  doc.fillColor('#4b5563').font('Helvetica').fontSize(8.5);
  doc.text(BRAND.address, 55, y, { width: 485, align: 'center' });
  doc.text(`${BRAND.phone}        ${BRAND.email}`, 55, y + 17, { width: 485, align: 'center' });
  doc.moveTo(55, y + 38).lineTo(540, y + 38).lineWidth(2).strokeColor('#ef4444').stroke();
  doc.restore();
}

function writeLine(doc, text, options = {}) {
  doc.fillColor('#111827')
    .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(options.size || 9.5)
    .text(text, options.x || 78, doc.y, {
      width: options.width || 440,
      align: options.align || 'left',
      continued: Boolean(options.continued),
      lineGap: options.lineGap ?? 2,
    });
  if (!options.continued) doc.moveDown(options.gap ?? 0.45);
}

function writeRichLine(doc, parts, options = {}) {
  const x = options.x || 78;
  const width = options.width || 440;
  doc.x = x;
  doc.fillColor('#111827').fontSize(options.size || 9.5);
  parts.forEach((part, index) => {
    doc.font(part.bold ? 'Helvetica-Bold' : 'Helvetica').text(part.text, {
      width,
      continued: index < parts.length - 1,
      lineGap: options.lineGap ?? 2,
    });
  });
  doc.moveDown(options.gap ?? 0.35);
}

function bullet(doc, parts) {
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text('•', 118, doc.y, { continued: true });
  doc.text('  ', { continued: true });
  parts.forEach((part, index) => {
    doc.font(part.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).text(part.text, {
      continued: index < parts.length - 1,
      width: 360,
    });
  });
  doc.moveDown(0.35);
}

function agreementSummary(sanction) {
  return {
    amount: formatCurrency(sanction.principalAmount),
    amountPlain: moneyOnly(sanction.principalAmount),
    interest: `${Number(sanction.interestRate || 0).toFixed(2)}%`,
    processingFee: formatCurrency(sanction.processingFee + sanction.gstAmount),
    processingFeeBase: formatCurrency(sanction.processingFee),
    gst: formatCurrency(sanction.gstAmount),
    disbursed: formatCurrency(sanction.disbursedAmount),
    dueDate: formatDate(sanction.dueDate),
    repayment: formatCurrency(sanction.repaymentAmount),
    bank: `${sanction.bankName || 'registered bank account'}${sanction.accountNumber ? ` - ${sanction.accountNumber}` : ''}${sanction.ifscCode ? ` (${sanction.ifscCode})` : ''}`,
    penal: `${Number(sanction.penalInterestRate || 2).toFixed(2)}%`,
    lateFee: sanction.lateFee || '2% of the loan amount, whichever is higher',
  };
}

async function generateSanctionPdf(sanction) {
  await fs.promises.mkdir(sanctionsDir, { recursive: true });
  const logoPath = await resolveLogoPath();
  const fileName = `${sanction.agreementNumber.replace(/[^a-z0-9_-]/gi, '_')}.pdf`;
  const absolutePath = path.join(sanctionsDir, fileName);
  const relativePath = `/uploads/sanctions/${fileName}`;
  const summary = agreementSummary(sanction);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 55, size: 'A4' });
    const stream = fs.createWriteStream(absolutePath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);

    drawHeader(doc, logoPath);
    doc.y = 156;
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12)
      .text('SANCTION LETTER', 78, doc.y, { width: 440, align: 'center', underline: true });
    doc.moveDown(1.2);

    writeRichLine(doc, [
      { text: 'Dear ' },
      { text: `${sanction.borrower || 'Customer'},`, bold: true },
    ]);
    writeRichLine(doc, [
      { text: 'Sub: ', bold: true },
      { text: `Short Term Loan from ${BRAND.lender}.`, bold: true },
    ]);
    writeRichLine(doc, [
      { text: `With reference to your application dated ${formatDate(sanction.agreementDate)} for a Short Term Loan, we have the pleasure of sanctioning you an amount of ` },
      { text: `${summary.amount}`, bold: true },
      { text: ' subject to the following terms and conditions:' },
    ], { gap: 0.55 });

    bullet(doc, [
      { text: 'Loan Amount: ', bold: true },
      { text: summary.amountPlain },
    ]);
    bullet(doc, [
      { text: 'Interest Rate: ', bold: true },
      { text: summary.interest },
    ]);

    writeLine(doc, 'As of effective date, the Schedule of interest and the charges are as follows:', { gap: 0.25 });
    writeRichLine(doc, [
      { text: 'Interest on the Loan: ', bold: true },
      { text: `${summary.interest} per day from the date of disbursal until the date of repayment. In the event of failure to make payment on due date, a penal interest of ${summary.penal} per day shall be applicable from the due date till the date of payment.` },
    ], { gap: 0.35 });
    writeRichLine(doc, [
      { text: 'Processing Fee: ', bold: true },
      { text: `${BRAND.name} will charge a processing fee of ${summary.processingFeeBase} plus applicable GST of ${summary.gst}. Net disbursal amount will be ${summary.disbursed}.` },
    ], { gap: 0.35 });
    writeRichLine(doc, [
      { text: 'Late Fee: ', bold: true },
      { text: `In case of delay in payment of amount due, late fee charges shall be ${summary.lateFee}.` },
    ], { gap: 0.35 });
    writeRichLine(doc, [
      { text: 'Repayment: ', bold: true },
      { text: `The repayment amount of ${summary.repayment} is due on ${summary.dueDate}.` },
    ], { gap: 0.35 });
    writeRichLine(doc, [
      { text: 'Disbursement: ', bold: true },
      { text: `The amount will be disbursed by ${sanction.disbursementMode || 'Bank Transfer'} to ${summary.bank} on ${formatDate(sanction.disbursementDate || sanction.agreementDate)}.` },
    ], { gap: 0.35 });
    writeRichLine(doc, [
      { text: 'Maximum Interest Rate: ', bold: true },
      { text: 'The interest rate on the loan shall not exceed 50% per month.' },
    ], { gap: 0.45 });

    writeLine(doc, `${BRAND.name} may, at its sole discretion, waive or reduce the charges as mentioned above, on a case to case basis.`);
    if (sanction.conditions) {
      writeRichLine(doc, [
        { text: 'Additional Conditions: ', bold: true },
        { text: sanction.conditions },
      ], { gap: 0.45 });
    }
    writeLine(doc, `For any queries, you may write to us at ${BRAND.email}.`);
    doc.moveDown(0.4);
    writeLine(doc, 'Look forward to serving you.');
    writeLine(doc, 'Kind Regards');
    writeLine(doc, 'Loan Department', { gap: 0.1 });
    writeLine(doc, BRAND.name, { bold: true });

    drawFooter(doc);
    doc.end();
  });

  return { absolutePath, relativePath };
}

function buildSanctionEmailHtml(sanction) {
  const summary = agreementSummary(sanction);
  const domainUrl = sanction.baseUrl || process.env.PUBLIC_APP_URL || 'https://payday.waqtmoney.com';
  const token = sanction.decisionToken || '';
  const acceptUrl = `${domainUrl}/sanction-decision/${encodeURIComponent(token)}?action=accept`;
  const rejectUrl = `${domainUrl}/sanction-decision/${encodeURIComponent(token)}?action=reject`;

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.55;font-size:14px;max-width:600px;margin:0 auto">
      <p>Dear <strong>${sanction.borrower || 'Customer'}</strong>,</p>
      <p><strong>Sub: Short Term Loan from ${BRAND.lender}.</strong></p>
      <p>With reference to your application dated ${formatDate(sanction.agreementDate)} for a Short Term Loan, we have the pleasure of sanctioning you an amount of <strong>${summary.amount}</strong> subject to the following terms and conditions:</p>
      <ul>
        <li><strong>Loan Amount:</strong> ${summary.amountPlain}</li>
        <li><strong>Interest Rate:</strong> ${summary.interest}</li>
      </ul>
      <p>As of effective date, the schedule of interest and charges are as follows:</p>
      <p><strong>Interest on the Loan:</strong> ${summary.interest} per day from the date of disbursal until the date of repayment. In the event of failure to make payment on due date, a penal interest of ${summary.penal} per day shall be applicable from the due date till the date of payment.</p>
      <p><strong>Processing Fee:</strong> ${BRAND.name} will charge a processing fee of ${summary.processingFeeBase} plus applicable GST of ${summary.gst}. Net disbursal amount will be ${summary.disbursed}.</p>
      <p><strong>Late Fee:</strong> In case of delay in payment of amount due, late fee charges shall be ${summary.lateFee}.</p>
      <p><strong>Repayment:</strong> The repayment amount of ${summary.repayment} is due on ${summary.dueDate}.</p>
      <p><strong>Disbursement:</strong> The amount will be disbursed by ${sanction.disbursementMode || 'Bank Transfer'} to ${summary.bank} on ${formatDate(sanction.disbursementDate || sanction.agreementDate)}.</p>
      <p><strong>Maximum Interest Rate:</strong> The interest rate on the loan shall not exceed 50% per month.</p>
      <p>${BRAND.name} may, at its sole discretion, waive or reduce the charges as mentioned above, on a case to case basis.</p>
      ${sanction.conditions ? `<p><strong>Additional Conditions:</strong> ${sanction.conditions}</p>` : ''}

      <!-- Interactive Accept / Reject Decision Box -->
      <div style="margin:24px 0;padding:20px 16px;background-color:#f8fafc;border-radius:14px;border:1px solid #e2e8f0;text-align:center">
        <p style="margin:0 0 6px 0;color:#0f172a;font-size:15px;font-weight:700">Action Required: Please Confirm Your Decision</p>
        <p style="color:#64748b;font-size:12px;margin:0 0 16px 0">Click an option below to log your response directly into WaqtMoney CRM:</p>

        <!-- HTML Table Buttons for mobile compatibility -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:380px;margin:0 auto">
          <tr>
            <td align="center" style="padding:0 4px 0 0;" width="50%">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" bgcolor="#059669" style="border-radius:10px;">
                    <a href="${acceptUrl}" target="_blank" style="font-size:13px;font-family:Arial,sans-serif;color:#ffffff;font-weight:bold;text-decoration:none;border-radius:10px;padding:12px 14px;border:1px solid #059669;display:block;text-align:center;white-space:nowrap;">
                      ✓ Accept Sanction
                    </a>
                  </td>
                </tr>
              </table>
            </td>
            <td align="center" style="padding:0 0 0 4px;" width="50%">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" bgcolor="#dc2626" style="border-radius:10px;">
                    <a href="${rejectUrl}" target="_blank" style="font-size:13px;font-family:Arial,sans-serif;color:#ffffff;font-weight:bold;text-decoration:none;border-radius:10px;padding:12px 14px;border:1px solid #dc2626;display:block;text-align:center;white-space:nowrap;">
                      ✕ Reject Sanction
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>

      <p>For any queries, you may write to us at ${BRAND.email}.</p>
      <p>Look forward to serving you.<br/>Kind Regards<br/>Loan Department<br/><strong>${BRAND.name}</strong></p>
    </div>
  `;
}

async function emailSanctionLetter(sanction, pdfAbsolutePath) {
  const msgId = `<sanction-${sanction.agreementNumber.replace(/[^a-z0-9_-]/gi, '_')}@waqtfinance.com>`;
  return emailService.sendMail({
    tenantSlug: sanction.sourceSystem || sanction.source_system,
    to: sanction.emailTo,
    subject: `Loan Sanction Letter - ${sanction.agreementNumber}`,
    html: buildSanctionEmailHtml(sanction),
    headers: {
      'Message-ID': msgId,
    },
    attachments: [
      {
        filename: `${sanction.agreementNumber}.pdf`,
        path: pdfAbsolutePath,
        contentType: 'application/pdf',
      },
    ],
  });
}

async function sendSanctionDecisionConfirmationEmail(sanction, lead = {}) {
  const isAccepted = sanction.customerDecision === 'accepted';
  const statusLabel = isAccepted ? 'ACCEPTED' : 'REJECTED';
  const statusColor = isAccepted ? '#059669' : '#dc2626';
  const msgId = `<sanction-${sanction.agreementNumber.replace(/[^a-z0-9_-]/gi, '_')}@waqtfinance.com>`;

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; padding-bottom: 16px; border-bottom: 2px solid #0f172a;">
        <h2 style="color: #0f172a; margin: 0; font-size: 20px;">${BRAND.lender}</h2>
        <p style="color: #64748b; font-size: 11px; margin: 4px 0 0 0;">RBI Regulated Non-Banking Financial Company (NBFC)</p>
      </div>

      <div style="padding: 24px 0; border-bottom: 1px solid #f1f5f9;">
        <div style="background-color: ${isAccepted ? '#ecfdf5' : '#fef2f2'}; border: 1px solid ${statusColor}; padding: 14px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
          <h3 style="color: ${statusColor}; margin: 0; font-size: 16px; font-weight: bold;">
            ${isAccepted ? '✓ SANCTION LETTER CONFIRMED AS ACCEPTED' : '✕ SANCTION LETTER RECORDED AS REJECTED'}
          </h3>
          <p style="font-size: 12px; color: #475569; margin: 6px 0 0 0;">
            Recorded on ${sanction.customerDecisionAt ? new Date(sanction.customerDecisionAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
          </p>
        </div>

        <p style="font-size: 14px; line-height: 1.6;">Dear <strong>${sanction.borrower || 'Borrower'}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6;">
          This is an official confirmation regarding your Loan Sanction Letter (Ref: <strong>${sanction.agreementNumber}</strong>).
          ${isAccepted 
            ? `Thank you for confirming your acceptance of the sanctioned loan terms. Your application is now being processed for final loan agreement signing and disbursal.`
            : `We have received your decision to decline the loan sanction offer.`}
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; background: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 14px; font-weight: bold; color: #475569;">Sanction Agreement Ref:</td>
            <td style="padding: 10px 14px; color: #0f172a;">${sanction.agreementNumber}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 14px; font-weight: bold; color: #475569;">Sanctioned Amount:</td>
            <td style="padding: 10px 14px; font-weight: bold; color: #059669;">₹${Number(sanction.principalAmount || 0).toLocaleString('en-IN')}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 14px; font-weight: bold; color: #475569;">Repayment Amount:</td>
            <td style="padding: 10px 14px; color: #0f172a;">₹${Number(sanction.repaymentAmount || 0).toLocaleString('en-IN')}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 14px; font-weight: bold; color: #475569;">Logged IP Address:</td>
            <td style="padding: 10px 14px; color: #0f172a;">${sanction.customerDecisionIp || 'Logged'}</td>
          </tr>
        </table>
      </div>

      <div style="padding-top: 16px; font-size: 12px; color: #64748b; text-align: center;">
        <p style="margin: 0;">For support or queries, contact <a href="mailto:${BRAND.email}" style="color: #2563eb;">${BRAND.email}</a>.</p>
        <p style="margin: 4px 0 0 0;"><strong>${BRAND.name}</strong> - Loan Operations & Risk Desk</p>
      </div>
    </div>
  `;

  return emailService.sendMail({
    tenantSlug: sanction.sourceSystem || 'waqtmoney',
    to: sanction.emailTo,
    subject: `Re: Loan Sanction Letter - ${sanction.agreementNumber}`,
    html,
    headers: {
      'In-Reply-To': msgId,
      'References': msgId,
    },
  });
}

module.exports = {
  BRAND,
  emailSanctionLetter,
  formatCurrency,
  generateSanctionPdf,
  sendSanctionDecisionConfirmationEmail,
};
