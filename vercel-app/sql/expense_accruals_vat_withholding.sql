-- 지출 발생(expense_accruals): 등록 시 부가세·원천징수 입력, 지급예정은 실지급액 기준
-- Supabase SQL Editor에서 실행 후 배포

alter table public.expense_accruals
  add column if not exists vat_amount numeric(18, 2);

alter table public.expense_accruals
  add column if not exists withholding_tax_amount numeric(18, 2);

comment on column public.expense_accruals.amount is '인보이스·비용 총액(세금포함)';
comment on column public.expense_accruals.vat_amount is '부가세(VAT) 금액(참고)';
comment on column public.expense_accruals.withholding_tax_amount is '원천징수세 — 실지급액 = amount - 이 값';
