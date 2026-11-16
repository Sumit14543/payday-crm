const decisions = require('../services/customerSanctionDecisionService');
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function page(title, content) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;padding:40px 16px"><main style="max-width:440px;margin:auto;background:white;padding:28px;border:1px solid #e2e8f0;border-radius:16px"><h1 style="font-size:20px">${escapeHtml(title)}</h1>${content}</main></body></html>`;
}
async function handle(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const json = String(req.headers.accept || '').includes('application/json');
  if (!json) res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  const token = String(req.params.token || req.query.token || '');
  try {
    if (!token || token.length > 256) {
      if (json) return res.status(400).json({ success: false, message: 'Invalid sanction link.' });
      return res.status(400).send(page('Invalid sanction link', '<p>Please contact your loan officer.</p>'));
    }
    // GET is always read-only, including old email links containing ?action=.
    const result = req.method === 'POST'
      ? await decisions.record(token, String(req.body?.action || '').toLowerCase(), {
        ip: String(req.ip || req.socket?.remoteAddress || '').slice(0, 100),
        userAgent: req.get('user-agent') || '', notes: req.body?.notes,
      })
      : await decisions.preview(token);
    if (json) return res.json(result);
    if (!result.pendingDecision) {
      return res.send(page(result.alreadyDecided ? 'Response Already Recorded' : 'Response Recorded',
        `<p>Your response for sanction <strong>${escapeHtml(result.agreementNumber)}</strong> is <strong>${escapeHtml(result.customerDecision.toUpperCase())}</strong>.</p><p>You may close this tab.</p>`));
    }
    const target = `/api/sanction-decision/${encodeURIComponent(token)}?tenant=${encodeURIComponent(req.tenant?.slug || 'waqtfinance')}`;
    return res.send(page('Confirm Loan Sanction',
      `<p>Borrower: <strong>${escapeHtml(result.borrower)}</strong></p><p>Agreement: <strong>${escapeHtml(result.agreementNumber)}</strong></p><p>Sanction amount: ₹${escapeHtml(Number(result.principalAmount || 0).toLocaleString('en-IN'))}</p><p>Please confirm your decision:</p><form method="post" action="${escapeHtml(target)}"><button type="submit" name="action" value="accept" style="padding:12px;background:#059669;color:white;border:0;border-radius:8px">Accept Sanction</button> <button type="submit" name="action" value="reject" style="padding:12px;background:#dc2626;color:white;border:0;border-radius:8px">Reject</button></form>`));
  } catch (error) {
    if (!error.publicMessage || !error.statusCode) throw error;
    if (json) return res.status(error.statusCode).json({ success: false, message: error.publicMessage });
    return res.status(error.statusCode).send(page('Response Not Recorded', `<p>${escapeHtml(error.publicMessage)}</p>`));
  }
}
module.exports = { handle };
