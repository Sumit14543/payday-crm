const fs = require('fs');
const path = require('path');

try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    console.log("=== SERVER .env CONTENT ===");
    console.log(content);
  } else {
    console.log(".env file does not exist at path:", envPath);
  }
} catch (err) {
  console.error("Error reading env file:", err);
}
