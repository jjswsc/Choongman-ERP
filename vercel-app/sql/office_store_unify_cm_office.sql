-- 본사 매장 표기 HQ·Office·본사 등 → CM Office 단일화
-- Supabase SQL Editor에서 1회 실행. (방콕 운영 DB 백업 후 적용 권장)

-- 1) erp_stores — CM Office에 HQ·Office 별칭 보강, HQ 단독 행 비활성화
update public.erp_stores
set
  aliases = (
    select array(
      select distinct a
      from unnest(
        coalesce(aliases, '{}'::text[])
        || array['HQ', 'hq', 'Office', 'office', '본사', '오피스', '본점', 'Head Office']
      ) as a
      where trim(coalesce(a, '')) <> ''
        and lower(trim(a)) <> lower(trim(store_code))
    )
  ),
  updated_at = now()
where lower(trim(store_code)) in ('cm office', 'cmoffice')
   or lower(trim(display_name)) in ('cm office', 'cmoffice');

update public.erp_stores
set is_active = false, updated_at = now()
where lower(trim(store_code)) in ('hq', 'test')
  and lower(trim(store_code)) <> lower(trim('CM Office'));

-- 2) 통장·지출·직원 등 운영 데이터
do $office$
declare
  canon text := 'CM Office';
begin
  if to_regclass('public.bank_accounts') is not null then
    update public.bank_accounts
    set store = canon
    where lower(trim(coalesce(store, ''))) in (
      'hq', 'office', '본사', '오피스', '본점', 'head office', 'cm office'
    )
      and trim(coalesce(store, '')) <> canon;
  end if;

  if to_regclass('public.bank_transactions') is not null then
    update public.bank_transactions
    set store = canon
    where lower(trim(coalesce(store, ''))) in (
      'hq', 'office', '본사', '오피스', '본점', 'head office', 'cm office'
    )
      and trim(coalesce(store, '')) <> canon;

    update public.bank_transactions
    set store_name = canon
    where lower(trim(coalesce(store_name, ''))) in (
      'hq', 'office', '본사', '오피스', '본점', 'head office', 'cm office'
    )
      and trim(coalesce(store_name, '')) <> canon;
  end if;

  if to_regclass('public.expense_accruals') is not null then
    update public.expense_accruals
    set store_name = canon
    where lower(trim(coalesce(store_name, ''))) in (
      'hq', 'office', '본사', '오피스', '본점', 'head office', 'cm office'
    )
      and trim(coalesce(store_name, '')) <> canon;
  end if;

  if to_regclass('public.petty_cash_transactions') is not null then
    update public.petty_cash_transactions
    set store = canon
    where lower(trim(coalesce(store, ''))) in (
      'hq', 'office', '본사', '오피스', '본점', 'head office', 'cm office'
    )
      and trim(coalesce(store, '')) <> canon;
  end if;

  if to_regclass('public.employees') is not null then
    update public.employees
    set store = canon
    where lower(trim(coalesce(store, ''))) in (
      'hq', 'office', '본사', '오피스', '본점', 'head office'
    )
      and trim(coalesce(store, '')) <> canon;
  end if;
end
$office$;

-- 3) 확인 (선택)
-- select distinct store from public.bank_transactions where lower(trim(store)) like '%office%' or lower(trim(store)) = 'hq';
-- select distinct store_name from public.expense_accruals where lower(trim(store_name)) like '%office%' or lower(trim(store_name)) = 'hq';
