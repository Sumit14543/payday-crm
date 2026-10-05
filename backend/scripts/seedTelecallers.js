const mysql = require('mysql');
const { config } = require('../config/env');

const dbName = config.db.database;
const connection = mysql.createConnection({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  port: config.db.port,
  database: dbName,
});

const salt = '45fc08e36726dcad454fdc48a13b0c61';
const hash = '70db89d03407cd26e00725ffd1f9cbc9822b33cc36e6f7047d86c0fccd517b8c'; // Admin@123

const telecallers = [
  { name: 'Kajal', email: 'kajal@waqtfinance.com' },
  { name: 'Jyoti', email: 'jyoti@waqtfinance.com' },
  { name: 'Nandini', email: 'nandini@waqtfinance.com' },
];

connection.connect(async (err) => {
  if (err) {
    console.error("Database connection failed:", err);
    process.exit(1);
  }
  console.log("Connected to database:", dbName);

  try {
    for (const tc of telecallers) {
      // 1. Insert into crm_users
      await new Promise((resolve, reject) => {
        connection.query(
          `INSERT INTO crm_users (name, email, role, password_salt, password_hash, is_active, on_duty)
           VALUES (?, ?, 'telecaller', ?, ?, 1, 1)
           ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = 1, on_duty = 1`,
          [tc.name, tc.email, salt, hash],
          (error, results) => {
            if (error) reject(error);
            else resolve(results);
          }
        );
      });
      console.log(`Created/Updated telecaller: ${tc.name} (${tc.email})`);

      // Get the user ID
      const user = await new Promise((resolve, reject) => {
        connection.query(
          `SELECT id FROM crm_users WHERE email = ?`,
          [tc.email],
          (error, results) => {
            if (error) reject(error);
            else resolve(results[0]);
          }
        );
      });

      // 2. Insert into user_product_mappings for 'waqtfinance'
      await new Promise((resolve, reject) => {
        connection.query(
          `INSERT IGNORE INTO user_product_mappings (user_id, product_slug) VALUES (?, 'waqtfinance')`,
          [user.id],
          (error, results) => {
            if (error) reject(error);
            else resolve(results);
          }
        );
      });
      console.log(`Mapped ${tc.name} to product 'waqtfinance'`);
    }
  } catch (error) {
    console.error("Error seeding telecallers:", error);
  } finally {
    connection.end();
    console.log("Seeding telecallers completed successfully!");
    process.exit(0);
  }
});
