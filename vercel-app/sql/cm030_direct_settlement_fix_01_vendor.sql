-- 1/3 Siam Food Services(1065) 직접정산 체크 해제 — 9/25경 실수로 켜짐
-- 영향 품목: CM030 Mozzarella, SS009 Mission Tortillas (출고 금액 0 표시·수령 시 본사 출고 로그 미생성)
-- 권장: 관리자 > 거래처 관리 화면에서 체크 해제(서버 직접정산 캐시가 비워짐).
-- 이 SQL로 끄면 서버 캐시가 안 비워져 일부 서버는 재시작 전까지 계속 0으로 처리할 수 있다.
-- vendors 1행만 변경 — pos_orders 미변경, 영업 중 실행 가능.

BEGIN;

UPDATE public.vendors
SET direct_settlement = false
WHERE btrim(code) = '1065'
RETURNING code, name, direct_settlement;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('cm030_direct_settlement_fix_01_vendor.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;

COMMIT;
