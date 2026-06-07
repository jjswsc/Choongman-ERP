-- Bar.B.Q (C020~C023) option_selection_groups 의 잘못된 그룹키 'm' 제거
-- 증상: POS 옵션 모달에 "옵션 단계 설정이 맞지 않아 일반 옵션 목록으로 표시합니다." 경고 배너.
-- 원인: 그룹키가 ["m","sidedish"] 로 저장됨. 'm' 은 유효 단계키(size/part/sidedish 등)가 아님.
-- 조치: 'm'(및 혹시 모를 size/part) 제거 → ["sidedish"]. DELETE 없음(데이터 삭제 안 함).
--
-- ※ 일반 치킨(C003/C004/C006/C010~C013)·SNOW(C007~C009)·Supreme(C002)·C005 는
--    코드 수정(isChickenSizeOnlyOptionName: S 전용)으로 정상화되므로 여기서 건드리지 않는다.

-- ─────────────────────────────────────────────────────────────
-- 0) 적용 전 확인
-- ─────────────────────────────────────────────────────────────
select m.code, m.name, m.option_selection_groups
from public.pos_menus m
where m.code in ('C020', 'C021', 'C022', 'C023')
order by m.code;

-- ─────────────────────────────────────────────────────────────
-- 1) option_selection_groups 에서 'm'/size/part 제거
-- ─────────────────────────────────────────────────────────────
update public.pos_menus m
set option_selection_groups = coalesce(
  (
    select jsonb_agg(to_jsonb(trim(e)))
    from jsonb_array_elements_text(coalesce(m.option_selection_groups, '[]'::jsonb)) e
    where lower(trim(e)) not in ('m', 'size', 'part')
  ),
  '[]'::jsonb
),
option_selection_config = coalesce(
  (
    select jsonb_agg(cfg)
    from jsonb_array_elements(coalesce(m.option_selection_config, '[]'::jsonb)) cfg
    where lower(trim(coalesce(cfg->>'key', ''))) not in ('m', 'size', 'part')
  ),
  '[]'::jsonb
)
where m.code in ('C020', 'C021', 'C022', 'C023');

-- ─────────────────────────────────────────────────────────────
-- 2) 적용 후 재확인
-- ─────────────────────────────────────────────────────────────
select m.code, m.name, m.option_selection_groups
from public.pos_menus m
where m.code in ('C020', 'C021', 'C022', 'C023')
order by m.code;
