const { withTransaction } = require('../config/db');
module.exports = handler => async (req, res) => {
  const json = res.json;
  let body, sent = false;
  res.json = function (value) { body = value; sent = true; return this; };
  try {
    await withTransaction(async () => {
      await handler(req, res);
      if (sent && res.statusCode >= 400) { const error = new Error('Financial request rejected.'); error.bufferedResponse = true; throw error; }
    });
  } catch (error) {
    if (!error.bufferedResponse) throw error;
  } finally { res.json = json; }
  if (sent) return res.json(body);
};
