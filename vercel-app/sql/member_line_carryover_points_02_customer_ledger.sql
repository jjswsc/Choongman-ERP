-- LINE 이월 포인트 소실 — 2/6 컴플레인 회원 M011143 포인트 원장 전체
-- 조회 전용
SELECT id, kind, points, amount, order_id, note, created_at
FROM public.member_points_ledger
WHERE member_id = 11143
ORDER BY created_at, id;
