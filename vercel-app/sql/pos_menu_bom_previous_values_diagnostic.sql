-- 예전 BOM(직접 입력값) 잔존 여부 점검
-- Supabase SQL Editor에서 실행. row_cnt > 0 이면 해당 백업/PITR 에 예전 행이 있음.

-- 1) reseed 직전 스냅샷 (T001~T003, K001~K003)
select 'cm_backup_reseed_tteok_dosirak_now' as src, menu_id, count(*) as row_cnt
from public.cm_backup_reseed_tteok_dosirak_now
group by menu_id
order by menu_id;

-- 2) 긴급 백업 (1,2,3 / 67,68,69)
select 'cm_backup_pos_menu_ing_123_676869_now' as src, menu_id, count(*) as row_cnt
from public.cm_backup_pos_menu_ing_123_676869_now
group by menu_id
order by menu_id;

-- 3) PITR/수동 복원용 임시 테이블 (있을 때만)
select 'restore_pos_menu_ingredients_from_pitr' as src, menu_id, count(*) as row_cnt
from public._restore_pos_menu_ingredients_from_pitr
group by menu_id
order by menu_id;

select 'restore_dosirak_bom_from_pitr' as src, menu_id, count(*) as row_cnt
from public._restore_dosirak_bom_from_pitr
group by menu_id
order by menu_id;

select 'backup_20260531_dosirak_bom' as src, menu_id, count(*) as row_cnt
from public._backup_20260531_dosirak_bom_before_restore
group by menu_id
order by menu_id;

-- 4) 수정 이력 (감사 테이블 배포 후 저장·수정분만)
select menu_code, count(*) as audit_rows, min(changed_at) as first_at, max(changed_at) as last_at
from public.pos_menu_ingredients_audit
where upper(trim(coalesce(menu_code, ''))) in (
  'T001','T002','T003','K001','K002','K003','K022','K031','K032'
)
group by menu_code
order by menu_code;

-- 5) 현재 운영 BOM (비교용)
select m.code, m.id, count(i.id) as bom_cnt
from public.pos_menus m
left join public.pos_menu_ingredients i on i.menu_id = m.id and (i.option_id is null or i.option_id = 0)
where m.id in (1, 2, 3, 67, 68, 69, 311, 385, 386)
group by m.code, m.id
order by m.code;
