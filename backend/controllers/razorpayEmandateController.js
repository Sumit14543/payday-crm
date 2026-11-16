const crypto = require('crypto');
const { query } = require('../config/db');
const leadModel = require('../models/leadModel');
async function providerGet(path) {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) { const error = new Error('Razorpay verification is not configured.'); error.statusCode = 503; throw error; }
  const response = await fetch('https://api.razorpay.com/v1/' + path, { headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64') }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) { const error = new Error('Razorpay verification unavailable.'); error.statusCode = 503; throw error; }
  return response.json();
}
async function handleWebhook(req, res) {
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || ''), signature = String(req.headers['x-razorpay-signature'] || '');
  if (!secret || !Buffer.isBuffer(req.rawBody) || !/^[a-f0-9]{64}$/i.test(signature)) return res.status(401).json({ success: false, message: 'A signed Razorpay callback is required.' });
  const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected))) return res.status(401).json({ success: false, message: 'Invalid callback signature.' });
  const payload = req.body?.payload || {}, subscription = payload.subscription?.entity, token = payload.token?.entity, payment = payload.payment?.entity;
  const ids = [...new Set([subscription?.id, token?.id, payment?.token_id, payment?.order_id].filter(value => /^(sub|token|order)_[a-zA-Z0-9]+$/.test(value)))];
  if (!ids.length) return res.json({ success: true, received: true });
  const leads = await query(`SELECT application_id AS id, id AS rawId, emandate_id AS mandateId FROM loan_applications WHERE emandate_provider = 'razorpay' AND emandate_id IN (${ids.map(() => '?').join(',')})`, ids);
  if (!leads.length) return res.json({ success: true, received: true });
  let status;
  const verifiedIds = new Set();
  if (subscription?.id) {
    const verified = await providerGet('subscriptions/' + encodeURIComponent(subscription.id));
    if (verified.id !== subscription.id) return res.status(422).json({ success: false, message: 'Provider reference mismatch.' });
    status = verified.status;
    verifiedIds.add(verified.id);
  } else {
    const verifiedPayment = payment?.id ? await providerGet('payments/' + encodeURIComponent(payment.id)) : null;
    if (verifiedPayment && verifiedPayment.id !== payment.id) return res.status(422).json({ success: false, message: 'Provider payment mismatch.' });
    const tokenId = verifiedPayment?.token_id || token?.id;
    let customerId = verifiedPayment?.customer_id || token?.customer_id;
    if (!/^cust_[a-zA-Z0-9]+$/.test(customerId || '')) return res.status(503).json({ success: false, message: 'Provider customer verification is pending.' });
    const verified = await providerGet('customers/' + encodeURIComponent(customerId) + '/tokens');
    const active = verified.items?.find(item => item.id === tokenId);
    if (!active) {
      if (['token.cancelled', 'token.rejected', 'token.expired'].includes(req.body.event)) { status = 'revoked'; verifiedIds.add(tokenId); }
      else return res.status(503).json({ success: false, message: 'Provider mandate verification is pending.' });
    } else { status = active.recurring_details?.status || active.status; verifiedIds.add(active.id); if (verifiedPayment?.token_id === active.id && verifiedPayment.order_id) verifiedIds.add(verifiedPayment.order_id); }
  }
  const normalized = String(status || '').toLowerCase();
  const target = ['active', 'authenticated', 'confirmed'].includes(normalized) ? 'ACTIVE' : ['cancelled', 'expired', 'revoked', 'rejected', 'halted', 'paused'].includes(normalized) ? 'REVOKED' : 'PENDING';
  for (const lead of leads.filter(lead => verifiedIds.has(lead.mandateId))) await leadModel.updateEmandateStatus(lead.id || lead.rawId, { provider: 'razorpay', status: target, mandateId: lead.mandateId, registeredAt: target === 'ACTIVE' ? new Date() : undefined });
  return res.json({ success: true, received: true });
}
module.exports = { handleWebhook };
