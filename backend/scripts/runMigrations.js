const { bootstrap } = require('../database/bootstrap');

console.log("Starting schema migrations and database updates...");
bootstrap()
  .then(() => {
    console.log("✅ Database schema migrations and updates applied successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Migration failed with error:", err);
    process.exit(1);
  });
