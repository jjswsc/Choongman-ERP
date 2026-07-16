-- Omni SaaS: 회계 핵심 테이블 tenant_id (회사 간 격리)
-- 없는 테이블은 건너뜁니다. 충만 레거시 DB에는 실행하지 않는 것을 권장.
--
-- 실행 후 앱이 JWT tenantId 로 bank/receivable/payable/petty/expense/journal 등을 필터합니다.

do $$
begin
  if to_regclass('public.bank_accounts') is not null then
    alter table public.bank_accounts add column if not exists tenant_id text;
    create index if not exists idx_bank_accounts_tenant_id on public.bank_accounts (tenant_id);
  end if;

  if to_regclass('public.bank_transactions') is not null then
    alter table public.bank_transactions add column if not exists tenant_id text;
    create index if not exists idx_bank_transactions_tenant_id on public.bank_transactions (tenant_id);
  end if;

  if to_regclass('public.bank_transaction_inbound_links') is not null then
    alter table public.bank_transaction_inbound_links add column if not exists tenant_id text;
    create index if not exists idx_bank_tx_inbound_links_tenant_id
      on public.bank_transaction_inbound_links (tenant_id);
  end if;

  if to_regclass('public.bank_memo_rules') is not null then
    alter table public.bank_memo_rules add column if not exists tenant_id text;
    create index if not exists idx_bank_memo_rules_tenant_id on public.bank_memo_rules (tenant_id);
  end if;

  if to_regclass('public.bank_memo_mapping_rules') is not null then
    alter table public.bank_memo_mapping_rules add column if not exists tenant_id text;
    create index if not exists idx_bank_memo_mapping_rules_tenant_id
      on public.bank_memo_mapping_rules (tenant_id);
  end if;

  if to_regclass('public.card_transactions') is not null then
    alter table public.card_transactions add column if not exists tenant_id text;
    create index if not exists idx_card_transactions_tenant_id on public.card_transactions (tenant_id);
  end if;

  if to_regclass('public.receivable_transactions') is not null then
    alter table public.receivable_transactions add column if not exists tenant_id text;
    create index if not exists idx_receivable_transactions_tenant_id
      on public.receivable_transactions (tenant_id);
  end if;

  if to_regclass('public.payable_transactions') is not null then
    alter table public.payable_transactions add column if not exists tenant_id text;
    create index if not exists idx_payable_transactions_tenant_id
      on public.payable_transactions (tenant_id);
  end if;

  if to_regclass('public.payable_settlement_links') is not null then
    alter table public.payable_settlement_links add column if not exists tenant_id text;
    create index if not exists idx_payable_settlement_links_tenant_id
      on public.payable_settlement_links (tenant_id);
  end if;

  if to_regclass('public.petty_cash_transactions') is not null then
    alter table public.petty_cash_transactions add column if not exists tenant_id text;
    create index if not exists idx_petty_cash_transactions_tenant_id
      on public.petty_cash_transactions (tenant_id);
  end if;

  if to_regclass('public.expense_accruals') is not null then
    alter table public.expense_accruals add column if not exists tenant_id text;
    create index if not exists idx_expense_accruals_tenant_id on public.expense_accruals (tenant_id);
  end if;

  if to_regclass('public.fixed_expenses') is not null then
    alter table public.fixed_expenses add column if not exists tenant_id text;
    create index if not exists idx_fixed_expenses_tenant_id on public.fixed_expenses (tenant_id);
  end if;

  if to_regclass('public.journal_entries') is not null then
    alter table public.journal_entries add column if not exists tenant_id text;
    create index if not exists idx_journal_entries_tenant_id on public.journal_entries (tenant_id);
  end if;

  if to_regclass('public.journal_lines') is not null then
    alter table public.journal_lines add column if not exists tenant_id text;
    create index if not exists idx_journal_lines_tenant_id on public.journal_lines (tenant_id);
  end if;

  if to_regclass('public.account_subjects') is not null then
    alter table public.account_subjects add column if not exists tenant_id text;
    create index if not exists idx_account_subjects_tenant_id on public.account_subjects (tenant_id);
  end if;

  if to_regclass('public.vat_ledger_entries') is not null then
    alter table public.vat_ledger_entries add column if not exists tenant_id text;
    create index if not exists idx_vat_ledger_entries_tenant_id on public.vat_ledger_entries (tenant_id);
  end if;

  if to_regclass('public.withholding_tax_ledger_entries') is not null then
    alter table public.withholding_tax_ledger_entries add column if not exists tenant_id text;
    create index if not exists idx_withholding_tax_ledger_entries_tenant_id
      on public.withholding_tax_ledger_entries (tenant_id);
  end if;

  if to_regclass('public.withholding_tax_pnd54_entries') is not null then
    alter table public.withholding_tax_pnd54_entries add column if not exists tenant_id text;
    create index if not exists idx_withholding_tax_pnd54_entries_tenant_id
      on public.withholding_tax_pnd54_entries (tenant_id);
  end if;

  if to_regclass('public.accounting_periods') is not null then
    alter table public.accounting_periods add column if not exists tenant_id text;
    create index if not exists idx_accounting_periods_tenant_id on public.accounting_periods (tenant_id);
  end if;

  if to_regclass('public.fixed_assets') is not null then
    alter table public.fixed_assets add column if not exists tenant_id text;
    create index if not exists idx_fixed_assets_tenant_id on public.fixed_assets (tenant_id);
  end if;
