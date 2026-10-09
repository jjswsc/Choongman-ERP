-- 1/6 품목 마스터 — Ottogi Mayonese 3.2 kg / pack
-- 엑셀 요청: 잘못 발행한 이 품목을 인보이스에서 빼 달라. 아직 삭제하지 않음.
-- SELECT만. 이것만 복사 → Run.

SELECT
  i.id,
  i.code,
  i.name,
  i.spec,
  i.price,
  i.cost,
  i.vendor,
  i.tax,
  i.category
FROM public.items i
WHERE (
     i.name ILIKE '%mayo%'
     OR i.name ILIKE '%mayone%'
     OR i.name ILIKE '%mayonnaise%'
     OR i.spec ILIKE '%mayo%'
   )
   AND (
     i.name ILIKE '%ottogi%'
     OR i.name ILIKE '%3.2%'
     OR i.spec ILIKE '%3.2%'
   )
ORDER BY i.code, i.id;
