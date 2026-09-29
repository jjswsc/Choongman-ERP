-- 세무 장부 칸. 기존 자동분개(book NULL)는 기업 시산에 그대로 두고, book=tax 만 세무 장부로 읽는다.
-- 영업 중 실행해도 기존 분개 행은 바꾸지 않는다.

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS book TEXT NULL,
  ADD COLUMN IF NOT EXISTS voucher_kind TEXT NULL,
  ADD COLUMN IF NOT EXISTS tax_entity_code TEXT NULL;

COMMENT ON COLUMN public.journal_entries.book IS 'tax = 세무 장부. NULL 은 운영 자동분개';
COMMENT ON COLUMN public.journal_entries.voucher_kind IS 'sales|purchase|receipt|payment|general|closing';
COMMENT ON COLUMN public.journal_entries.tax_entity_code IS '법인 코드 또는 tin:사업자번호';

CREATE INDEX IF NOT EXISTS idx_journal_entries_tax_book
  ON public.journal_entries (book, tax_entity_code, accounting_date);

INSERT INTO public.account_subjects (code, name, name_en, type, p_and_l_section, sort_order, statement_type, normal_side)
VALUES
  ('1360', '매입세액', 'Input VAT', 'asset', NULL, 8, 'bs', 'debit'),
  ('1395', '세무부가세대체', 'Tax VAT clearing', 'asset', NULL, 9, 'bs', 'debit'),
  ('5310', '급여', 'Salaries', 'expense', 'expense', 120, 'pl', 'debit')
ON CONFLICT (code) DO NOTHING;
