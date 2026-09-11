-- Omni: 충만 시드(Jidubang / S&J)를 쓰는 품목 확인
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 충만 레거시 DB에는 실행하지 마세요.

SELECT
  i.tenant_id,
  i.code,
  i.name,
  i.outbound_location
FROM public.items i
WHERE lower(trim(coalesce(i.outbound_location, ''))) IN ('jidubang', 's&j', '창고')
ORDER BY i.tenant_id NULLS FIRST, i.code, i.id;
