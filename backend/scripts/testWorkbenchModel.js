const { listTelecallerWorkbenchV2 } = require('../models/telecallerModel');
const { connectDatabase, tenantLocalStorage, getTenantPool } = require('../config/db');

async function run() {
  try {
    // Connect to database (initializes pools)
    await connectDatabase();
    console.log("Database initialized.");

    // Setup tenant context for 'waqtfinance'
    const tenant = { slug: 'waqtfinance', db_name: 'waqtmoney_payday' };
    const pool = getTenantPool(tenant);

    await tenantLocalStorage.run({ pool, tenant }, async () => {
      // Simulate Jyoti calling listTelecallerWorkbenchV2
      const filters = {
        assignedTo: 'Jyoti', // Jyoti's name
        page: 1,
        pageSize: 10,
        tab: 'all',
      };
      
      console.log("\nExecuting listTelecallerWorkbenchV2 with filters:", filters);
      const result = await listTelecallerWorkbenchV2(filters);
      
      console.log("\n--- RESULT ---");
      console.log("Total items:", result.pagination.totalItems);
      console.log("Items returned:", result.items.length);
      if (result.items.length > 0) {
        console.log("First item sample:", {
          id: result.items[0].id,
          name: result.items[0].name,
          assignedTo: result.items[0].assignedTo,
          status: result.items[0].status,
        });
      }

      // Simulate a superadmin (or 'all' filter) calling listTelecallerWorkbenchV2
      const filtersAll = {
        assignedTo: 'all',
        page: 1,
        pageSize: 10,
        tab: 'all',
      };
      
      console.log("\nExecuting listTelecallerWorkbenchV2 with filters:", filtersAll);
      const resultAll = await listTelecallerWorkbenchV2(filtersAll);
      
      console.log("\n--- RESULT ALL ---");
      console.log("Total items:", resultAll.pagination.totalItems);
      console.log("Items returned:", resultAll.items.length);
      if (resultAll.items.length > 0) {
        console.log("First item sample:", {
          id: resultAll.items[0].id,
          name: resultAll.items[0].name,
          assignedTo: resultAll.items[0].assignedTo,
          status: resultAll.items[0].status,
        });
      }
    });

    process.exit(0);
  } catch (error) {
    console.error("Error executing model function:", error);
    process.exit(1);
  }
}

run();
