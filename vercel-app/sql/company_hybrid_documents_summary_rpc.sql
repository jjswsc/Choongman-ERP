-- 문서 관리 KPI·매장별 준수 요약 (방콕 달력 valid_to 기준)
-- Supabase SQL Editor에서 테넌트 DB에 적용

create or replace function public.get_company_hybrid_documents_summary(p_store text default null)
returns jsonb
language plpgsql
stable
as $$
declare
  v_today date;
  v_soon_end date;
  v_store text;
  v_total bigint;
  v_expiring_soon bigint;
  v_expired bigint;
  v_corr_overdue bigint;
  v_stores jsonb;
begin
  v_today := (timezone('Asia/Bangkok', now()))::date;
  v_soon_end := v_today + interval '30 days';
  v_store := nullif(trim(p_store), '');

  if v_store is not null and v_store in ('__cm_all_stores__', 'all', 'ALL') then
    v_store := null;
  end if;

  select count(*)::bigint into v_total
  from public.company_hybrid_documents d
  where d.deleted_at is null
    and (v_store is null or d.store = v_store);

  select count(*)::bigint into v_expiring_soon
  from public.company_hybrid_documents d
  where d.deleted_at is null
    and (v_store is null or d.store = v_store)
    and d.valid_to is not null
    and d.valid_to >= v_today
    and d.valid_to <= v_soon_end;

  select count(*)::bigint into v_expired
  from public.company_hybrid_documents d
  where d.deleted_at is null
    and (v_store is null or d.store = v_store)
    and d.valid_to is not null
    and d.valid_to < v_today;

  select count(*)::bigint into v_corr_overdue
  from public.company_hybrid_documents d
  where d.deleted_at is null
    and (v_store is null or d.store = v_store)
    and (d.metadata->'correspondence'->>'replyDue') is not null
    and trim(d.metadata->'correspondence'->>'replyDue') <> ''
    and (d.metadata->'correspondence'->>'replyDue')::date < v_today
    and coalesce(d.metadata->'correspondence'->>'status', '') not in ('replied', 'filed');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'store', s.store,
        'total', s.total,
        'expiring_soon', s.expiring_soon,
        'expired', s.expired,
        'compliance_pct',
          case when s.total = 0 then 100
               else round(((s.total - s.expired)::numeric / s.total) * 100, 1)
          end
      )
      order by s.store
    ),
    '[]'::jsonb
  ) into v_stores
  from (
    select
      d.store,
      count(*)::bigint as total,
      count(*) filter (
        where d.valid_to is not null and d.valid_to >= v_today and d.valid_to <= v_soon_end
      )::bigint as expiring_soon,
      count(*) filter (
        where d.valid_to is not null and d.valid_to < v_today
      )::bigint as expired
    from public.company_hybrid_documents d
    where d.deleted_at is null
      and (v_store is null or d.store = v_store)
    group by d.store
  ) s;

  return jsonb_build_object(
    'today', v_today,
    'total', v_total,
    'expiring_soon', v_expiring_soon,
    'expired', v_expired,
    'corr_overdue', v_corr_overdue,
    'stores', v_stores
  );
end;
$$;

comment on function public.get_company_hybrid_documents_summary(text) is
  '문서 관리 KPI — 전체/만료임박(30일)/만료/공문 회신 지연 + 매장별 준수율';
