-- C010 Soy Sauce Chicken: 메뉴 저장 감사 (누가, 매장 체크를 어떻게 저장했는지)
-- 테이블 없으면 이 조회는 실패합니다. 그때는 05번만 실행하세요.
-- 로직: app/api/savePosMenu/route.ts writePosMenuAuditTrail

select
  timezone('Asia/Bangkok', l.changed_at) as changed_at_bkk,
  l.changed_by,
  l.changed_by_role,
  l.changed_by_store,
  l.change_source,
  l.reason,
  l.detail_json ->> 'requestIncludesStoreCodes' as request_had_store_codes,
  l.before_json -> 'storeCodes' as before_stores,
  l.after_json -> 'storeCodes' as after_stores,
  l.detail_json -> 'requestStoreCodes' as request_stores
from public.pos_menu_audit_logs l
where l.menu_id = 25
   or upper(trim(coalesce(l.menu_code, ''))) = 'C010'
order by l.changed_at desc
limit 30;
