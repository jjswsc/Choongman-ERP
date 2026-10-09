-- 갈릭 Bar.B.Q 메뉴 저장 감사 (누가, 언제, 활성/배달/매장체크를 바꿨는지)
-- 금요일(2026-09-18) 이후. 테이블 없으면 이 조회는 실패합니다.
-- 로직: app/api/savePosMenu/route.ts writePosMenuAuditTrail
-- 주의: 당일 품절 토글(updatePosMenuSoldOut)은 감사 로그가 없음

select
  timezone('Asia/Bangkok', l.changed_at) as changed_at_bkk,
  l.menu_id,
  l.menu_code,
  l.changed_by,
  l.changed_by_role,
  l.changed_by_store,
  l.changed_by_employee_code,
  l.change_source,
  l.reason,
  l.changed_fields_json,
  l.before_json ->> 'is_active' as before_is_active,
  l.after_json ->> 'is_active' as after_is_active,
  l.before_json ->> 'sell_delivery' as before_sell_delivery,
  l.after_json ->> 'sell_delivery' as after_sell_delivery
from public.pos_menu_audit_logs l
where l.changed_at >= timestamptz '2026-09-18 00:00:00+07'
  and (
    upper(btrim(coalesce(l.menu_code, ''))) in ('C020', 'C021', 'C022', 'C023')
    or l.menu_id in (
      select pm.id
      from public.pos_menus pm
      where upper(btrim(coalesce(pm.code, ''))) in ('C020', 'C021', 'C022', 'C023')
         or lower(pm.name) like '%garlic%bar.b.q%'
    )
  )
order by l.changed_at desc
limit 50;
