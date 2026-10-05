const fs = require('fs');
const path = require('path');
const mysql = require('mysql');
const { config } = require('../config/env');

const DEFAULT_TABLES = [
  'loan_applications',
  'customers',
  'loans',
  'collection_cases',
  'aadhaar_reports',
  'cibil_reports',
  'lead_document_checks',
  'lead_document_requests',
  'lead_credit_handoffs',
  'lead_cam_sheets',
  'lead_sanctions',
  'lead_loan_agreements',
  'lead_accounting_payments',
  'lead_activities',
  'team_members',
  'commissions',
  'income_lines',
  'invoices',
];

const NATURAL_KEYS = {
  lead_activities: ['source_key'],
  lead_document_checks: ['application_id', 'document_key'],
  lead_document_requests: ['token'],
  lead_sanctions: ['agreement_number'],
};

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/importCrmBackup.js "<path-to-backup.sql>" --dry-run',
    '  node scripts/importCrmBackup.js "<path-to-backup.sql>" --apply',
    '',
    'The importer preserves current rows and inserts only missing backup rows for CRM tables.',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const filePath = args.find((arg) => !arg.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');

  if (!filePath || dryRun === apply) {
    printUsage();
    process.exit(1);
  }

  return {
    apply,
    dryRun,
    filePath: path.resolve(filePath),
  };
}

function unescapeSqlString(value) {
  return value.replace(/\\([0btnrZ'"\\%_])/g, (_, escaped) => {
    switch (escaped) {
      case '0':
        return '\0';
      case 'b':
        return '\b';
      case 't':
        return '\t';
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 'Z':
        return '\x1a';
      default:
        return escaped;
    }
  }).replace(/''/g, "'");
}

function parseValue(rawValue) {
  const value = rawValue.trim();
  if (/^NULL$/i.test(value)) return null;
  if (value.startsWith("'") && value.endsWith("'")) {
    const unescaped = unescapeSqlString(value.slice(1, -1));
    if (/^0000-00-00(?: 00:00:00)?$/.test(unescaped)) return null;
    return unescaped;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function splitSqlTuple(tupleBody) {
  const values = [];
  let current = '';
  let escaped = false;
  let inString = false;

  for (let index = 0; index < tupleBody.length; index += 1) {
    const char = tupleBody[index];
    const next = tupleBody[index + 1];

    if (inString) {
      current += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (char === "'") {
        inString = false;
      }
      continue;
    }

    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }

    if (char === ',') {
      values.push(parseValue(current));
      current = '';
      continue;
    }

    current += char;
  }

  values.push(parseValue(current));
  return values;
}

function parseTuples(valuesSql) {
  const tuples = [];
  let escaped = false;
  let inString = false;
  let depth = 0;
  let start = -1;

  for (let index = 0; index < valuesSql.length; index += 1) {
    const char = valuesSql[index];
    const next = valuesSql[index + 1];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === "'" && next === "'") {
        index += 1;
      } else if (char === "'") {
        inString = false;
      }
      continue;
    }

    if (char === "'") {
      inString = true;
      continue;
    }

    if (char === '(') {
      if (depth === 0) start = index + 1;
      depth += 1;
      continue;
    }

    if (char === ')') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        tuples.push(splitSqlTuple(valuesSql.slice(start, index)));
        start = -1;
      }
    }
  }

  return tuples;
}

