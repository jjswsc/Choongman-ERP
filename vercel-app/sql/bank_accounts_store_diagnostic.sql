-- =============================================================================
-- 매장별 통장·거래 기간 진단 (Supabase SQL Editor)
-- =============================================================================
-- ① 먼저 아래 「1) 전체 매장 목록」을 실행해 bank_accounts.store 값을 확인하세요.
--    후아막은 보통 'CM Huamak' 또는 'Huamak' 으로 저장됩니다 (한글 '후아막' 아님).
-- ② 확인한 store 값으로 「2) 매장별 통장·거래 기간」의 store_filter 를 바꿔 실행하세요.
--    store_filter = NULL 이면 전체 통장(최대 수백 건)을 봅니다.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1) 전체 매장 목록 (bank_accounts 에 등록된 store 값)
-- ---------------------------------------------------------------------------
SELECT
  ba.store,
  COUNT(*) AS account_count,
  MIN(ba.created_at)::date AS oldest_account,
  MAX(ba.created_at)::date AS newest_account
FROM public.bank_accounts ba
GROUP BY ba.store
ORDER BY ba.store NULLS LAST;


-- ---------------------------------------------------------------------------
-- 2) 매장별 통장·거래 기간
--    store_filter 예: 'Huamak' | 'CM Huamak' | NULL(전체)
-- ---------------------------------------------------------------------------
WITH params AS (
  SELECT 'Huamak'::text AS store_filter  -- ← 1) 결과 보고 변경. 전체는 NULL
),
accounts AS (
  SELECT
    ba.id,
    ba.name,
    ba.bank_name,
    ba.store,
    ba.opening_balance,
    ba.opening_balance_date,
    ba.created_at
  FROM public.bank_accounts ba
  CROSS JOIN params p
  WHERE p.store_filter IS NULL
     OR ba.store ILIKE '%' || p.store_filter || '%'
),
tx_summary AS (
  SELECT
    bt.account_id,
    COUNT(*) AS tx_count,
    MIN(bt.trans_date) AS first_date,
    MAX(bt.trans_date) AS last_date
  FROM public.bank_transactions bt
  WHERE bt.account_id IN (SELECT id FROM accounts)
  GROUP BY bt.account_id
)
SELECT
  a.id AS account_id,
  a.bank_name,
  a.name AS account_name,
  a.store,
  a.opening_balance_date,
  a.created_at::date AS account_created,
  COALESCE(t.tx_count, 0) AS tx_count,
  t.first_date,
  t.last_date
FROM accounts a
LEFT JOIN tx_summary t ON t.account_id = a.id
ORDER BY a.id;


-- ---------------------------------------------------------------------------
-- 3) (선택) Huamak 계열 — CM 접두·별칭까지 한 번에
-- ---------------------------------------------------------------------------
WITH huamak_stores AS (
  SELECT unnest(ARRAY[
    'CM Huamak', 'Huamak', 'huamak', 'CM huamak'
  ])::text AS store_key
),
accounts AS (
  SELECT ba.*
  FROM public.bank_accounts ba
  WHERE EXISTS (
    SELECT 1 FROM huamak_stores h
    WHERE ba.store ILIKE h.store_key
       OR ba.store ILIKE '%' || h.store_key || '%'
  )
     OR ba.name ILIKE '%huamak%'
     OR ba.bank_name ILIKE '%huamak%'
),
tx_summary AS (
  SELECT
    bt.account_id,
    COUNT(*) AS tx_count,
    MIN(bt.trans_date) AS first_date,
    MAX(bt.trans_date) AS last_date
  FROM public.bank_transactions bt
  WHERE bt.account_id IN (SELECT id FROM accounts)
  GROUP BY bt.account_id
)
SELECT
  a.id AS account_id,
  a.bank_name,
  a.name AS account_name,
  a.store,
  a.opening_balance_date,
  a.created_at::date AS account_created,
  COALESCE(t.tx_count, 0) AS tx_count,
  t.first_date,
  t.last_date
FROM accounts a
LEFT JOIN tx_summary t ON t.account_id = a.id
ORDER BY a.id;
