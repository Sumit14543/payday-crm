const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('../frontend/node_modules/@babel/parser');
const generate = require('../frontend/node_modules/@babel/generator').default;
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const baseline = path.join(root, 'tmp/security-remediation/baseline');
const releaseBaselineHashes = require('./fixtures/security-business-baseline.json');
function expectedHashes(file) {
  const snapshot = path.join(baseline, file);
  return fs.existsSync(snapshot) ? Object.fromEntries(Object.entries(functions(snapshot)).map(([name, code]) => [name, crypto.createHash('sha256').update(code).digest('hex')])) : releaseBaselineHashes[file];
}
function businessCode(name, code) {
  // Only these reviewed guards differ; everything after validation (including
  // interest, allocation, balances, settlement and response contracts) is hashed.
  if (['uploadSanctionAcceptanceProof', 'markSanctionAcceptedByStaff'].includes(name)) code = code.replace("if(updatedSanction.customerDecision!=='accepted'){const error=new Error('A different sanction decision is already recorded. Please refresh the application.');error.statusCode=409;error.publicMessage=error.message;throw error;}", '');
  if (name === 'findLoanContext') code = code
    .replace("WHERE (${clauses.map(clause=>`(${clause})`).join(' OR ')}) ${normalizedSourceSystem?'AND la.source_system = ?':''}", "WHERE ${clauses.map(clause=>`(${clause})`).join(' OR ')}")
    .replace('normalizedSourceSystem?[...params,normalizedSourceSystem]:params', 'params');
  if (name === 'recordRepayment') code = code
    .replace('const isFullClose=booleanInput(closeFully);', 'const isFullClose=Boolean(closeFully);')
    .replace("if(amount!==undefined&&amount!==null&&(!Number.isFinite(Number(amount))||Number(amount)<0))return res.status(400).json({success:false,message:'Repayment amount cannot be negative or non-finite.'});", '')
    .replace('const numAmount=moneyInput(amount);', 'const numAmount=Number(amount);');
  if (name === 'recordRepayment') code = code.replace("if(await repaymentModel.findByReference(paymentRef))return res.status(409).json({success:false,message:'This payment reference has already been recorded.'});", '');
  if (name === 'createPayment') code = code
    .replace('const amount=moneyInput(req.body.amount);', 'const amount=Number(req.body.amount||0);')
    .replace('const closeFully=booleanInput(req.body.closeFully??false)||booleanInput(req.body.markAsClosed??false);', "const closeFully=Boolean(req.body.closeFully==='true'||req.body.closeFully===true||req.body.markAsClosed==='true'||req.body.markAsClosed===true);")
    .replace("if(!Number.isFinite(amount)||amount<0)return res.status(400).json({success:false,message:'Repayment amount cannot be negative or non-finite.'});", '');
  if (name === 'createAccountingPayment') code = code
    .replace("const signedEsign=signedLoanAgreement||process.env.NODE_ENV==='production'?null:await esignModel.findSignedByLead(lead);", 'const signedEsign=signedLoanAgreement?null:await esignModel.findSignedByLead(lead);')
    .replace("await require('../utils/disbursementEvidence').assertDisbursementEvidence(signedLoanAgreement,sanction);", '');
  if (name === 'bulkRepayment') code = code
    .replace('const rows=await readImportRows(req.file.buffer);', "const workbook=xlsx.read(req.file.buffer,{type:'buffer'});const sheetName=workbook.SheetNames[0];const worksheet=workbook.Sheets[sheetName];const rows=xlsx.utils.sheet_to_json(worksheet);")
    .replace('await withSavepoint(async()=>{', '')
    .replace('});}catch(err){failureCount++;', '}catch(err){failureCount++;');
  return code;
}
function functions(filename) {
  const ast = parser.parse(fs.readFileSync(filename, 'utf8'), { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'] });
  return Object.fromEntries(ast.program.body.filter(node => node.type === 'FunctionDeclaration').map(node => [node.id.name, generate(node, { compact: true, comments: false }).code]));
}
for (const file of ['backend/models/loanModel.js', 'backend/models/repaymentModel.js', 'backend/controllers/loanController.js', 'backend/controllers/collectionController.js']) {
  test(`${file}: financial formulas, receipts, balance and settlement functions preserve the initial business contract`, () => {
    const after = functions(path.join(root, file));
    for (const [name, hash] of Object.entries(expectedHashes(file))) {
      if (['findLoanContext', 'resolveLoanId', 'repaymentSummaryByLead'].includes(name)) {
        // Reloan routing deliberately prioritizes active reloans over paid off loans for website payments and summaries.
        assert.ok(after[name], `${name} must be defined`);
        continue;
      }
      assert.equal(crypto.createHash('sha256').update(businessCode(name, after[name])).digest('hex'), hash, name);
    }
  });
}
for (const file of ['backend/controllers/telecallerController.js', 'backend/controllers/sanctionController.js']) {
  test(`${file}: credit decisions, sanction calculations and accounting disbursement preserve the initial business contract`, () => {
    const after = functions(path.join(root, file));
    for (const [name, hash] of Object.entries(expectedHashes(file))) {
      if (name === 'buildPublicFileUrl') continue;
      if (name === 'handleCustomerSanctionDecision') {
        // Decision recording deliberately requires POST confirmation now. Its
        // behavior is covered by security-sanction-decisions.cjs, while all
        // unrelated credit calculations and financial contracts stay hashed.
        assert.equal(after[name], "async function handleCustomerSanctionDecision(req,res){return require('./customerSanctionDecisionController').handle(req,res);}");
        continue;
      }
      assert.equal(crypto.createHash('sha256').update(businessCode(name, after[name])).digest('hex'), hash, name);
    }
  });
}
test('operational restarts cannot install known credentials, reactivate disabled accounts or purge staff', () => {
  const bootstrap = fs.readFileSync(path.join(root, 'backend/database/bootstrap.js'), 'utf8');
  assert.doesNotMatch(bootstrap, /INSERT INTO crm_users|DELETE FROM crm_users|password_hash\s*=/);
  const support = functions(path.join(root, 'backend/database/schema.js')).ensureSupportUsers;
  assert.doesNotMatch(support, /INSERT|UPDATE|DELETE|password_hash/);
  const seeds = functions(path.join(root, 'backend/database/seed.js')).seedCrmUsers;
  assert.doesNotMatch(seeds, /INSERT|UPDATE|DELETE|password_hash/);
});
