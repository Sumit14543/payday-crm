const mysql = require('mysql');

const hosts = ['127.0.0.1', 'localhost', '103.234.185.16'];
const ports = [3306, 3307];

async function test() {
  for (const host of hosts) {
    for (const port of ports) {
      console.log(`Testing ${host}:${port}...`);
      const conn = mysql.createConnection({
        host,
        port,
        user: 'root',
        password: '',
        connectTimeout: 2000,
      });

      await new Promise((resolve) => {
        conn.connect((err) => {
          if (err) {
            console.log(`❌ ${host}:${port} failed: ${err.message}`);
          } else {
            console.log(`✅ SUCCESS connecting to ${host}:${port}`);
            conn.end();
          }
          resolve();
        });
      });
    }
  }
}

test();
