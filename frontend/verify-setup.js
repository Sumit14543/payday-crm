import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const requiredFiles = [
  'package.json',
  'index.html',
  'vite.config.ts',
  'server.js',
  'src/main.tsx',
  'src/app/App.tsx',
  'src/app/routes.tsx',
  'src/app/components/Layout.tsx',
  'src/app/pages/Dashboard.tsx',
  'src/app/pages/Leads.tsx',
  'src/app/pages/Customers.tsx',
  'src/app/pages/TeamManagement.tsx',
  'src/app/pages/CommissionTracking.tsx',
  'src/app/pages/IncomeDetails.tsx',
  'src/app/pages/InvoicePayout.tsx',
  'src/app/pages/MISReports.tsx',
  'src/app/pages/AnalyticsReports.tsx',
  'README.md',
  'QUICKSTART.md'
];

console.log('🔍 Verifying PayDay Loan CRM Setup...\n');
console.log('='.repeat(60));

let allPresent = true;
let missingFiles = [];

requiredFiles.forEach(file => {
  const filePath = join(__dirname, file);
  const exists = existsSync(filePath);
  
  if (exists) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allPresent = false;
    missingFiles.push(file);
  }
});

console.log('='.repeat(60));

if (allPresent) {
  console.log('\n🎉 SUCCESS! All required files are present.\n');
  console.log('📋 Next Steps:');
  console.log('   1. Run: npm install');
  console.log('   2. Run: npm run dev');
  console.log('   3. Open: http://localhost:5173\n');
  console.log('📖 Read QUICKSTART.md for detailed instructions\n');
} else {
  console.log('\n⚠️  WARNING: Some files are missing:\n');
  missingFiles.forEach(file => console.log(`   - ${file}`));
  console.log('\nPlease ensure all files are properly created.\n');
}

console.log('='.repeat(60));
