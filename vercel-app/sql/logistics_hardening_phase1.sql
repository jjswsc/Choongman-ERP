-- 물류 하드닝 1차
-- 목적:
-- 1) 삭제 이벤트 request_key 재처리 방지(가능한 경우 유니크 강제)
-- 2) ForceOutbound 소프트삭제 행을 참조하는 미수금 입력 사전 차단
-- 3) 소프트삭제 기반 조회/삭제 성능 인덱스 보강
--
-- Supabase SQL Editor에서 실행 (idempotent)

begin;

-- A. stock_logs: 활성 출고 조회 성능 보강
do $$
begin
  if to_regclass('public.stock_logs') is null then
    raise notice 'public.stock_logs table does not exist. Skip stock_logs hardening.';
    return;
  end if;

  create index if not exists idx_stock_logs_outbound_active_vendor_date
    on public.stock_logs(log_type, is_deleted, vendor_target, log_date desc)
    where log_type in ('Outbound', 'ForceOutbound', 'ForcePush');

  create index if not exists idx_stock_logs_force_outbound_active_id
    on public.stock_logs(id)
    where log_type = 'ForceOutbound' and coalesce(is_deleted, false) = false;
end
$$;

-- B. outbound_delete_events: request_key 인덱스 + 중복 없을 때 유니크 강제
do $$
begin
  if to_regclass('public.outbound_delete_events') is null then
    raise notice 'public.outbound_delete_events table does not exist. Skip request_key hardening.';
    return;
  end if;

  create index if not exists idx_outbound_delete_events_request_key
    on public.outbound_delete_events(request_key)
    where request_key is not null and btrim(request_key) <> '';

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'ux_outbound_delete_events_request_key_norm'
  ) then
    if exists (
      select 1
      from public.outbound_delete_events e
      where e.request_key is not null and btrim(e.request_key) <> ''
      group by lower(btrim(e.request_key))
      having count(*) > 1
    ) then
      raise notice 'Skip unique request_key index: duplicated normalized request_key exists.';
    else
      execute '
        create unique index ux_outbound_delete_events_request_key_norm
          on public.outbound_delete_events ((lower(btrim(request_key))))
          where request_key is not null and btrim(request_key) <> ''''
      ';
    end if;
  end if;
end
$$;

-- C. receivable_transactions: 삭제된 ForceOutbound 참조 사전 차단 트리거
do $$
begin
  if to_regclass('public.receivable_transactions') is null then
    raise notice 'public.receivable_transactions table does not exist. Skip receivable guard.';
    return;
  end if;
  if to_regclass('public.stock_logs') is null then
    raise notice 'public.stock_logs table does not exist. Skip receivable guard.';
    return;
  end if;

  execute $fn$
    create or replace function public.guard_receivable_force_outbound_active()
    returns trigger
    language plpgsql
    as $body$
    declare
      v_ref_type text := upper(btrim(coalesce(new.ref_type, '')));
      v_ref_id bigint := coalesce(new.ref_id, 0);
      v_ok boolean := false;
    begin
      if v_ref_type <> 'FORCEOUTBOUND' then
        return new;
      end if;

      if v_ref_id <= 0 then
        raise exception 'ForceOutbound receivable requires positive ref_id';
      end if;

      select exists (
        select 1
        from public.stock_logs s
        where s.id = v_ref_id
          and s.log_type = 'ForceOutbound'
          and coalesce(s.is_deleted, false) = false
      ) into v_ok;

      if not v_ok then
        raise exception 'Cannot reference deleted/non-existing ForceOutbound stock_log (ref_id=%)', v_ref_id;
      end if;

      return new;
    end
    $body$;
  $fn$;

  execute 'alter function public.guard_receivable_force_outbound_active() set search_path = public';
  execute 'drop trigger if exists trg_receivable_force_outbound_active_guard on public.receivable_transactions';
  execute '
    create trigger trg_receivable_force_outbound_active_guard
    before insert or update of ref_type, ref_id
    on public.receivable_transactions
    for each row
    execute function public.guard_receivable_force_outbound_active()
  ';
end
$$;

commit;
