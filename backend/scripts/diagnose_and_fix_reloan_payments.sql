-- ==============================================================================
-- 1. DIAGNOSTIC QUERY: Find all cases where a payment was mistakenly added 
--    to the old loan instead of the active reloan.
-- Run this in phpMyAdmin / MySQL Workbench / Hostinger Database Client
-- ==============================================================================

SELECT 
    c.id AS customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    old_l.id AS old_paid_loan_id,
    old_l.total_amount AS old_total_due,
    old_l.amount_paid AS old_amount_paid,
    old_l.balance AS old_balance,
    new_l.id AS new_reloan_id,
    new_l.total_amount AS new_total_due,
    new_l.amount_paid AS new_current_paid,
    new_l.balance AS new_current_balance,
    new_l.start_date AS reloan_start_date,
    rep.id AS misplaced_payment_id,
    rep.amount AS payment_amount,
    rep.reference AS payment_reference,
    rep.received_at AS payment_date,
    rep.method AS payment_method
FROM loans old_l
JOIN loans new_l 
    ON new_l.customer_id = old_l.customer_id 
    AND new_l.id <> old_l.id 
    AND (
        new_l.id LIKE CONCAT(old_l.id, 'R%') 
        OR new_l.id LIKE CONCAT(old_l.id, '-R%') 
        OR new_l.created_at > old_l.created_at
    )
JOIN customers c 
    ON c.id = old_l.customer_id
JOIN loan_repayments rep 
    ON rep.loan_id = old_l.id
WHERE (
    -- Condition A: Payment was received on or after the reloan start date
    rep.received_at >= new_l.start_date
    -- Condition B: OR the old loan's total amount_paid exceeds its total_amount
    OR old_l.amount_paid > old_l.total_amount
)
AND rep.status IN ('received', 'success', 'paid', 'settled')
ORDER BY c.name, rep.received_at ASC;


-- ==============================================================================
-- 2. QUICK FIX TEMPLATE FOR A SPECIFIC CASE:
-- (Replace 'PAYMENT_ID', 'OLD_LOAN_ID', and 'NEW_RELOAN_ID' with actual values)
-- ==============================================================================

-- Step A: Shift payment from old loan to new reloan
-- UPDATE loan_repayments 
-- SET loan_id = 'NEW_RELOAN_ID' 
-- WHERE id = 'PAYMENT_ID';

-- Step B: Recalculate old loan balance & status
-- UPDATE loans l
-- SET 
--     amount_paid = (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loan_id = l.id AND status IN ('received', 'success', 'paid', 'settled')),
--     balance = GREATEST(0, l.total_amount - (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loan_id = l.id AND status IN ('received', 'success', 'paid', 'settled'))),
--     status = CASE WHEN (l.total_amount - (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loan_id = l.id AND status IN ('received', 'success', 'paid', 'settled'))) <= 0 THEN 'Paid Off' ELSE 'Active' END,
--     payment_status = CASE WHEN (l.total_amount - (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loan_id = l.id AND status IN ('received', 'success', 'paid', 'settled'))) <= 0 THEN 'Paid' ELSE 'Partial' END
-- WHERE l.id = 'OLD_LOAN_ID';

-- Step C: Recalculate new reloan balance & status
-- UPDATE loans l
-- SET 
--     amount_paid = (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loan_id = l.id AND status IN ('received', 'success', 'paid', 'settled')),
--     balance = GREATEST(0, l.total_amount - (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loan_id = l.id AND status IN ('received', 'success', 'paid', 'settled'))),
--     status = CASE WHEN (l.total_amount - (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loan_id = l.id AND status IN ('received', 'success', 'paid', 'settled'))) <= 0 THEN 'Paid Off' ELSE 'Active' END,
--     payment_status = CASE WHEN (l.total_amount - (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loan_id = l.id AND status IN ('received', 'success', 'paid', 'settled'))) <= 0 THEN 'Paid' ELSE 'Partial' END,
--     next_payment_amount = GREATEST(0, l.total_amount - (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loan_id = l.id AND status IN ('received', 'success', 'paid', 'settled')))
-- WHERE l.id = 'NEW_RELOAN_ID';

-- Step D: Sync Schedules & Collections
-- UPDATE loan_repayment_schedule s SET amount_paid = (SELECT amount_paid FROM loans WHERE id = s.loan_id), status = CASE WHEN (SELECT balance FROM loans WHERE id = s.loan_id) <= 0 THEN 'paid' ELSE 'pending' END WHERE s.loan_id IN ('OLD_LOAN_ID', 'NEW_RELOAN_ID');
-- UPDATE collection_cases c SET total_due = (SELECT balance FROM loans WHERE id = c.loan_id), status = CASE WHEN (SELECT balance FROM loans WHERE id = c.loan_id) <= 0 THEN 'Paid Off' ELSE 'Active' END WHERE c.loan_id IN ('OLD_LOAN_ID', 'NEW_RELOAN_ID');