end $$;

-- 테넌트가 하나뿐이면 orphan 일괄 백필
do $$
declare
  tenant_cnt int;
  only_tenant text;
begin
  if to_regclass('public.tenants') is null then
    return;
  end if;

  select count(distinct nullif(trim(id), '')) into tenant_cnt from public.tenants;
  if tenant_cnt <> 1 then
    return;
  end if;

  select nullif(trim(id), '') into only_tenant from public.tenants limit 1;
  if only_tenant is null then
    return;
  end if;

  if to_regclass('public.bank_accounts') is not null then
    update public.bank_accounts set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.bank_transactions') is not null then
    update public.bank_transactions set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.receivable_transactions') is not null then
    update public.receivable_transactions set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.payable_transactions') is not null then
    update public.payable_transactions set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.petty_cash_transactions') is not null then
    update public.petty_cash_transactions set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.expense_accruals') is not null then
    update public.expense_accruals set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.fixed_expenses') is not null then
    update public.fixed_expenses set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.journal_entries') is not null then
    update public.journal_entries set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.account_subjects') is not null then
    update public.account_subjects set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.vat_ledger_entries') is not null then
    update public.vat_ledger_entries set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.withholding_tax_ledger_entries') is not null then
    update public.withholding_tax_ledger_entries set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
end $$;

-- store / store_name → erp_stores.tenant_id 백필 (다테넌트)
-- 컬럼 존재 여부는 information_schema 로 확인 (없는 컬럼 참조 방지)
do $$
declare
  has_col boolean;
