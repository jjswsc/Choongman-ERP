-- Accounting identity keys (vendor/employee code-first hardening)
-- Safe additive migration: adds employee identity snapshots to accounting transaction tables.

-- 1) bank_transactions: actor identity snapshot
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS user_employee_id bigint NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_employee_code text NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_user_employee_id
  ON public.bank_transactions(user_employee_id);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_user_employee_code
  ON public.bank_transactions(lower(trim(user_employee_code)));

-- 2) petty_cash_transactions: actor identity snapshot
ALTER TABLE public.petty_cash_transactions
  ADD COLUMN IF NOT EXISTS user_employee_id bigint NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_employee_code text NULL;

CREATE INDEX IF NOT EXISTS idx_petty_cash_transactions_user_employee_id
  ON public.petty_cash_transactions(user_employee_id);

CREATE INDEX IF NOT EXISTS idx_petty_cash_transactions_user_employee_code
  ON public.petty_cash_transactions(lower(trim(user_employee_code)));

-- 3) pos_till_transactions: actor identity snapshot
ALTER TABLE public.pos_till_transactions
  ADD COLUMN IF NOT EXISTS user_employee_id bigint NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_employee_code text NULL;

CREATE INDEX IF NOT EXISTS idx_pos_till_transactions_user_employee_id
  ON public.pos_till_transactions(user_employee_id);

CREATE INDEX IF NOT EXISTS idx_pos_till_transactions_user_employee_code
  ON public.pos_till_transactions(lower(trim(user_employee_code)));

-- 4) vat_ledger_entries: create/submit actor identity snapshot
ALTER TABLE public.vat_ledger_entries
  ADD COLUMN IF NOT EXISTS created_by_employee_id bigint NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_employee_code text NULL,
  ADD COLUMN IF NOT EXISTS submitted_by_employee_id bigint NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_by_employee_code text NULL;

CREATE INDEX IF NOT EXISTS idx_vat_ledger_entries_created_by_employee_id
  ON public.vat_ledger_entries(created_by_employee_id);

CREATE INDEX IF NOT EXISTS idx_vat_ledger_entries_submitted_by_employee_id
  ON public.vat_ledger_entries(submitted_by_employee_id);

-- 5) Lightweight backfill from exact store+name (only unique matches)
WITH emp_unique AS (
  SELECT
    lower(trim(e.store::text)) AS s_key,
    lower(trim(e.name::text)) AS n_key,
    MIN(e.id) AS emp_id,
    MIN(COALESCE(e.employee_code, '')) AS emp_code,
    COUNT(*) AS cnt
  FROM public.employees e
  WHERE COALESCE(trim(e.store::text), '') <> ''
    AND COALESCE(trim(e.name::text), '') <> ''
  GROUP BY 1, 2
)
UPDATE public.bank_transactions bt
SET
  user_employee_id = eu.emp_id,
  user_employee_code = NULLIF(eu.emp_code, '')
FROM emp_unique eu
WHERE bt.user_employee_id IS NULL
  AND COALESCE(trim(bt.user_name::text), '') <> ''
  AND COALESCE(trim(bt.store::text), '') <> ''
  AND lower(trim(bt.store::text)) = eu.s_key
  AND lower(trim(bt.user_name::text)) = eu.n_key
  AND eu.cnt = 1;

WITH emp_unique AS (
  SELECT
    lower(trim(e.store::text)) AS s_key,
    lower(trim(e.name::text)) AS n_key,
    MIN(e.id) AS emp_id,
    MIN(COALESCE(e.employee_code, '')) AS emp_code,
    COUNT(*) AS cnt
  FROM public.employees e
  WHERE COALESCE(trim(e.store::text), '') <> ''
    AND COALESCE(trim(e.name::text), '') <> ''
  GROUP BY 1, 2
)
UPDATE public.petty_cash_transactions pt
SET
  user_employee_id = eu.emp_id,
  user_employee_code = NULLIF(eu.emp_code, '')
FROM emp_unique eu
WHERE pt.user_employee_id IS NULL
  AND COALESCE(trim(pt.user_name::text), '') <> ''
  AND COALESCE(trim(pt.store::text), '') <> ''
  AND lower(trim(pt.store::text)) = eu.s_key
  AND lower(trim(pt.user_name::text)) = eu.n_key
  AND eu.cnt = 1;

WITH emp_unique AS (
  SELECT
    lower(trim(e.store::text)) AS s_key,
    lower(trim(e.name::text)) AS n_key,
    MIN(e.id) AS emp_id,
    MIN(COALESCE(e.employee_code, '')) AS emp_code,
    COUNT(*) AS cnt
  FROM public.employees e
  WHERE COALESCE(trim(e.store::text), '') <> ''
    AND COALESCE(trim(e.name::text), '') <> ''
  GROUP BY 1, 2
)
UPDATE public.pos_till_transactions tt
SET
  user_employee_id = eu.emp_id,
  user_employee_code = NULLIF(eu.emp_code, '')
FROM emp_unique eu
WHERE tt.user_employee_id IS NULL
  AND COALESCE(trim(tt.user_name::text), '') <> ''
  AND COALESCE(trim(tt.store_code::text), '') <> ''
  AND lower(trim(tt.store_code::text)) = eu.s_key
  AND lower(trim(tt.user_name::text)) = eu.n_key
  AND eu.cnt = 1;
