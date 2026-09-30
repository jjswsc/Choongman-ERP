-- Sang Charoen (1014) 이미 지급된 매입 중, 01과 같은 조건(입고−실지급 ≈ 3%)만
-- 원천세로 상계한다. 입고 총액과 통장 실지급액은 바꾸지 않는다.
-- Supabase는 세미콜론마다 따로 실행하므로, 임시 테이블이 사라지지 않게 이 블록 전체를 한 번에 Run.
-- 한 번만 실행. 이미 원천세가 있으면 그 출금은 건너뛴다.

DO $$
DECLARE
  matched_count integer;
BEGIN
  CREATE TEMP TABLE sang_charoen_wht_match ON COMMIT DROP AS
  WITH inbound AS (
    SELECT
      id,
      vendor_code,
      amount::numeric AS gross,
      CASE
        WHEN trans_date ~ '^\d{4}-\d{2}-\d{2}' THEN left(trans_date, 10)::date
      END AS trans_date
    FROM public.payable_transactions
    WHERE vendor_code = '1014'
      AND ref_type = 'Inbound'
      AND amount > 0
  ),
  pay AS (
    SELECT
      p.bank_transaction_id,
      p.vendor_code,
      abs(p.amount)::numeric AS paid,
      CASE
        WHEN p.trans_date ~ '^\d{4}-\d{2}-\d{2}' THEN left(p.trans_date, 10)::date
      END AS trans_date
    FROM public.payable_transactions p
    WHERE p.vendor_code = '1014'
      AND p.ref_type = 'Payment'
      AND p.amount < 0
      AND p.bank_transaction_id IS NOT NULL
  ),
  pairs AS (
    SELECT
      pay.bank_transaction_id,
      pay.vendor_code,
      pay.paid,
      pay.trans_date AS pay_date,
      inbound.id AS inbound_id,
      inbound.gross,
      round((inbound.gross / 1.07) * 0.03, 2) AS theory_wht,
      round(inbound.gross - pay.paid, 2) AS residual_wht
    FROM pay
    JOIN inbound
      ON inbound.vendor_code = pay.vendor_code
     AND pay.trans_date IS NOT NULL
     AND inbound.trans_date IS NOT NULL
     AND pay.trans_date >= inbound.trans_date
     AND pay.trans_date <= inbound.trans_date + 45
     AND (inbound.gross - pay.paid) > 0
     AND abs((inbound.gross - pay.paid) - round((inbound.gross / 1.07) * 0.03, 2)) <= 0.10
  )
  SELECT *
  FROM pairs p
  WHERE (
      SELECT count(*) FROM pairs x WHERE x.bank_transaction_id = p.bank_transaction_id
    ) = 1
    AND (
      SELECT count(*) FROM pairs x WHERE x.inbound_id = p.inbound_id
    ) = 1
    AND NOT EXISTS (
      SELECT 1
      FROM public.payable_transactions w
      WHERE w.bank_transaction_id = p.bank_transaction_id
        AND w.ref_type = 'Withholding'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.bank_transactions b
      WHERE b.id = p.bank_transaction_id
        AND COALESCE(b.withholding_tax_amount, 0) > 0
    );

  SELECT count(*) INTO matched_count FROM sang_charoen_wht_match;
  RAISE NOTICE 'sang charoen wht match: %', matched_count;

  UPDATE public.bank_transactions bt
  SET
    withholding_tax_amount = m.residual_wht,
    withholding_tax_rate = 3
  FROM sang_charoen_wht_match m
  WHERE bt.id = m.bank_transaction_id;

  INSERT INTO public.payable_transactions (
    vendor_code,
    amount,
    ref_type,
    ref_id,
    trans_date,
    memo,
    bank_transaction_id
  )
  SELECT
    m.vendor_code,
    -m.residual_wht,
    'Withholding',
    NULL,
    to_char(m.pay_date, 'YYYY-MM-DD'),
    '원천세 3%',
    m.bank_transaction_id
  FROM sang_charoen_wht_match m;

  INSERT INTO public.withholding_tax_ledger_entries (
    payment_date,
    tax_month,
    payee_name,
    payee_tax_id,
    income_type,
    gross_amount,
    wht_rate,
    wht_amount,
    form_hint,
    certificate_no,
    filing_status,
    memo,
    store_name,
    created_by,
    direction,
    source_type,
    source_id
  )
  SELECT
    m.pay_date,
    to_char(m.pay_date, 'YYYY-MM'),
    left(COALESCE(v.name, '1014'), 500),
    NULLIF(regexp_replace(COALESCE(v.tax_id, ''), '\D', '', 'g'), ''),
    '서비스',
    round(m.gross / 1.07, 2),
    3,
    m.residual_wht,
    'PND53',
    left('BTW-' || m.bank_transaction_id::text, 128),
    'draft',
    left('[AUTO:BANK_WITHDRAW_WHT:' || m.bank_transaction_id::text || '] 통장 출금 원천세 자동', 2000),
    NULLIF(btrim(COALESCE(bt.store, bt.store_name, '')), ''),
    'system',
    'outbound',
    'bank_transaction',
    m.bank_transaction_id
  FROM sang_charoen_wht_match m
  JOIN public.bank_transactions bt ON bt.id = m.bank_transaction_id
  LEFT JOIN LATERAL (
    SELECT name, tax_id
    FROM public.vendors
    WHERE code = m.vendor_code
    ORDER BY id
    LIMIT 1
  ) v ON true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.withholding_tax_ledger_entries e
    WHERE e.source_type = 'bank_transaction'
      AND e.source_id = m.bank_transaction_id
      AND e.direction = 'outbound'
  );

  WITH inserted AS (
    INSERT INTO public.journal_entries (
      entry_no,
      accounting_date,
      source_type,
      source_id,
      store_name,
      memo,
      posted_by
    )
    SELECT
      'BPW-' || m.bank_transaction_id::text || '-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS'),
      m.pay_date,
      'bank_purchase_wht',
      m.bank_transaction_id,
      COALESCE(NULLIF(btrim(COALESCE(bt.store, bt.store_name, '')), ''), 'All'),
      '매입 지급 원천세',
      'system'
    FROM sang_charoen_wht_match m
    JOIN public.bank_transactions bt ON bt.id = m.bank_transaction_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.journal_entries je
      WHERE je.source_type = 'bank_purchase_wht'
        AND je.source_id = m.bank_transaction_id
    )
    RETURNING id, source_id, accounting_date, store_name
  ),
  lines AS (
    INSERT INTO public.journal_lines (
      journal_entry_id,
      line_no,
      account_code,
      account_name,
      side,
      amount,
      memo,
      account_subject_id
    )
    SELECT
      i.id,
      line.line_no,
      line.account_code,
      line.account_name,
      line.side,
      m.residual_wht,
      line.memo,
      (
        SELECT s.id
        FROM public.account_subjects s
        WHERE upper(s.code) = line.account_code
        ORDER BY s.id
        LIMIT 1
      )
    FROM inserted i
    JOIN sang_charoen_wht_match m ON m.bank_transaction_id = i.source_id
    CROSS JOIN (
      VALUES
        (1, '2110', '매입채무', 'debit', '원천세 상계'),
        (2, '2190', '원천세예수금', 'credit', '원천세예수금')
    ) AS line(line_no, account_code, account_name, side, memo)
    RETURNING journal_entry_id
  ),
  touched AS (
    SELECT DISTINCT journal_entry_id FROM lines
  )
  INSERT INTO public.ledger_balances (
    year_month,
    store_name,
    account_code,
    debit_total,
    credit_total,
    balance,
    updated_at
  )
  SELECT
    to_char(i.accounting_date, 'YYYY-MM'),
    COALESCE(i.store_name, 'All'),
    line.account_code,
    sum(CASE WHEN line.side = 'debit' THEN m.residual_wht ELSE 0 END),
    sum(CASE WHEN line.side = 'credit' THEN m.residual_wht ELSE 0 END),
    sum(CASE WHEN line.side = 'debit' THEN m.residual_wht ELSE -m.residual_wht END),
    now()
  FROM inserted i
  JOIN touched t ON t.journal_entry_id = i.id
  JOIN sang_charoen_wht_match m ON m.bank_transaction_id = i.source_id
  CROSS JOIN (
    VALUES
      ('2110', 'debit'),
      ('2190', 'credit')
  ) AS line(account_code, side)
  GROUP BY 1, 2, 3
  ON CONFLICT (year_month, store_name, account_code)
  DO UPDATE SET
    debit_total = public.ledger_balances.debit_total + EXCLUDED.debit_total,
    credit_total = public.ledger_balances.credit_total + EXCLUDED.credit_total,
    balance = (public.ledger_balances.debit_total + EXCLUDED.debit_total)
      - (public.ledger_balances.credit_total + EXCLUDED.credit_total),
    updated_at = now();
END $$;