begin
  if to_regclass('public.erp_stores') is null then
    return;
  end if;

  if to_regclass('public.bank_transactions') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'bank_transactions' and column_name = 'store_name'
    ) into has_col;
    if has_col then
      update public.bank_transactions bt
      set tenant_id = es.tenant_id
      from public.erp_stores es
      where coalesce(trim(bt.tenant_id), '') = ''
        and nullif(trim(es.tenant_id), '') is not null
        and (
          lower(trim(coalesce(bt.store_name, ''))) = lower(trim(coalesce(es.store_code, '')))
          or lower(trim(coalesce(bt.store_name, ''))) = lower(trim(coalesce(es.store_name, '')))
        );
    end if;
  end if;

  if to_regclass('public.receivable_transactions') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'receivable_transactions' and column_name = 'store_name'
    ) into has_col;
    if has_col then
      update public.receivable_transactions rt
      set tenant_id = es.tenant_id
      from public.erp_stores es
      where coalesce(trim(rt.tenant_id), '') = ''
        and nullif(trim(es.tenant_id), '') is not null
        and (
          lower(trim(coalesce(rt.store_name, ''))) = lower(trim(coalesce(es.store_code, '')))
          or lower(trim(coalesce(rt.store_name, ''))) = lower(trim(coalesce(es.store_name, '')))
        );
    end if;
  end if;

  if to_regclass('public.payable_transactions') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'payable_transactions' and column_name = 'store'
    ) into has_col;
    if has_col then
      update public.payable_transactions pt
      set tenant_id = es.tenant_id
      from public.erp_stores es
      where coalesce(trim(pt.tenant_id), '') = ''
        and nullif(trim(es.tenant_id), '') is not null
        and (
          lower(trim(coalesce(pt.store, ''))) = lower(trim(coalesce(es.store_code, '')))
          or lower(trim(coalesce(pt.store, ''))) = lower(trim(coalesce(es.store_name, '')))
        );
    end if;
  end if;

  if to_regclass('public.petty_cash_transactions') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'petty_cash_transactions' and column_name = 'store'
    ) into has_col;
    if has_col then
      update public.petty_cash_transactions pc
      set tenant_id = es.tenant_id
      from public.erp_stores es
      where coalesce(trim(pc.tenant_id), '') = ''
        and nullif(trim(es.tenant_id), '') is not null
        and (
          lower(trim(coalesce(pc.store, ''))) = lower(trim(coalesce(es.store_code, '')))
          or lower(trim(coalesce(pc.store, ''))) = lower(trim(coalesce(es.store_name, '')))
        );
    end if;
  end if;

  if to_regclass('public.expense_accruals') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'expense_accruals' and column_name = 'store'
    ) into has_col;
    if has_col then
      update public.expense_accruals ea
      set tenant_id = es.tenant_id
      from public.erp_stores es
      where coalesce(trim(ea.tenant_id), '') = ''
        and nullif(trim(es.tenant_id), '') is not null
        and (
          lower(trim(coalesce(ea.store, ''))) = lower(trim(coalesce(es.store_code, '')))
          or lower(trim(coalesce(ea.store, ''))) = lower(trim(coalesce(es.store_name, '')))
        );
    end if;
  end if;

  if to_regclass('public.journal_entries') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'journal_entries' and column_name = 'store_name'
    ) into has_col;
    if has_col then
      update public.journal_entries je
      set tenant_id = es.tenant_id
      from public.erp_stores es
      where coalesce(trim(je.tenant_id), '') = ''
        and nullif(trim(es.tenant_id), '') is not null
        and (
          lower(trim(coalesce(je.store_name, ''))) = lower(trim(coalesce(es.store_code, '')))
          or lower(trim(coalesce(je.store_name, ''))) = lower(trim(coalesce(es.store_name, '')))
        );
    end if;
  end if;

  if to_regclass('public.fixed_expenses') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fixed_expenses' and column_name = 'store'
    ) into has_col;
    if has_col then
      update public.fixed_expenses fe
      set tenant_id = es.tenant_id
      from public.erp_stores es
      where coalesce(trim(fe.tenant_id), '') = ''
        and nullif(trim(es.tenant_id), '') is not null
        and (
          lower(trim(coalesce(fe.store, ''))) = lower(trim(coalesce(es.store_code, '')))
          or lower(trim(coalesce(fe.store, ''))) = lower(trim(coalesce(es.store_name, '')))
        );
    end if;
  end if;

  if to_regclass('public.bank_accounts') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'bank_accounts' and column_name = 'store'
    ) into has_col;
    if has_col then
      update public.bank_accounts ba
      set tenant_id = es.tenant_id
      from public.erp_stores es
      where coalesce(trim(ba.tenant_id), '') = ''
        and nullif(trim(es.tenant_id), '') is not null
        and (
          lower(trim(coalesce(ba.store, ''))) = lower(trim(coalesce(es.store_code, '')))
          or lower(trim(coalesce(ba.store, ''))) = lower(trim(coalesce(es.store_name, '')))
        );
    end if;
  end if;

  if to_regclass('public.bank_accounts') is not null
     and to_regclass('public.bank_transactions') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'bank_transactions' and column_name = 'account_id'
    ) into has_col;
    if has_col then
      update public.bank_accounts ba
      set tenant_id = src.tenant_id
      from (
        select distinct on (account_id)
          account_id, tenant_id
        from public.bank_transactions
        where coalesce(trim(tenant_id), '') <> ''
          and account_id is not null
        order by account_id, id desc
      ) src
      where ba.id = src.account_id
        and coalesce(trim(ba.tenant_id), '') = '';
    end if;
  end if;
end $$;
