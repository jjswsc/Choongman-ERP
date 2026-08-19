-- 1/2 Partner/admin 계정 확인 (회사·비번 길이)
-- ⚠️ Omni Supabase에서만 실행. 충만 DB 금지.

SELECT
  id,
  company,
  store,
  name,
  role,
  length(coalesce(password, '')) AS pw_len,
  left(coalesce(password, ''), 7) AS pw_head
FROM public.employees
WHERE trim(store) = 'Partner'
  AND trim(name) = 'admin';
