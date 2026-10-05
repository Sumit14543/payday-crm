const fs = require('fs');
const path = require('path');
const mysql = require('mysql');
const { config } = require('../config/env');

const TABLE_NAME = 'loan_applications';

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/importLoanApplicationsBackup.js "<path-to-loan_applications.sql>" --mode=insert-missing --dry-run',
    '  node scripts/importLoanApplicationsBackup.js "<path-to-loan_applications.sql>" --mode=insert-missing --apply',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const filePath = args.find((arg) => !arg.startsWith('--'));
  const modeArg = args.find((arg) => arg.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : 'insert-missing';
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');

  if (!filePath || mode !== 'insert-missing' || dryRun === apply) {
    printUsage();
    process.exit(1);
  }

  return {
    filePath: path.resolve(filePath),
    dryRun,
    apply,
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
    return unescapeSqlString(value.slice(1, -1));
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function splitSqlTuple(tupleBody) {
  const values = [];
  let current = '';
  let inString = false;
  let escaped = false;

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
  let inString = false;
  let escaped = false;
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

function parseLoanApplicationRows(sql) {
  const insertRegex = /INSERT\s+INTO\s+`loan_applications`\s*\(([^)]+)\)\s+VALUES\s*([\s\S]*?);/gi;
  const rows = [];
  let match;

  while ((match = insertRegex.exec(sql)) !== null) {
    const columns = match[1].split(',').map((column) => column.trim().replace(/^`|`$/g, ''));
    const tuples = parseTuples(match[2]);

    tuples.forEach((tuple) => {
      if (tuple.length !== columns.length) {
        throw new Error(`Column/value mismatch in backup row. Expected ${columns.length}, got ${tuple.length}.`);
      }

      rows.push(Object.fromEntries(columns.map((column, index) => [column, tuple[index]])));
    });
  }

  return rows;
}

function createConnection() {
  return mysql.createConnection({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    port: config.db.port,
    database: config.db.database,
    charset: 'utf8mb4',
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

function countBySource(rows) {
  return rows.reduce((accumulator, row) => {
    const source = row.source === null || row.source === undefined || row.source === '' ? '(null)' : String(row.source);
    accumulator[source] = (accumulator[source] || 0) + 1;
    return accumulator;
  }, {});
}

function buildInsert(row, tableColumns, usedIds) {
  const valuesByColumn = { ...row };
  if (valuesByColumn.id !== null && valuesByColumn.id !== undefined && usedIds.has(Number(valuesByColumn.id))) {
    delete valuesByColumn.id;
  }

  const columns = Object.keys(valuesByColumn).filter((column) => tableColumns.has(column));
  const placeholders = columns.map(() => '?').join(', ');
  const escapedColumns = columns.map((column) => `\`${column}\``).join(', ');
  const values = columns.map((column) => valuesByColumn[column]);

  return {
    sql: `INSERT INTO \`${TABLE_NAME}\` (${escapedColumns}) VALUES (${placeholders})`,
    values,
  };
}

async function main() {
  const { filePath, dryRun, apply } = parseArgs(process.argv);
  const sql = fs.readFileSync(filePath, 'utf8');
  const backupRows = parseLoanApplicationRows(sql);

  if (!backupRows.length) {
    throw new Error(`No ${TABLE_NAME} insert rows found in ${filePath}`);
  }

  const rowsByApplicationId = new Map();
  backupRows.forEach((row) => {
    if (row.application_id) rowsByApplicationId.set(row.application_id, row);
  });

  const connection = createConnection();

  try {
    await runQuery(connection, 'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');
    const tableDescription = await runQuery(connection, `DESCRIBE \`${TABLE_NAME}\``);
    const tableColumns = new Set(tableDescription.map((column) => column.Field));
    const currentRows = await runQuery(connection, `SELECT id, application_id FROM \`${TABLE_NAME}\``);
    const existingApplicationIds = new Set(currentRows.map((row) => row.application_id).filter(Boolean));
    const usedIds = new Set(currentRows.map((row) => Number(row.id)));
    const uniqueBackupRows = [...rowsByApplicationId.values()];
    const missingRows = uniqueBackupRows.filter((row) => !existingApplicationIds.has(row.application_id));

    const summary = {
      mode: 'insert-missing',
      action: dryRun ? 'dry-run' : 'apply',
      backupRows: backupRows.length,
      uniqueBackupApplications: uniqueBackupRows.length,
      currentApplications: existingApplicationIds.size,
      existingFromBackup: uniqueBackupRows.length - missingRows.length,
      missingFromBackup: missingRows.length,
      sourceDistributionForMissing: countBySource(missingRows),
      missingApplicationIds: missingRows.map((row) => row.application_id),
    };

    console.log(JSON.stringify(summary, null, 2));

    if (dryRun) return;

    await beginTransaction(connection);
    try {
      for (const row of missingRows) {
        const insert = buildInsert(row, tableColumns, usedIds);
        const result = await runQuery(connection, insert.sql, insert.values);
        usedIds.add(Number(result.insertId || row.id));
      }
      await commit(connection);
      console.log(JSON.stringify({ inserted: missingRows.length, success: true }, null, 2));
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
