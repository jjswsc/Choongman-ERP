-- 임원 차입 입금이 매출(4110)로 잡혔는지 점검. 이것만 복사 → Run.
-- 결과가 있으면 통장 조회에서 해당 입금을 「차입 수령」+관련당사자로 다시 저장하세요.

SELECT
  bt.id AS bank_id,
  bt.trans_date,
  bt.amount,
  bt.category,
  bt.vendor_code,
  bt.memo,
  je.id AS journal_id,
  jl.account_code,
  jl.side,
  jl.amount AS line_amount
FROM public.bank_transactions bt
LEFT JOIN public.journal_entries je
  ON je.source_type = 'bank_transaction'
 AND je.source_id = bt.id
LEFT JOIN public.journal_lines jl
  ON jl.journal_entry_id = je.id
 AND jl.account_code = '4110'
WHERE bt.trans_type = 'deposit'
  AND lower(coalesce(bt.category, '')) IN ('loan', 'loan_borrow')
  AND jl.id IS NOT NULL
ORDER BY bt.trans_date DESC, bt.id DESC
LIMIT 200;
