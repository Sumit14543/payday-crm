const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const { uploadPath } = require('../config/uploads');
const { BRAND } = require('./sanctionLetterService');
const { getActiveBrand } = require('../config/db');

const agreementsDir = uploadPath('agreements');
const brandDir = uploadPath('brand');

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function plainDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
}

function safeFileName(value) {
  return String(value || 'loan-agreement')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'loan-agreement';
}

function fixedAmount(value) {
  return Number(value || 0).toFixed(2);
}

function rupeeAmount(value) {
  return `Rs. ${fixedAmount(value)}`;
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
    await sharp(sourceLogoPath).png().resize({ width: 150, withoutEnlargement: true }).toFile(brandSlugLogoPath);
    await fs.promises.writeFile(brandSlugLogoMetaPath, sourceMeta);
  }

  return brandSlugLogoPath;
}

function addHeaderFooter(doc, logoPath) {
  const range = doc.bufferedPageRange();

  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    const currentY = doc.y;
    const originalMargins = { ...doc.page.margins };
    doc.save();
    doc.page.margins.bottom = 0;
    doc.rect(0, 0, 595, 86).fill('#ffffff');
    doc.fillColor('#111827').font('Helvetica').fontSize(8);
    doc.text(BRAND.cin, 48, 24, { width: 190, lineBreak: false });
    doc.text(BRAND.gstin, 48, 38, { width: 190, lineBreak: false });
    doc.text(BRAND.website, 410, 30, { width: 135, align: 'right', lineBreak: false });
    doc.polygon([32, 20], [44, 14], [44, 70], [32, 78]).fill('#ef4444');
    doc.polygon([563, 20], [551, 14], [551, 70], [563, 78]).fill('#ef4444');

    if (logoPath) {
      doc.image(logoPath, 269, 18, { width: 58, height: 58, fit: [58, 58] });
    }

    doc.moveTo(48, 82).lineTo(547, 82).lineWidth(1).strokeColor('#0f766e').stroke();
    doc.moveTo(48, 742).lineTo(547, 742).lineWidth(1).strokeColor('#0f766e').stroke();
    doc.fillColor('#4b5563').font('Helvetica').fontSize(7.5);
    doc.text(BRAND.address, 48, 752, { width: 499, align: 'center', lineBreak: false });
    doc.text(`${BRAND.phone}        ${BRAND.email}`, 48, 766, { width: 499, align: 'center', lineBreak: false });
    doc.moveTo(48, 788).lineTo(547, 788).lineWidth(2).strokeColor('#ef4444').stroke();
    doc.restore();
    doc.page.margins = originalMargins;
    doc.y = currentY;
  }
}

function ensureSpace(doc, height = 48) {
  if (doc.y + height > 724) doc.addPage();
}

function title(doc, text) {
  ensureSpace(doc, 42);
  doc.moveDown(0.4);
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text(text, 58, doc.y, {
    width: 479,
    align: 'center',
    underline: true,
  });
  doc.moveDown(0.8);
}

function section(doc, text) {
  ensureSpace(doc, 36);
  doc.moveDown(0.35);
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text(text, 58, doc.y, {
    width: 479,
    align: 'left',
  });
  doc.moveDown(0.35);
}

function para(doc, text, options = {}) {
  ensureSpace(doc, options.height || 50);
  doc.fillColor('#111827')
    .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(options.size || 8.6)
    .text(text, 58, doc.y, {
      width: 479,
      align: options.align || 'justify',
      lineGap: options.lineGap ?? 1.5,
    });
  doc.moveDown(options.gap ?? 0.35);
}

function bullet(doc, text) {
  ensureSpace(doc, 35);
  doc.fillColor('#111827').font('Helvetica').fontSize(8.5).text(`- ${text}`, 72, doc.y, {
    width: 455,
    align: 'justify',
    lineGap: 1.4,
  });
  doc.moveDown(0.25);
}

