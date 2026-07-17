-- ERP 회원·포인트 변동 추출 (방콕시간 기준)
-- 기준: 2026-07-16 00:00 이후
-- 용도: LINE Official 전체 Customer report 반영 전, ERP 전용 신규·적립분을 대조·합산
--
-- Supabase SQL Editor에서 ① → ② → ③ 순으로 실행 후 결과를 CSV로 보관하세요.

-- ① 7/16 이후 ERP에 새로 생긴 회원
SELECT
  m.id,
  m.member_no,
  m.name,
  m.full_name,
  m.phone,
  m.birth_date,
  m.tier_code,
  m.point_balance,
  m.status,
  m.source,
  m.join_channel,
  m.created_at
FROM public.members m
WHERE m.created_at >= TIMESTAMP '2026-07-16 00:00:00'
ORDER BY m.created_at ASC, m.id ASC;

-- ② 7/16 이후 포인트 원장 변동 (LINE CRM import 원장 제외 = ERP/POS 쪽)
SELECT
  m.id AS member_id,
  m.member_no,
  m.name,
  m.phone,
  m.point_balance AS erp_point_balance_now,
  l.kind,
  l.points,
  l.order_id,
  l.note,
  l.created_at AS ledger_at
FROM public.member_points_ledger l
JOIN public.members m ON m.id = l.member_id
WHERE l.created_at >= TIMESTAMP '2026-07-16 00:00:00'
  AND COALESCE(l.note, '') NOT ILIKE 'LINE CRM import%'
ORDER BY l.created_at ASC, l.id ASC;

-- ③ 합산표 (파일에 더할 때 쓰기 좋은 1행=1회원)
-- erp_points_delta_since_0716: 7/16 이후 ERP/POS 원장 순증감
-- is_new_since_0716: 7/16 이후 신규 회원 여부
SELECT
  m.id,
  m.member_no,
  m.name,
  m.full_name,
  m.phone,
  m.birth_date,
  m.tier_code,
  m.point_balance AS erp_point_balance_now,
  m.status,
  m.source,
  m.created_at,
  (m.created_at >= TIMESTAMP '2026-07-16 00:00:00') AS is_new_since_0716,
  COALESCE(d.erp_points_delta_since_0716, 0) AS erp_points_delta_since_0716
FROM public.members m
LEFT JOIN (
  SELECT
    l.member_id,
    SUM(l.points)::numeric AS erp_points_delta_since_0716
  FROM public.member_points_ledger l
  WHERE l.created_at >= TIMESTAMP '2026-07-16 00:00:00'
    AND COALESCE(l.note, '') NOT ILIKE 'LINE CRM import%'
  GROUP BY l.member_id
) d ON d.member_id = m.id
WHERE m.created_at >= TIMESTAMP '2026-07-16 00:00:00'
   OR COALESCE(d.erp_points_delta_since_0716, 0) <> 0
ORDER BY is_new_since_0716 DESC, m.created_at ASC, m.id ASC;
