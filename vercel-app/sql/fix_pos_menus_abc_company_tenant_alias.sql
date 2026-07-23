-- 메뉴가 깜빡이다 사라질 때: tenant 불일치 확인·정리
-- ABC Company 실제 id = malatang01 / 잘못된 슬러그 = abc-company

-- 1) 현재 메뉴 tenant 분포
SELECT coalesce(nullif(trim(tenant_id), ''), '(null)') AS tenant_id, count(*) AS n
FROM public.pos_menus
GROUP BY 1
ORDER BY n DESC;

-- 2) BC001 상태
SELECT id, code, name, tenant_id, is_active
FROM public.pos_menus
WHERE lower(trim(code)) = 'bc001';

-- 3) 잘못된 슬러그·null → 실제 ABC tenant 로 통일
UPDATE public.pos_menus
SET tenant_id = 'malatang01'
WHERE lower(trim(coalesce(tenant_id, ''))) IN ('', 'abc-company');

-- 4) 확인
SELECT id, code, name, tenant_id, is_active
FROM public.pos_menus
ORDER BY id;
