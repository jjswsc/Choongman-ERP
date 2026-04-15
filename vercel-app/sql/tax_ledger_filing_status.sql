-- VAT/WHT 원장 제출상태(대기/완료/제출자/제출시각) 확장
-- 주의: omni처럼 원장 테이블 자체가 없는 환경에서는 이 스크립트가 "건너뛰기"만 합니다.
--       먼저 accounting_compliance_extensions.sql(또는 000_accounting_core_one_shot.sql) 적용 후 재실행하세요.

DO $$
BEGIN
  IF to_regclass('public.vat_ledger_entries') IS NOT NULL THEN
    EXECUTE $sql$
      ALTER TABLE public.vat_ledger_entries
        ADD COLUMN IF NOT EXISTS filing_status TEXT NULL,
        ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS submitted_by TEXT NULL
    $sql$;

    EXECUTE $sql$
      UPDATE public.vat_ledger_entries
      SET filing_status = 'draft'
      WHERE filing_status IS NULL OR btrim(filing_status) = ''
    $sql$;

    EXECUTE $sql$
      UPDATE public.vat_ledger_entries
      SET submitted_at = NULL,
          submitted_by = NULL
      WHERE filing_status <> 'submitted'
    $sql$;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'vat_ledger_entries_filing_status_check'
    ) THEN
      EXECUTE $sql$
        ALTER TABLE public.vat_ledger_entries
          ADD CONSTRAINT vat_ledger_entries_filing_status_check
          CHECK (filing_status IS NULL OR filing_status IN ('draft', 'submitted'))
      $sql$;
    END IF;

    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_vat_ledger_filing_status
        ON public.vat_ledger_entries (tax_month, filing_status)
    $sql$;
  ELSE
    RAISE NOTICE 'SKIP: public.vat_ledger_entries not found. Run accounting_compliance_extensions.sql first.';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.withholding_tax_ledger_entries') IS NOT NULL THEN
    EXECUTE $sql$
      ALTER TABLE public.withholding_tax_ledger_entries
        ADD COLUMN IF NOT EXISTS filing_status TEXT NULL,
        ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS submitted_by TEXT NULL
    $sql$;

    EXECUTE $sql$
      UPDATE public.withholding_tax_ledger_entries
      SET filing_status = 'draft'
      WHERE filing_status IS NULL OR btrim(filing_status) = ''
    $sql$;

    EXECUTE $sql$
      UPDATE public.withholding_tax_ledger_entries
      SET submitted_at = NULL,
          submitted_by = NULL
      WHERE filing_status <> 'submitted'
    $sql$;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'withholding_tax_ledger_entries_filing_status_check'
    ) THEN
      EXECUTE $sql$
        ALTER TABLE public.withholding_tax_ledger_entries
          ADD CONSTRAINT withholding_tax_ledger_entries_filing_status_check
          CHECK (filing_status IS NULL OR filing_status IN ('draft', 'submitted'))
      $sql$;
    END IF;

    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_wht_ledger_filing_status
        ON public.withholding_tax_ledger_entries (tax_month, filing_status)
    $sql$;
  ELSE
    RAISE NOTICE 'SKIP: public.withholding_tax_ledger_entries not found. Run accounting_compliance_extensions.sql first.';
  END IF;
END $$;
