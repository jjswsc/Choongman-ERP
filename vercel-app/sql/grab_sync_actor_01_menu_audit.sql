-- 오늘 10:20~11:00(방콕) 메뉴 저장자
-- Grab 동기화 직전 ERP에서 메뉴를 저장했는지 확인

select
  changed_at at time zone 'Asia/Bangkok' as changed_at_bkk,
  changed_by,
  changed_by_role,
  changed_by_store,
  changed_by_employee_code,
  menu_id,
  menu_code,
  action_type,
  change_source,
  reason
from public.pos_menu_audit_logs
where changed_at >= timestamptz '2026-09-21 10:20:00+07'
  and changed_at <  timestamptz '2026-09-21 11:00:00+07'
order by changed_at;
