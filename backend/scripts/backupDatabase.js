const fs = require('fs');
const path = require('path');
const mysql = require('mysql');
const { config } = require('../config/env');

const backupDir = path.resolve(__dirname, '..', 'backups');

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function query(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return mysql.escape(value.toISOString().slice(0, 19).replace('T', ' '));
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;
  return mysql.escape(value);
}

async function backup() {
  fs.mkdirSync(backupDir, { recursive: true });
  const basePath = path.join(backupDir, `${config.db.database}-${timestamp()}`);
  const connection = mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
  });

  const tableRows = await query(connection, 'SHOW FULL TABLES WHERE Table_type = ?', ['BASE TABLE']);
  const tables = tableRows.map((row) => row[Object.keys(row)[0]]);
  let schemaSql = `-- Schema backup for ${config.db.database}\n-- Created at ${new Date().toISOString()}\n\nSET FOREIGN_KEY_CHECKS=0;\n`;
  let dataSql = `-- Data backup for ${config.db.database}\n-- Created at ${new Date().toISOString()}\n\nSET FOREIGN_KEY_CHECKS=0;\n`;

  for (const table of tables) {
    const createRows = await query(connection, `SHOW CREATE TABLE \`${table}\``);
    schemaSql += `\nDROP TABLE IF EXISTS \`${table}\`;\n${createRows[0]['Create Table']};\n`;
    dataSql += `\nLOCK TABLES \`${table}\` WRITE;\n`;

    const rows = await query(connection, `SELECT * FROM \`${table}\``);
    if (rows.length) {
      const columns = Object.keys(rows[0]);
      const columnSql = columns.map((column) => `\`${column}\``).join(', ');
      rows.forEach((row) => {
        dataSql += `INSERT INTO \`${table}\` (${columnSql}) VALUES (${columns.map((column) => literal(row[column])).join(', ')});\n`;
      });
    }

    dataSql += 'UNLOCK TABLES;\n';
  }

  schemaSql += '\nSET FOREIGN_KEY_CHECKS=1;\n';
  dataSql += '\nSET FOREIGN_KEY_CHECKS=1;\n';
  fs.writeFileSync(`${basePath}-schema.sql`, schemaSql);
  fs.writeFileSync(`${basePath}-full.sql`, `${schemaSql}\n${dataSql}`);
  connection.end();

  return {
    full: `${basePath}-full.sql`,
    schema: `${basePath}-schema.sql`,
    tables: tables.length,
  };
}

backup()
  .then((result) => {
    console.log(`Schema backup: ${result.schema}`);
    console.log(`Full backup: ${result.full}`);
    console.log(`Tables backed up: ${result.tables}`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
