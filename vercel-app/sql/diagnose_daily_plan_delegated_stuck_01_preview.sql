-- 미리보기만 (UPDATE 없음)
-- 위임 사본이 아직 todo/doing 인데 일정표가 마감됐거나, 원본이 delegated 에 멈춰
-- 매니저 ยืนยันเสร็จ 가 안 뜨는 건을 찾는다.
-- 대상 예: 2026-11-09 CM Ekkamai · Saeng · Surangkhana 위임

SELECT
  copy.id AS copy_item_id,
  copy.status AS copy_status,
  copy.started_at AS copy_started_at,
  copy.finished_at AS copy_finished_at,
  copy.delegated_from_item_id,
  copy.delegated_by_name,
  left(copy.title, 80) AS title,
  cp.id AS copy_plan_id,
  cp.plan_date,
  cp.employee_id AS copy_employee_id,
  cp.employee_name AS copy_employee_name,
  cp.store_name AS copy_store,
  cp.status AS copy_plan_status,
  src.id AS src_item_id,
  src.status AS src_status,
  src.delegated_to_employee_id,
  src.delegated_to_name,
  sp.id AS src_plan_id,
  sp.employee_name AS src_employee_name,
  sp.status AS src_plan_status
FROM public.daily_plan_items copy
JOIN public.daily_plans cp ON cp.id = copy.plan_id
LEFT JOIN public.daily_plan_items src ON src.id = copy.delegated_from_item_id
LEFT JOIN public.daily_plans sp ON sp.id = src.plan_id
WHERE copy.delegated_from_item_id IS NOT NULL
  AND copy.status IN ('todo', 'doing')
  AND cp.plan_date = '2026-11-09'
  AND (
    cp.employee_name ILIKE '%Saeng%'
    OR src.delegated_to_name ILIKE '%Saeng%'
    OR cp.store_name ILIKE '%Ekkamai%'
    OR copy.title ILIKE '%ต้อนรับ%'
  )
ORDER BY cp.employee_name, copy.id;
