-- 미리보기(변경 없음): Grab 품절 cron 오류 후보 — TEST / CM Office / CM Phuket 정책 건수
-- 방콕시간 기준 조회만. DELETE는 02·03 파일을 따로 Run.

SELECT
  store_code,
  COUNT(*) AS menu_rows,
  COUNT(*) FILTER (WHERE sold_out IS TRUE) AS sold_out_rows,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(COALESCE(sell_start_time, '')), '') IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(sell_end_time, '')), '') IS NOT NULL
  ) AS sell_window_rows
FROM public.pos_delivery_menu_policies
WHERE app_code = 'grab'
  AND store_code IN ('TEST', 'CM Office', 'CM Phuket', 'Office', 'CM TEST')
GROUP BY store_code
ORDER BY store_code;
