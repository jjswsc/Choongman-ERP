-- 검증만 (UPDATE 없음)
-- 01 미리보기에서 나온 copy/src id 상태가 풀렸는지 확인

SELECT
  copy.id AS copy_item_id,
  copy.status AS copy_status,
  copy.finished_at AS copy_finished_at,
  cp.status AS copy_plan_status,
  cp.employee_name AS copy_employee_name,
  src.id AS src_item_id,
  src.status AS src_status,
  src.delegated_to_name,
  sp.employee_name AS src_employee_name,
  sp.status AS src_plan_status,
  left(copy.title, 60) AS title
FROM public.daily_plan_items copy
JOIN public.daily_plans cp ON cp.id = copy.plan_id
LEFT JOIN public.daily_plan_items src ON src.id = copy.delegated_from_item_id
LEFT JOIN public.daily_plans sp ON sp.id = src.plan_id
WHERE copy.id IN (6979, 6938, 7057)
ORDER BY copy.id;
