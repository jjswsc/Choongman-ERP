-- LINE 셸(전화 없음) + identity active + members inactive
-- → 전화+생일 연결 시 "บัญชีสมาชิกถูกระงับ" 발생 후보를 active로 복구
-- 방콕시간 기준 updated_at
--
-- 대상: M005950(Bee)와 동일 패턴
--  - members.status = inactive
--  - phone 비어 있음
--  - member_identities.provider = line AND identity status = active
--
-- 1) 먼저 SELECT로 확인 → 2) UPDATE 실행

-- ── 1) 대상 미리보기 ──────────────────────────────────────────
SELECT
  m.id,
  m.member_no,
  m.name,
  m.phone,
  m.status,
  m.source,
  m.line_display_name,
  m.updated_at,
  i.display_name AS line_identity_name,
  i.status AS identity_status
FROM members m
JOIN member_identities i
  ON i.member_id = m.id
 AND i.provider = 'line'
 AND i.status = 'active'
WHERE m.status = 'inactive'
  AND (m.phone IS NULL OR btrim(m.phone) = '')
ORDER BY m.updated_at DESC NULLS LAST, m.id DESC;

-- ── 2) 일괄 복구 (미리보기 확인 후 실행) ──────────────────────
WITH targets AS (
  SELECT DISTINCT m.id
  FROM members m
  JOIN member_identities i
    ON i.member_id = m.id
   AND i.provider = 'line'
   AND i.status = 'active'
  WHERE m.status = 'inactive'
    AND (m.phone IS NULL OR btrim(m.phone) = '')
)
UPDATE members m
SET
  status = 'active',
  updated_at = (now() AT TIME ZONE 'Asia/Bangkok')::timestamp
FROM targets t
WHERE m.id = t.id
RETURNING
  m.id,
  m.member_no,
  m.name,
  m.line_display_name,
  m.status,
  m.updated_at;

-- ── 3) 잔여 확인 (0건이어야 함) ───────────────────────────────
SELECT count(*) AS remaining_inactive_line_shells
FROM members m
JOIN member_identities i
  ON i.member_id = m.id
 AND i.provider = 'line'
 AND i.status = 'active'
WHERE m.status = 'inactive'
  AND (m.phone IS NULL OR btrim(m.phone) = '');