function listItem(doc, marker, text) {
  ensureSpace(doc, 35);
  doc.fillColor('#111827').font('Helvetica').fontSize(8.5).text(`${marker} ${text}`, 72, doc.y, {
    width: 455,
    align: 'justify',
    lineGap: 1.4,
  });
  doc.moveDown(0.25);
}

function scheduleRows(sanction, lead = {}) {
  return [
    ['1', 'Loan Agreement Number', sanction.agreementNumber],
    ['2', 'Agreement Date', plainDate(sanction.agreementDate)],
    ['3', 'Borrower', sanction.borrower],
    ['4', 'Lender', sanction.lender || BRAND.lender],
    ['5', 'Principal Loan Amount', fixedAmount(sanction.principalAmount)],
    ['6', 'Tenure (Days/Months)', String(sanction.tenureDays || '')],
    ['7', 'Rate of Interest', `${Number(sanction.interestRate || 0).toFixed(2)} %`],
    ['8', 'Processing Fees', rupeeAmount(sanction.processingFee)],
    ['9', 'GST', rupeeAmount(sanction.gstAmount)],
    ['10', 'Amount to be Disbursed', rupeeAmount(sanction.disbursedAmount)],
    ['11', 'Due Date', formatDate(sanction.dueDate)],
    ['12', 'Repayment Amount', rupeeAmount(sanction.repaymentAmount)],
    ['13', 'Annual Percentage Rate - Effective Annualized Interest Rate (in%)', `${Number(sanction.apr || 0).toFixed(0)}`],
  ];
}

function drawScheduleTable(doc, sanction, lead) {
  section(doc, 'SCHEDULE "A"');
  para(doc, 'SCHEDULE OF LOAN DETAILS AND TERMS', { bold: true, align: 'center', gap: 0.55 });

  const rows = [['SN', 'ITEM', 'DETAIL'], ...scheduleRows(sanction, lead)];
  const x = 58;
  const widths = [38, 282, 159];
  rows.forEach((row, index) => {
    doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.7);
    const itemHeight = doc.heightOfString(row[1] || '', { width: widths[1] - 12 });
    const detailHeight = doc.heightOfString(row[2] || '', { width: widths[2] - 12 });
    const rowHeight = Math.max(22, Math.ceil(Math.max(itemHeight, detailHeight)) + 14);
    ensureSpace(doc, rowHeight + 6);
    const y = doc.y;
    doc.rect(x, y, widths[0] + widths[1] + widths[2], rowHeight).strokeColor('#cbd5e1').lineWidth(0.8).stroke();
    doc.moveTo(x + widths[0], y).lineTo(x + widths[0], y + rowHeight).stroke();
    doc.moveTo(x + widths[0] + widths[1], y).lineTo(x + widths[0] + widths[1], y + rowHeight).stroke();
    doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.7).fillColor('#111827');
    doc.text(row[0], x + 6, y + 7, { width: widths[0] - 10 });
    doc.text(row[1], x + widths[0] + 6, y + 7, { width: widths[1] - 12 });
    doc.text(row[2] || '', x + widths[0] + widths[1] + 6, y + 7, { width: widths[2] - 12 });
    doc.y = y + rowHeight;
  });
  doc.moveDown(0.6);
}

function borrowerAddress(lead) {
  return [lead.address, lead.city, lead.pincode].filter(Boolean).join(' ') || 'registered address';
}

