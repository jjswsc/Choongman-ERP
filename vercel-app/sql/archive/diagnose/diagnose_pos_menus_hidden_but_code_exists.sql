-- 진단: 메뉴가 UI에 안 보이는데 코드(BC001 등)는 중복으로 막히는 경우
-- Supabase SQL Editor에서 실행 (방콕 기준 어제~오늘 테스트 메뉴 확인)

-- 1) BC001 / BC* 및 최근 메뉴 — tenant_id·활성 여부
SELECT
  id,
  code,
  name,
  category_main,
  category,
  tenant_id,
  is_active,
  sold_out_date,
  created_at
FROM public.pos_menus
WHERE lower(trim(code)) = 'bc001'
   OR lower(trim(code)) LIKE 'bc%'
   OR created_at >= ((timezone('Asia/Bangkok', now())::date - 2) AT TIME ZONE 'Asia/Bangkok')
ORDER BY created_at DESC NULLS LAST, id DESC
LIMIT 200;

-- 2) tenant_id 비어 있는 메뉴 (Omni 목록에서 빠지기 쉬움)
SELECT id, code, name, tenant_id, is_active, created_at
FROM public.pos_menus
WHERE coalesce(trim(tenant_id), '') = ''
ORDER BY id DESC
LIMIT 200;

-- 3) 매장 노출 스코프 (관리자 목록과 무관 — POS용)
SELECT
  m.id,
  m.code,
  m.name,
  m.tenant_id,
  count(s.menu_id) FILTER (WHERE coalesce(s.enabled, true)) AS scope_cnt,
  coalesce(
    array_agg(s.store_code) FILTER (WHERE coalesce(s.enabled, true)),
    '{}'
  ) AS store_codes
FROM public.pos_menus m
LEFT JOIN public.pos_menu_store_scopes s ON s.menu_id = m.id
WHERE lower(trim(m.code)) = 'bc001'
   OR lower(trim(m.code)) LIKE 'bc%'
   OR m.created_at >= ((timezone('Asia/Bangkok', now())::date - 2) AT TIME ZONE 'Asia/Bangkok')
GROUP BY m.id, m.code, m.name, m.tenant_id
ORDER BY m.id DESC;

-- 4) 코드 unique 인덱스 (전역 vs 테넌트)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'pos_menus'
  AND indexname ILIKE '%code%';
