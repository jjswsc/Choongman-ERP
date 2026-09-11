-- Omni: 품목이 쓰지 않는 충만 시드 출고지(Jidubang / S&J / 창고)만 삭제
-- 적용: 02에서 사용 품목이 0건인지 확인한 뒤, Omni SQL Editor → 이 파일만 복사 → Run
-- 충만 레거시 DB에는 실행하지 마세요.

DELETE FROM public.warehouse_locations w
WHERE lower(trim(coalesce(w.location_code, w.name, ''))) IN ('jidubang', 's&j', '창고')
  AND NOT EXISTS (
    SELECT 1
    FROM public.items i
    WHERE lower(trim(coalesce(i.outbound_location, '')))
      = lower(trim(coalesce(w.location_code, w.name, '')))
  );
