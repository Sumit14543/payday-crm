const mysql = require('mysql');
const { config } = require('../config/env');

const tenant = { slug: 'waqtfinance', db_name: 'waqtmoney_payday' };

const connection = mysql.createConnection({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  port: config.db.port,
  database: tenant.db_name,
});

connection.connect((err) => {
  if (err) {
    console.error("Connection failed:", err);
    process.exit(1);
  }
  console.log("Connected to tenant DB:", tenant.db_name);

  // Let's print the table structure of user_product_mappings
  connection.query('DESCRIBE user_product_mappings', (errDesc, cols) => {
    if (errDesc) {
      console.error("Describe table failed:", errDesc);
      connection.end();
      process.exit(1);
    }
    console.log("\n--- user_product_mappings columns ---");
    console.log(cols);

    // Let's try to run a sample DELETE and INSERT as the controller does
    const userId = 3231; // Kajal's ID
    const products = ['waqtfinance', 'geetpay'];

    connection.query('DELETE FROM user_product_mappings WHERE user_id = ?', [userId], (errDel) => {
      if (errDel) {
        console.error("DELETE failed:", errDel);
      } else {
        console.log("DELETE succeeded.");
      }

      // Try inserting
      let errorOccurred = false;
      let completed = 0;
      for (const p of products) {
        connection.query('INSERT INTO user_product_mappings (user_id, product_slug) VALUES (?, ?)', [userId, p], (errIns) => {
          completed++;
          if (errIns) {
            console.error(`INSERT failed for product ${p}:`, errIns);
            errorOccurred = true;
          } else {
            console.log(`INSERT succeeded for product ${p}.`);
          }

          if (completed === products.length) {
            connection.end();
            process.exit(errorOccurred ? 1 : 0);
          }
        });
      }
    });
  });
});
