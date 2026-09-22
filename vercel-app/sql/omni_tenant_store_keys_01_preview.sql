-- Omni만. 충만 DB에는 실행하지 마세요.
-- 매장코드 키를 (tenant_id, …) 로 바꾸기 전에 막히는 행만 보여 줍니다.
-- 결과가 0건이면 02를 실행해도 됩니다.

SELECT check_name, detail, n
FROM (
  SELECT 'ambiguous_store_code'::text AS check_name,
         lower(btrim(store_code)) AS detail,
         count(DISTINCT tenant_id)::int AS n
  FROM public.erp_stores
  WHERE nullif(btrim(tenant_id), '') IS NOT NULL
    AND nullif(btrim(store_code), '') IS NOT NULL
  GROUP BY lower(btrim(store_code))
  HAVING count(DISTINCT tenant_id) > 1

  UNION ALL
  SELECT 'payroll_store_ambiguous',
         coalesce(p.store, ''),
         (
           SELECT count(DISTINCT es.tenant_id)::int
           FROM public.erp_stores es
           WHERE nullif(btrim(es.tenant_id), '') IS NOT NULL
             AND (
               lower(btrim(es.store_code)) = lower(btrim(p.store))
               OR lower(btrim(coalesce(es.display_name, ''))) = lower(btrim(p.store))
             )
         )
  FROM public.payroll_records p
  WHERE coalesce(btrim(p.tenant_id), '') IN ('', 'default')
    AND (
      SELECT count(DISTINCT es.tenant_id)
      FROM public.erp_stores es
      WHERE nullif(btrim(es.tenant_id), '') IS NOT NULL
        AND (
          lower(btrim(es.store_code)) = lower(btrim(p.store))
          OR lower(btrim(coalesce(es.display_name, ''))) = lower(btrim(p.store))
        )
    ) > 1

  UNION ALL
  SELECT 'schedule_store_ambiguous',
         coalesce(s.store_name, ''),
         (
           SELECT count(DISTINCT es.tenant_id)::int
           FROM public.erp_stores es
           WHERE nullif(btrim(es.tenant_id), '') IS NOT NULL
             AND (
               lower(btrim(es.store_code)) = lower(btrim(s.store_name))
               OR lower(btrim(coalesce(es.display_name, ''))) = lower(btrim(s.store_name))
             )
         )
  FROM public.schedules s
  WHERE coalesce(btrim(s.tenant_id), '') IN ('', 'default')
    AND (
      SELECT count(DISTINCT es.tenant_id)
      FROM public.erp_stores es
      WHERE nullif(btrim(es.tenant_id), '') IS NOT NULL
        AND (
          lower(btrim(es.store_code)) = lower(btrim(s.store_name))
          OR lower(btrim(coalesce(es.display_name, ''))) = lower(btrim(s.store_name))
        )
    ) > 1

  UNION ALL
  SELECT 'payroll_dup',
         p.month || '|' || coalesce(p.store, '') || '|' || coalesce(p.name, ''),
         count(*)::int
  FROM public.payroll_records p
  GROUP BY p.month, p.store, p.name
  HAVING count(*) > 1

  UNION ALL
  SELECT 'schedule_dup',
         s.schedule_date::text || '|' || coalesce(s.store_name, '') || '|' || coalesce(s.name, ''),
         count(*)::int
  FROM public.schedules s
  GROUP BY s.schedule_date, s.store_name, s.name
  HAVING count(*) > 1

  UNION ALL
  SELECT 'member_no_dup',
         coalesce(m.tenant_id, '') || '|' || m.member_no,
         count(*)::int
  FROM public.members m
  WHERE m.member_no IS NOT NULL
    AND btrim(m.member_no) <> ''
  GROUP BY coalesce(m.tenant_id, ''), m.member_no
  HAVING count(*) > 1
) q
ORDER BY check_name, detail;
