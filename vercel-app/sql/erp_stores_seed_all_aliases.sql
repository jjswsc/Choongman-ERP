-- =============================================================================
-- erp_stores 전 매장 aliases 시드/보강
-- =============================================================================
--
-- [실행] 아래 「▼ 복사 시작」~「▲ 복사 끝」 전체를 Supabase SQL Editor에 붙여넣고 Run
--
-- [결과]
--   label_type = SUMMARY   → 요약
--   label_type = UNMATCHED → aliases 수동 보강 대상
--
-- [SELECT만 실패할 때]
--   같은 블록에서 create or replace function ... 부분만 다시 Run 후
--   select * from public.seed_erp_store_aliases(); 실행
--
-- [참고 — UNMATCHED 중 본사 거래처]
--   Aum, Bangna Saemaeul Gamjatang, Office-Logistic, POS, R&B Food Supply, 본사, 입고등록
--   → erp_stores 가맹 alias 아님. lib/head-office-counterparty-labels.ts 에서
--     본사(Office) 세무·원장 필터 선택 시에만 집계됨.
--


-- ▼ 복사 시작 ────────────────────────────────────────────────────────────────

create or replace function public.seed_erp_store_aliases()
returns table(seq_no integer, label_type text, detail text)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if to_regclass('public.erp_stores') is null then
    raise exception 'public.erp_stores 없음 → sql/erp_stores.sql 먼저 실행';
  end if;

  drop table if exists _seed_work;
  create temp table _seed_work (
    raw_value text not null,
    source text not null
  ) on commit drop;

  if to_regclass('public.pos_orders') is not null then
    insert into _seed_work (raw_value, source)
    select distinct trim(store_code), 'pos_orders.store_code'
    from public.pos_orders
    where trim(coalesce(store_code, '')) <> '';
  end if;

  if to_regclass('public.employees') is not null then
    insert into _seed_work (raw_value, source)
    select distinct trim(store), 'employees.store'
    from public.employees
    where trim(coalesce(store, '')) <> '';
  end if;

  if to_regclass('public.stock_logs') is not null then
    insert into _seed_work (raw_value, source)
    select distinct trim(location), 'stock_logs.location'
    from public.stock_logs
    where trim(coalesce(location, '')) <> '';
  end if;

  if to_regclass('public.expense_accruals') is not null then
    insert into _seed_work (raw_value, source)
    select distinct trim(store_name), 'expense_accruals.store_name'
    from public.expense_accruals
    where trim(coalesce(store_name, '')) <> '';
  end if;

  if to_regclass('public.journal_entries') is not null then
    insert into _seed_work (raw_value, source)
    select distinct trim(store_name), 'journal_entries.store_name'
    from public.journal_entries
    where trim(coalesce(store_name, '')) <> '';
  end if;

  if to_regclass('public.vat_ledger_entries') is not null then
    insert into _seed_work (raw_value, source)
    select distinct trim(store_name), 'vat_ledger_entries.store_name'
    from public.vat_ledger_entries
    where trim(coalesce(store_name, '')) <> '';
  end if;

  if to_regclass('public.withholding_tax_ledger_entries') is not null then
    insert into _seed_work (raw_value, source)
    select distinct trim(store_name), 'withholding_tax_ledger_entries.store_name'
    from public.withholding_tax_ledger_entries
    where trim(coalesce(store_name, '')) <> '';
  end if;

  if to_regclass('public.vat_pp36_ledger_entries') is not null then
    insert into _seed_work (raw_value, source)
    select distinct trim(store_name), 'vat_pp36_ledger_entries.store_name'
    from public.vat_pp36_ledger_entries
    where trim(coalesce(store_name, '')) <> '';
  end if;

  if to_regclass('public.withholding_tax_pnd54_entries') is not null then
    insert into _seed_work (raw_value, source)
    select distinct trim(store_name), 'withholding_tax_pnd54_entries.store_name'
    from public.withholding_tax_pnd54_entries
    where trim(coalesce(store_name, '')) <> '';
  end if;

  if to_regclass('public.pos_printer_settings') is not null then
    insert into _seed_work (raw_value, source)
    select distinct trim(store_code), 'pos_printer_settings.store_code'
    from public.pos_printer_settings
    where trim(coalesce(store_code, '')) <> '';
  end if;

  if to_regclass('public.pos_menu_store_scopes') is not null then
    insert into _seed_work (raw_value, source)
    select distinct trim(store_code), 'pos_menu_store_scopes.store_code'
    from public.pos_menu_store_scopes
    where trim(coalesce(store_code, '')) <> '';
  end if;

  insert into public.erp_stores (
    store_code, display_name, aliases, sort_order, is_active, created_at, updated_at
  )
  with observed as (
    select distinct trim(raw_value) as raw_value
    from _seed_work
    where trim(raw_value) <> ''
      and lower(trim(raw_value)) not in (
        'all', '*', 'store', '매장명',
        'aum', 'bangna saemaeul gamjatang', 'office-logistic', 'pos',
        'r&b food supply', '본사', '입고등록'
      )
  ),
  seed_codes as (
    select o.raw_value
    from observed o
    where exists (
      select 1 from _seed_work r
      where r.raw_value = o.raw_value and r.source = 'pos_orders.store_code'
    )
  ),
  max_sort as (
    select coalesce(max(es.sort_order), 0) as max_sort_order
    from public.erp_stores es
  ),
  to_insert as (
    select
      s.raw_value as store_code,
      s.raw_value as display_name,
      '{}'::text[] as aliases,
      (select max_sort_order from max_sort)
        + row_number() over (order by s.raw_value) * 10 as new_sort_order
    from seed_codes s
    where not exists (
      select 1 from public.erp_stores e
      where lower(regexp_replace(trim(e.store_code), '[\s\-_]+', '', 'g'))
          = lower(regexp_replace(trim(s.raw_value), '[\s\-_]+', '', 'g'))
    )
  )
  select ti.store_code, ti.display_name, ti.aliases, ti.new_sort_order, true, now(), now()
  from to_insert ti;

  with observed as (
    select distinct
      trim(raw_value) as raw_value,
      lower(regexp_replace(trim(raw_value), '[\s\-_]+', '', 'g')) as key_norm,
      regexp_replace(lower(regexp_replace(trim(raw_value), '[\s\-_]+', '', 'g')), '^cm', '') as key_no_cm
    from _seed_work
    where trim(raw_value) <> ''
      and lower(trim(raw_value)) not in (
        'all', '*', 'store', '매장명',
        'aum', 'bangna saemaeul gamjatang', 'office-logistic', 'pos',
        'r&b food supply', '본사', '입고등록'
      )
  ),
  existing_base as (
    select
      e.store_code,
      e.display_name,
      lower(regexp_replace(trim(e.store_code), '[\s\-_]+', '', 'g')) as code_key,
      regexp_replace(lower(regexp_replace(trim(e.store_code), '[\s\-_]+', '', 'g')), '^cm', '') as code_key_no_cm,
      lower(regexp_replace(trim(e.display_name), '[\s\-_]+', '', 'g')) as name_key,
      regexp_replace(lower(regexp_replace(trim(e.display_name), '[\s\-_]+', '', 'g')), '^cm', '') as name_key_no_cm
    from public.erp_stores e
  ),
  existing_alias as (
    select
      e.store_code,
      lower(regexp_replace(trim(a.alias), '[\s\-_]+', '', 'g')) as alias_key,
      regexp_replace(lower(regexp_replace(trim(a.alias), '[\s\-_]+', '', 'g')), '^cm', '') as alias_key_no_cm
    from public.erp_stores e
    cross join lateral unnest(coalesce(e.aliases, '{}'::text[])) as a(alias)
    where trim(coalesce(a.alias, '')) <> ''
  ),
  candidate_match as (
    select
      o.raw_value,
      b.store_code,
      row_number() over (
        partition by o.raw_value
        order by
          case
            when lower(o.raw_value) = lower(b.store_code) then 1
            when lower(o.raw_value) = lower(b.display_name) then 2
            when o.key_norm = b.code_key then 3
            when o.key_norm = b.name_key then 4
            when o.key_no_cm = b.code_key_no_cm then 5
            when o.key_no_cm = b.name_key_no_cm then 6
            else 99
          end,
          b.store_code
      ) as rn
    from observed o
    join existing_base b on (
      o.key_norm = b.code_key or o.key_norm = b.name_key
      or o.key_no_cm = b.code_key_no_cm or o.key_no_cm = b.name_key_no_cm
      or exists (
        select 1 from existing_alias a
        where a.store_code = b.store_code
          and (o.key_norm = a.alias_key or o.key_no_cm = a.alias_key_no_cm)
      )
    )
  ),
  picked as (select raw_value, store_code from candidate_match where rn = 1),
  agg as (
    select
      e.store_code,
      array_cat(coalesce(e.aliases, '{}'::text[]), coalesce(array_agg(distinct p.raw_value), '{}'::text[])) as merged_aliases
    from public.erp_stores e
    left join picked p on p.store_code = e.store_code
    group by e.store_code, e.aliases
  ),
  normalized as (
    select
      a.store_code,
      array(
        select distinct trim(x) from unnest(a.merged_aliases) as t(x)
        where trim(coalesce(x, '')) <> ''
          and lower(trim(x)) not in ('all', '*', 'store', '매장명')
        order by trim(x)
      ) as aliases
    from agg a
  )
  update public.erp_stores e
  set aliases = n.aliases, updated_at = now()
  from normalized n
  where e.store_code = n.store_code and e.aliases is distinct from n.aliases;

  return query
  select * from (
    with observed as (
      select distinct
        trim(raw_value) as raw_value,
        lower(regexp_replace(trim(raw_value), '[\s\-_]+', '', 'g')) as key_norm,
        regexp_replace(lower(regexp_replace(trim(raw_value), '[\s\-_]+', '', 'g')), '^cm', '') as key_no_cm
      from _seed_work
      where trim(raw_value) <> ''
        and lower(trim(raw_value)) not in (
        'all', '*', 'store', '매장명',
        'aum', 'bangna saemaeul gamjatang', 'office-logistic', 'pos',
        'r&b food supply', '본사', '입고등록'
      )
    ),
    matched as (
      select distinct p.raw_value
      from (
        select o.raw_value, row_number() over (partition by o.raw_value order by e.store_code) as rn
        from observed o
        join public.erp_stores e on (
          o.key_norm = lower(regexp_replace(trim(e.store_code), '[\s\-_]+', '', 'g'))
          or o.key_norm = lower(regexp_replace(trim(e.display_name), '[\s\-_]+', '', 'g'))
          or o.key_no_cm = regexp_replace(lower(regexp_replace(trim(e.store_code), '[\s\-_]+', '', 'g')), '^cm', '')
          or o.key_no_cm = regexp_replace(lower(regexp_replace(trim(e.display_name), '[\s\-_]+', '', 'g')), '^cm', '')
        )
      ) p where p.rn = 1
    ),
    stats as (
      select
        (select count(*) from _seed_work) as observed_rows,
        (select count(*) from observed) as observed_labels,
        (select count(*) from public.erp_stores) as erp_store_rows,
        (select count(*) from observed o left join matched m on m.raw_value = o.raw_value where m.raw_value is null) as unmatched_count
    )
    select 0, 'SUMMARY'::text, format(
      '수집 %s건 · 관측 표기 %s개 · erp_stores %s행 · 미매칭 %s개',
      s.observed_rows, s.observed_labels, s.erp_store_rows, s.unmatched_count
    )
    from stats s
    union all
    select 1, 'UNMATCHED'::text, o.raw_value
    from observed o
    left join matched m on m.raw_value = o.raw_value
    where m.raw_value is null
  ) rows
  order by 1, 3;
end;
$fn$;

select * from public.seed_erp_store_aliases();

-- ▲ 복사 끝 ──────────────────────────────────────────────────────────────────