function parseBackupRows(sql) {
  const insertRegex = /INSERT\s+INTO\s+`([^`]+)`\s*\(([^)]+)\)\s+VALUES\s*([\s\S]*?);/gi;
  const rowsByTable = new Map();
  let match;

  while ((match = insertRegex.exec(sql)) !== null) {
    const table = match[1];
    const columns = match[2].split(',').map((column) => column.trim().replace(/^`|`$/g, ''));
    const tuples = parseTuples(match[3]);
    const rows = rowsByTable.get(table) || [];

    tuples.forEach((tuple) => {
      if (tuple.length !== columns.length) {
        throw new Error(`Column/value mismatch in ${table}. Expected ${columns.length}, got ${tuple.length}.`);
      }

      rows.push(Object.fromEntries(columns.map((column, index) => [column, tuple[index]])));
    });

    rowsByTable.set(table, rows);
  }

  return rowsByTable;
}

function createConnection() {
  return mysql.createConnection({
    charset: 'utf8mb4',
    database: config.db.database,
    host: config.db.host,
    password: config.db.password,
    port: config.db.port,
    user: config.db.user,
  });
}

function runQuery(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

function beginTransaction(connection) {
  return new Promise((resolve, reject) => {
    connection.beginTransaction((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function commit(connection) {
  return new Promise((resolve, reject) => {
    connection.commit((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function rollback(connection) {
  return new Promise((resolve) => {
    connection.rollback(() => resolve());
  });
}

function closeConnection(connection) {
  return new Promise((resolve) => {
    connection.end(() => resolve());
  });
}

function rowKey(table, row) {
  if (table === 'loan_applications') return row.application_id ? String(row.application_id) : '';
  if (row.id === null || row.id === undefined || row.id === '') return '';
  return String(row.id);
}

async function existingKeys(connection, table) {
  const naturalColumns = NATURAL_KEYS[table] || [];
  if (table === 'loan_applications') {
    const rows = await runQuery(connection, `SELECT id, application_id FROM \`${table}\``);
    return {
      applicationIds: new Set(rows.map((row) => String(row.application_id || '')).filter(Boolean)),
      ids: new Set(rows.map((row) => String(row.id)).filter(Boolean)),
      natural: new Set(),
    };
  }

  const selectColumns = ['id', ...naturalColumns].map((column) => `\`${column}\``).join(', ');
  const rows = await runQuery(connection, `SELECT ${selectColumns} FROM \`${table}\``);
  return {
    ids: new Set(rows.map((row) => String(row.id)).filter(Boolean)),
    natural: new Set(rows.map((row) => naturalKey(table, row)).filter(Boolean)),
  };
}

function dedupeBackupRows(table, rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = rowKey(table, row);
    if (key) map.set(key, row);
  });
  return [...map.values()];
}

function filterMissingRows(table, rows, keys) {
  if (table === 'loan_applications') {
    return rows.filter((row) => row.application_id && !keys.applicationIds.has(String(row.application_id)));
  }

  return rows.filter((row) => (
    row.id !== null &&
    row.id !== undefined &&
    !keys.ids.has(String(row.id)) &&
    !keys.natural.has(naturalKey(table, row))
  ));
}

function naturalKey(table, row) {
  const columns = NATURAL_KEYS[table] || [];
  if (!columns.length) return '';
  const values = columns.map((column) => String(row[column] || '').trim());
  if (values.some((value) => !value)) return '';
  return `${table}:${values.join('|')}`;
}

