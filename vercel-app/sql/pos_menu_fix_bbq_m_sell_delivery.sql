-- Bar.B.Q (C020~C023) 'M - ...' 옵션이 배달 화면에서 사라지는 문제 (2026-06-07)
--
-- 증상: 테이블/포장에서는 BBQ에 M(269฿)이 보이는데, 배달에서만 사이드(Kimchi/Pickled)만
--       보이고 M이 없다. → 2단계(M 선택 → 사이드) picker 가 아예 안 켜진다.
-- 원인: 배달 화면은 sell_delivery=false 인 옵션을 목록에서 제외한다(app/pos/order/page.tsx).
--       BBQ 의 'M - Boneless' 옵션만 sell_delivery=false 라 배달에서 빠지고,
--       그 결과 hasBarBqMNamed 가 false → 2단계 picker 가 꺼져 사이드만 남는다.
--       (일반 치킨 C003 등의 M 옵션은 sell_delivery=true 라 배달에서 정상)
-- 조치: BBQ M-named substitution 옵션의 sell_delivery 를 true 로 켠다. (데이터 삭제 없음)

-- ─────────────────────────────────────────────────────────────
-- 0) 적용 전 확인 — BBQ 옵션의 판매 채널 플래그
-- ─────────────────────────────────────────────────────────────
select m.code, m.name as menu_name, o.name as option_name,
       o.sell_hall, o.sell_delivery, o.sell_packaging
from public.pos_menu_options o
join public.pos_menus m on m.id = o.menu_id
where m.code in ('C020', 'C021', 'C022', 'C023')
order by m.code, o.name;

-- ─────────────────────────────────────────────────────────────
-- 1) BBQ 'M - ...' 옵션 배달 판매 켜기 (꺼져 있던 것만)
-- ─────────────────────────────────────────────────────────────
update public.pos_menu_options o
set sell_delivery = true
from public.pos_menus m
where o.menu_id = m.id
  and m.code in ('C020', 'C021', 'C022', 'C023')
  and coalesce(o.option_type, 'substitution') = 'substitution'
  and trim(coalesce(o.name, '')) ~* '^\s*m\s*[-–—]'   -- 'M - ...' 옵션만
  and coalesce(o.sell_delivery, true) = false;

-- ─────────────────────────────────────────────────────────────
-- 2) 적용 후 재확인 — 모두 sell_delivery=true 여야 한다
-- ─────────────────────────────────────────────────────────────
select m.code, m.name as menu_name, o.name as option_name,
       o.sell_hall, o.sell_delivery, o.sell_packaging
from public.pos_menu_options o
join public.pos_menus m on m.id = o.menu_id
where m.code in ('C020', 'C021', 'C022', 'C023')
order by m.code, o.name;
