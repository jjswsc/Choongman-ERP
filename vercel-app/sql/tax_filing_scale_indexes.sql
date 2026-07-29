-- Omni/충만 대형(100법인·300매장)용 세무·재무 인덱스
-- 테이블/컬럼이 없는 환경(Omni 초기 등)에서는 해당 인덱스만 스킵

DO $$
BEGIN
  -- POS 채널 매출 / PP30
  IF to_regclass('public.pos_orders') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_pos_orders_paid_at_status_store
      ON public.pos_orders (paid_at, status, store_code);
    CREATE INDEX IF NOT EXISTS idx_pos_orders_status_paid_at
      ON public.pos_orders (status, paid_at);
  END IF;

  -- 분개 (법인세·재무제표)
  IF to_regclass('public.journal_entries') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_journal_entries_acct_date_store
      ON public.journal_entries (accounting_date, store_name);
  END IF;

  IF to_regclass('public.journal_lines') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id
      ON public.journal_lines (journal_entry_id);
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'journal_lines' AND column_name = 'account_code'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_account
        ON public.journal_lines (journal_entry_id, account_code);
    END IF;
  END IF;

  -- 법인 스코프
  IF to_regclass('public.tax_entity_stores') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tax_entity_stores_entity_code
      ON public.tax_entity_stores (entity_code);
    CREATE INDEX IF NOT EXISTS idx_tax_entity_stores_store_code
      ON public.tax_entity_stores (store_code);
  END IF;

  IF to_regclass('public.store_tax_filing_profiles') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_store_tax_filing_profiles_tax_id
      ON public.store_tax_filing_profiles (tax_id);
  END IF;

  -- VAT 원장 (PP30)
  IF to_regclass('public.vat_ledger_entries') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_vat_ledger_entries_tax_month_store
      ON public.vat_ledger_entries (tax_month, store_name);
    CREATE INDEX IF NOT EXISTS idx_vat_ledger_entries_direction_tax_month
      ON public.vat_ledger_entries (direction, tax_month);
  END IF;
END $$;