function buildInsert(table, row, tableColumns, keys) {
  const valuesByColumn = { ...row };
  let droppedId = false;

  if (table === 'loan_applications' && valuesByColumn.id !== null && valuesByColumn.id !== undefined && keys.ids.has(String(valuesByColumn.id))) {
    delete valuesByColumn.id;
    droppedId = true;
  }

  const columns = Object.keys(valuesByColumn).filter((column) => tableColumns.has(column));
  if (!columns.length) {
    throw new Error(`No matching columns found for ${table}.`);
  }

  return {
    droppedId,
    sql: `INSERT IGNORE INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    values: columns.map((column) => normalizeInsertValue(table, column, valuesByColumn[column], valuesByColumn)),
  };
}

function datePart(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (!text || /^0000-00-00/.test(text)) return '';
  return text.slice(0, 10);
}

function fallbackDate(row) {
  return datePart(row.due_date)
    || datePart(row.original_due_date)
    || datePart(row.start_date)
    || datePart(row.agreement_date)
    || datePart(row.disbursement_date)
    || datePart(row.created_at)
    || datePart(row.updated_at)
    || new Date().toISOString().slice(0, 10);
}

function fallbackDateTime(row) {
  return row.created_at
    || row.updated_at
    || row.submitted_at
    || `${fallbackDate(row)} 00:00:00`;
}

function normalizeInsertValue(table, column, value, row) {
  if (['agreement_date', 'due_date', 'join_date', 'original_due_date', 'start_date'].includes(column) && (value === null || value === undefined || value === '')) {
    return fallbackDate(row);
  }

  if (['created_at', 'disbursed_at', 'expires_at', 'paid_at', 'submitted_at', 'updated_at'].includes(column) && (value === null || value === undefined || value === '')) {
    return fallbackDateTime(row);
  }

  return value;
}

async function getTableColumns(connection, table) {
  const rows = await runQuery(connection, `DESCRIBE \`${table}\``);
  return new Set(rows.map((row) => row.Field));
}

async function tableExists(connection, table) {
  const rows = await runQuery(connection, 'SHOW TABLES LIKE ?', [table]);
  return rows.length > 0;
}

async function main() {
  const { apply, dryRun, filePath } = parseArgs(process.argv);
  const sql = fs.readFileSync(filePath, 'utf8');
  const rowsByTable = parseBackupRows(sql);
  const connection = createConnection();
  const summary = {
    action: dryRun ? 'dry-run' : 'apply',
    backupFile: filePath,
    database: config.db.database,
    host: config.db.host,
    tables: {},
  };

  try {
    await runQuery(connection, 'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');

    const importPlan = [];
    for (const table of DEFAULT_TABLES) {
      const backupRows = dedupeBackupRows(table, rowsByTable.get(table) || []);
      if (!backupRows.length) {
        summary.tables[table] = { backupRows: 0, insertableRows: 0, status: 'no backup rows' };
        continue;
      }

      if (!await tableExists(connection, table)) {
        summary.tables[table] = { backupRows: backupRows.length, insertableRows: 0, status: 'target table missing' };
        continue;
      }

      const columns = await getTableColumns(connection, table);
      const keys = await existingKeys(connection, table);
      const missingRows = filterMissingRows(table, backupRows, keys);
      importPlan.push({ columns, keys, missingRows, table });
      summary.tables[table] = {
        backupRows: backupRows.length,
        existingRows: table === 'loan_applications' ? keys.applicationIds.size : keys.ids.size,
        insertableRows: missingRows.length,
        status: 'ready',
      };
    }

    console.log(JSON.stringify(summary, null, 2));
    if (dryRun) return;

    await beginTransaction(connection);
    try {
      await runQuery(connection, 'SET FOREIGN_KEY_CHECKS=0');
      const applied = {};

      for (const plan of importPlan) {
        let inserted = 0;
        let droppedIds = 0;
        for (const row of plan.missingRows) {
          const insert = buildInsert(plan.table, row, plan.columns, plan.keys);
          const result = await runQuery(connection, insert.sql, insert.values);
          if (insert.droppedId) droppedIds += 1;
          if (row.id !== null && row.id !== undefined && !insert.droppedId) {
            plan.keys.ids.add(String(row.id));
          } else if (result.insertId) {
            plan.keys.ids.add(String(result.insertId));
          }
          const rowNaturalKey = naturalKey(plan.table, row);
          if (rowNaturalKey) plan.keys.natural.add(rowNaturalKey);
          inserted += result.affectedRows || 0;
        }
        applied[plan.table] = { droppedIds, inserted };
      }

      await runQuery(connection, 'SET FOREIGN_KEY_CHECKS=1');
      await commit(connection);
      console.log(JSON.stringify({ applied, success: true }, null, 2));
    } catch (error) {
      await rollback(connection);
      throw error;
    }
  } finally {
    await closeConnection(connection);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
