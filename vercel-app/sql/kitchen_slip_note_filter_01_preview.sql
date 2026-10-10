-- 주방 주문서에서 메뉴별 메모가 빠질 수 있는 매장 (조회 전용)
-- show_line_notes=false 이거나, 옵션 그룹 인쇄 중 하나라도 꺼진(false) 매장
SELECT
  store_code,
  kitchen_slip_show_line_notes,
  kitchen_slip_option_group_print,
  (
    SELECT string_agg(k, ', ' ORDER BY k)
    FROM jsonb_each(COALESCE(kitchen_slip_option_group_print::jsonb, '{}'::jsonb)) AS e(k, v)
    WHERE v = 'false'::jsonb
  ) AS groups_off
FROM public.pos_printer_settings
WHERE kitchen_slip_show_line_notes = false
   OR EXISTS (
     SELECT 1
     FROM jsonb_each(COALESCE(kitchen_slip_option_group_print::jsonb, '{}'::jsonb)) AS e(k, v)
     WHERE v = 'false'::jsonb
   )
ORDER BY store_code;