async function generateLoanAgreementPdf({ lead, sanction, agreement }) {
  await fs.promises.mkdir(agreementsDir, { recursive: true });
  const logoPath = await resolveLogoPath();
  const borrowerSegment = safeFileName(sanction.borrower || lead.name || 'borrower');
  const fileName = `${safeFileName(sanction.agreementNumber)}-${borrowerSegment}-loan-agreement.pdf`;
  const absolutePath = path.join(agreementsDir, fileName);
  const relativePath = `/uploads/agreements/${fileName}`;
  const signerBox = { page: 1, llx: 350, lly: 92, urx: 520, ury: 150 };

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      bufferPages: true,
      margins: { top: 104, left: 58, right: 58, bottom: 106 },
      size: 'A4',
    });
    const stream = fs.createWriteStream(absolutePath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);

    doc.y = 112;
    title(doc, 'LOAN AGREEMENT');
    para(doc, 'This loan agreement ("Agreement") is entered by electronic means on the day mentioned in the Schedule of Loan Details and Terms of the agreement.');
    section(doc, 'BY AND BETWEEN');
    para(doc, `M/s ${BRAND.lender}, a duly registered Non-Banking Financial Company registered with the Reserve Bank of India and incorporated in India under Companies Act 1956 with Corporate Identification Number (CIN): ${BRAND.cin} with Corporate office, ${BRAND.address}. (Hereinafter referred to as the "Lender" which expression shall, unless repugnant to or inconsistent with the context, mean and include their successors and permitted assignees of the FIRST PART).`);
    section(doc, 'AND');
    para(doc, `Mr/Ms/Mrs. ${sanction.borrower || lead.name || 'Borrower'} an Indian resident with Permanent Account Number (PAN): ${lead.panNumber || 'Not available'} Address ${borrowerAddress(lead)} email ID ${sanction.borrowerEmail || lead.email || 'Not available'}, Phone Number (${sanction.borrowerPhone || lead.phone || 'Not available'}): (hereinafter referred to as the "Borrower" which expression shall, unless repugnant to or inconsistent with the context, mean and include their successors and permitted assignees of the SECOND PART). The Borrower and the Lender are hereinafter collectively referred to as the "Parties" and individually as the "Party".`);
    section(doc, 'WITNESSETH WHEREAS');
    listItem(doc, 'a)', 'The Lender operates an online loan origination platform to facilitate personal loan products to Borrowers in compliance with the guidelines issued by the RBI.');
    listItem(doc, 'b)', 'The Borrower has applied for a loan through the platform by registering, submitting KYC documents, and accepting the terms of this Agreement.');
    listItem(doc, 'c)', 'The Parties have mutually agreed to formalize the loan terms as per the terms and conditions set forth herein.');
    para(doc, 'NOW THEREFORE, IN CONSIDERATION OF THE MUTUAL PROMISES, COVENANTS AND CONDITIONS HEREINAFTER SET FORTH, THE RECEIPT AND SUFFICIENCY OF WHICH IS HEREBY ACKNOWLEDGED, THE PARTIES HERETO AGREE AS FOLLOWS:', { bold: true });

    section(doc, '1. Commencement');
    para(doc, 'This Agreement shall come into effect from the date of this agreement as recorded in the Schedule A of Loan Details and Terms appended to this agreement.');
    section(doc, '2. Representation and Warranties of the Parties');
    para(doc, 'Each Party represents and warrants that:');
    listItem(doc, 'i.', 'They have the authority and capacity to enter into this Agreement and perform their obligations hereunder.');
    listItem(doc, 'ii.', 'The Agreement is binding, enforceable, and does not violate any applicable law or contractual obligations.');
    section(doc, '3. Disbursement of Loan');
    listItem(doc, 'i.', 'Loan disbursement shall occur within two (2) working days after the Borrower accepts this Agreement electronically and all KYC verification is completed.');
    listItem(doc, 'ii.', "The Lender shall transfer the loan amount to the Borrower's designated bank account, as specified in the Schedule of Loan Details and Terms.");
    section(doc, '4. Repayment Of the Loan');
    listItem(doc, 'i.', 'The Borrower agrees to repay the loan amount, along with any applicable interest, fees, and charges, on or before the due date specified in the Schedule of Loan Details and Terms.');
    listItem(doc, 'ii.', 'The Borrower may prepay the loan without any penalty or charges.');
    section(doc, '5. Events of Defaults');
    para(doc, 'The following events shall constitute "Events of Defaults".');
    listItem(doc, 'i.', 'The borrower fails to repay the loan or any fee, charges, costs or other amount due under this Agreement, in the manner specified herein, and any such payment remains unpaid after its due date or');
    listItem(doc, 'ii.', 'The Borrower becomes deceased, insolvent or bankrupt; or');
    listItem(doc, 'iii.', 'Any e Mandate/ E NACH / Post Dated Cheques issued or to be issued by the borrower to the Lender under the terms of this Agreement is dishonored or not realized upon presentation for any reason; or');
    listItem(doc, 'iv.', 'The Borrower issues instruction to stop payment of any e Mandate/ E NACH / Post Dated Cheques for any reason The Borrower breaches any of the terms, covenants and conditions of this Agreement, or if any information or representations provided by the Borrower to the Lender under this Agreement or any accompanying document is found to be inaccurate, false or misleading.');
    section(doc, '6. Consequence of Default');
    [
      'The Service Provider, acting on behalf of the Lender, or the Lender itself, shall take all necessary steps as permitted by law to recover the amounts due from the borrower. This includes the outstanding principal, accrued interest at the agreed rate, and any other fee or cost as stipulated in this Agreement. Such steps may include, but are not limited to, the appointment of collection agents, attorneys, or consultants, as deemed appropriate by the Lender.',
      'Any Costs incurred by the Lender in initiating legal proceedings or engaging in collection activities, including but not limited to legal fees and collection charges, shall be borne solely by the Borrower.',
      'In the event that an e-Mandate or E NACH is dishonored or not realized, the Lender reserves the right to initiate proceedings under Section 25 of the Payment and Settlement Act, 2007, in addition to any recovery proceedings for non-repayment of the Loan.',
      "In the event the Borrower becomes unreachable, the Lender shall have the right to visit the address provided by the Borrower as per the KYC documents or any other address furnished by the Borrower at the time of availing the Loan. Such a visit shall be undertaken only after the Lender has made all reasonable efforts to contact the Borrower through phone calls, text messages, or WhatsApp. Prior to the visit, the Lender shall send an intimation to the Borrower's registered email address. If the Borrower responds to the said email and agrees to a meeting, the Lender shall consider the Borrower's preferred location for the visit. However, if the Borrower does not respond to the email, the Lender shall proceed to visit the address provided in the KYC documents.",
      "Any visit to the Borrower's address by the Lender shall be conducted only during reasonable hours, specifically between 8:00 AM and 7:00 PM, unless otherwise agreed by the Borrower in writing.",
      'All visits shall be conducted by duly trained and authorized personnel.',
    ].forEach((item, index) => listItem(doc, `${['i', 'ii', 'iii', 'iv', 'v', 'vi'][index]}.`, item));
    section(doc, '7. Arbitration Dispute Resolution');
    [
      'Any dispute in connection with the interpretation, performance, termination of this agreement, and/or the documents, or otherwise in connection with this agreement, shall be referred for Arbitration under the Arbitration and Conciliation Act, 1996 (as amended up to date) or in re-enactment thereof, before a sole Arbitrator to be appointed by both the Parties mutually.',
      'The Arbitration proceeding shall be conducted at Delhi in the English Language.',
      'The Arbitral award shall be final and binding on the parties and enforceable in accordance with its terms. The Arbitrator shall state reason for their findings in writing. The Parties agreed to be bound thereby and act accordingly.',
    ].forEach((item, index) => listItem(doc, `${['i', 'ii', 'iii'][index]}.`, item));
    section(doc, '8. Privacy Clause');
    para(doc, "The Lender shall process Borrower's data in compliance with the applicable data protection laws and only for purposes related to the loan.");
    section(doc, '9. Notices');
    para(doc, 'All correspondence shall be addressed to the respective party at the address provided in the description of the parties in the preamble to this Agreement and to registered email addresses of the parties.');
    section(doc, '10. Severability');
    para(doc, 'If any provision of this agreement is found to be invalid or unenforceable, such provision shall be deemed replaced by a valid and enforceable provision that most closely reflects the intent of the original provision. The remainder of the Agreement shall continue to be in full force and effect.');
    section(doc, '11. Governing law and Jurisdiction');
    listItem(doc, 'i.', 'Any dispute, that cannot be resolved through amicable settlement shall be resolved through the appropriate court of law with jurisdiction. The Jurisdiction for all disputes under this Agreement shall be New Delhi, Delhi.');
    listItem(doc, 'ii.', 'This agreement and the arrangements contemplated hereby shall in all respects be governed by and construed in accordance with the laws of India without giving effect to the principles of conflict of laws thereunder.');
    section(doc, '12. Binding Effect');
    para(doc, 'All warranties, undertakings and agreements made herein by the parties shall be binding upon the parties, their legal representative, successors, and estates. This Agreement (including any amendments or modification) supersedes all prior discussions, arrangements, or agreements (whether oral or written) between the parties concerning the subject matter hereof.');
    section(doc, '13. Entire Agreement');
    para(doc, 'This agreement, together with the SCHEDULES A & B constitutes the entire agreement between the Parties with respect to the subject matter and supersedes all prior agreements and understanding.');
    section(doc, '14. Miscellaneous');
    listItem(doc, 'i.', 'Language');
    para(doc, 'All correspondence and communication between the parties shall be conducted in English.');
    listItem(doc, 'ii.', 'Cumulative Rights');
    para(doc, "The Lender's remedies under this agreement whether expressly provided herein or conferred by statute, law, or custom are cumulative and may be enforced successively or concurrently.");
    listItem(doc, 'iii.', 'Benefit of the Loan Agreement');
    para(doc, 'This Agreement shall be binding upon and to ensure to the benefit of the parties and their respective successors, heirs, administrators, and assigns as applicable.');
    listItem(doc, 'iv.', 'Waiver');
    para(doc, 'Any delay or failure by the Lender in exercising any right, power or remedy under this agreement shall not be deemed a waiver of such right, power, or remedy. Nor shall any partial exercise or non-exercise of such rights impair or preclude further enforcement of the same or other rights under this Agreement.');
    section(doc, '15. Acceptance');
    listItem(doc, 'vii.', 'Borrower(s) agrees that the disbursements under the loan shall be deemed to be made on the date when credit is made by the Lender as per its records.');
    para(doc, 'The parties hereby declare as follows');
    listItem(doc, 'i.', 'They have read and fully understood the terms and conditions of this Agreement and agree to be bound by them.');
    listItem(doc, 'ii.', 'The agreement is presented in the form of electronic form through the App and shall be executed the Borrower by clicking on the prompts or tabs provided for the acceptance.');
    listItem(doc, 'iii.', 'The Agreement shall be deemed concluded and legally binding on the date the Borrower accepts it through the App using their valid credentials, including their registered phone number and email ID.');
    para(doc, `IN WITNESS WHEREOF, the Parties have executed this Agreement as of ${formatDate(sanction.agreementDate)} by registering their acceptance electronically on the website or Application where they have logged in with their valid credentials using their registered phone number and email IDs.`);
    drawScheduleTable(doc, sanction, lead);
    para(doc, 'Best regards', { gap: 0.15 });
    para(doc, `M/s ${BRAND.lender}`, { bold: true });
    section(doc, 'SCHEDULE "B"');
    section(doc, 'Borrower Acknowledgements and Confirmation & Undertaking');
    para(doc, '1. Borrower Acknowledgements and Confirmation:', { bold: true });
    para(doc, 'The Borrower hereby acknowledges and confirms the following;');
    [
      'I have personally applied for the Loan on the website after reviewing and accepting the terms and conditions of Use and Privacy Policies listed on the App.',
      `I acknowledge that my Name, Permanent Account Number (PAN), Aadhar Card or of any other Address and Identity Proof details have been provided by me to the service provider and Lender through the websites (${BRAND.website}) as part of my profile and loan application, and I consent to their use for verification and review purpose.`,
      'I acknowledge and understand that the terms of the loan ("Loan") to be provided to me by the Lender have been approved as per the internal policies and credit underwriting Process of the Lender.',
      'I further acknowledge, agree and understand that the Lender has adopted a risk-based pricing methodology. The Loan terms, including applicable interest rates and charges, have been determined based on broad parameters, including my financial and credit profile as well as information and data obtained through permissions granted by me to the website or App.',
      'Having understood and agreed to all the terms and conditions listed above, I hereby request disbursement of the Loan from the Lender and instruct the Lender to transfer the Sanctioned Loan amount to my designated bank account.',
      `APR will be charged ${Number(sanction.apr || 0).toFixed(0)} %, and the interest rate will be upto ${Number(sanction.interestRate || 0).toFixed(2)}% per Day.`,
    ].forEach((item, index) => listItem(doc, `${['i', 'ii', 'iii', 'iv', 'v', 'vi'][index]}.`, item));
    para(doc, '2. Borrower Undertaking', { bold: true });
    [
      ['i.', 'I represent that the information and details provided by me during registration and in the loan application as well as the documents submitted by me on the App and by other means are true, correct and complete. I further confirm that no relevant information has been withheld.'],
      ['ii.', 'I have read, and understood and accepted the fees and charges applicable to the Loan that I may avail'],
      ['iii.', 'I confirm that no insolvency proceedings or suits for the recovery of outstanding dues have been initiated and / or are pending against me'],
      ['iv.', 'I hereby authorize the Lender to exchange or share information and details relating to this Application Form to its associate companies, affiliates or any third party, as may deemed fit, for the purpose of processing this loan application and/or related offerings or other products / services that I may apply for from time to time.'],
      ['v.', "I hereby consent to and authorize Lender to adjust or amend the credit limit assigned to me based on the Lender's internal credit policy."],
      ['vi.', 'By submitting this Application, I hereby expressly authorize the Lender to send me communications about various financial products offered by or from Lender, its group companies and /or third parties through telephone calls / SMSs / emails / post etc. This including but not limited to promotional communications and confirm that I shall not challenge receipt of such communications as unsolicited communication, defined under TRAI Regulations on Unsolicited Commercial Communications under the Do Not Call Registry.'],
      ['vii.', "That Lender is authorized to disclose any information about me, including personal, Loan information, defaults, security, etc to the Credit Information Bureau of India (CIBIL), other Credit Bureaus, or governmental, regulatory, statutory or private agency / entity. This also includes disclosure to agencies such as RBI, for KYC verification, credit risk analysis, or any other related purposes, including publishing my name in the willful defaulter's list if applicable."],
      ['viii.', 'I agree that Lender may at its sole discretion, by itself or through authorized persons, advocate, agencies, bureau, verify any information provided by me including employment and credit references.'],
      ['ix.', 'I confirm that the funds availed under the Loan shall be used solely for the Purpose specified in the SCHEDULE OF LOAN DETAILS AND TERMS will not be used for speculative or antisocial purpose.'],
      ['x.', 'I have read, understood and accepted the late payment and default charges listed in the SCHEDULE OF LOAN DETAILS AND TERMS.'],
      ['xi.', 'I hereby confirm that I independently contacted the Lender through the website directly and no representative of Lender or the Service Provider has influenced me directly / indirectly to make this application for the Loan.'],
    ].forEach(([marker, item]) => listItem(doc, marker, item));

    ensureSpace(doc, 120);
    doc.moveDown(1.1);
    const signaturePage = doc.bufferedPageRange().count;
    signerBox.page = signaturePage;
    doc.y += 70;
    para(doc, `Agreement record: ${agreement?.id || 'draft'} | Generated on ${formatDate(new Date())}`, { size: 7, align: 'left' });

    addHeaderFooter(doc, logoPath);
    doc.end();
  });

  return { absolutePath, relativePath, signatureCoordinates: signerBox };
}

module.exports = {
  generateLoanAgreementPdf,
};
