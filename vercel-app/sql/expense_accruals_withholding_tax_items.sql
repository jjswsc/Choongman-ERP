-- 지출 발생·통장 출금: 원천징수 여러 건(ค่าเช่า 5% + ค่าบริการ 3% 등)을 jsonb로 저장
-- 합계 컬럼 withholding_tax_amount 는 그대로 실지급액 계산에 사용
-- Supabase SQL Editor에서 이것만 복사 → Run

alter table public.expense_accruals
  add column if not exists withholding_tax_items jsonb;

comment on column public.expense_accruals.withholding_tax_items is
  '원천징수 항목 배열 [{incomeType, rate, baseAmount, taxAmount}]. 합계는 withholding_tax_amount';

alter table public.bank_transactions
  add column if not exists withholding_tax_items jsonb;

comment on column public.bank_transactions.withholding_tax_items is
  '출금 원천징수 항목 배열 [{incomeType, rate, baseAmount, taxAmount}]. 합계는 withholding_tax_amount';
