-- 인플루언서 명부 4/5: 기존 업로드 기록 → 명부 묶음 미리보기 (조회만, 변경 없음)
-- 묶는 기준: TikTok 핸들 → SNS 이름이 다른 기록의 TikTok 핸들과 같으면 그 핸들 → 실명+전화 → SNS 이름
-- marketing_* 테이블만 대상이라 pos_orders Realtime·자동인쇄와 무관
-- marketing_influencers.tenant_id 는 DB에 따라 없을 수 있어 to_jsonb(i)->>'tenant_id' 로 읽음

WITH src AS (
  SELECT
    i.id,
    coalesce(to_jsonb(i)->>'tenant_id', '') AS tid,
    lower(coalesce(substring(i.platform_links->>'tiktok' FROM '@([A-Za-z0-9._]+)'), '')) AS tt,
    lower(trim(coalesce(i.contact_name, ''))) AS cn,
    regexp_replace(coalesce(i.contact_phone, ''), '\D', '', 'g') AS ph,
    lower(ltrim(trim(coalesce(i.name, '')), '@')) AS nm
  FROM public.marketing_influencers i
  WHERE i.profile_id IS NULL
),
handles AS (
  SELECT DISTINCT tid, tt FROM src WHERE tt <> ''
),
keyed AS (
  SELECT
    s.*,
    CASE
      WHEN s.tt <> '' THEN 'tt:' || s.tt
      WHEN EXISTS (SELECT 1 FROM handles h WHERE h.tid = s.tid AND h.tt = s.nm) THEN 'tt:' || s.nm
      WHEN s.cn <> '' OR s.ph <> '' THEN 'cp:' || s.cn || '|' || s.ph
      ELSE 'nm:' || s.nm
    END AS gkey
  FROM src s
)
SELECT
  tid AS tenant_id,
  gkey,
  count(*) AS upload_rows,
  array_agg(id ORDER BY id) AS influencer_ids
FROM keyed
GROUP BY tid, gkey
ORDER BY upload_rows DESC, gkey;
