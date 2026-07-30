-- QR 뷔페 티어 「포함 메뉴」후보 플래그
-- 메뉴 관리에서 체크 → QR 테이블오더 티어 포함 목록에만 노출

alter table if exists public.pos_menus
  add column if not exists buffet_includable boolean not null default false;

comment on column public.pos_menus.buffet_includable is
  'QR buffet: true면 티어 포함 메뉴 후보. 손님 앱 0원 포함은 pos_buffet_tier_menus 연결로 확정';

-- 이미 티어에 연결된 메뉴는 후보로 승격(기존 Omni 파일럿 데이터 유지)
update public.pos_menus m
set buffet_includable = true
where coalesce(m.buffet_includable, false) = false
  and exists (
    select 1
    from public.pos_buffet_tier_menus tm
    where tm.menu_id = m.id
  );
