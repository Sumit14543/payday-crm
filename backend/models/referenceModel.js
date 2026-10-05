const { query } = require('../config/db');

function all(sql, params = []) {
  return query(sql, params);
}

module.exports = { all };
