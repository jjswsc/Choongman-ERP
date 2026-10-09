-- 인플루언서 명부 4/5: 기존 업로드 기록 → 명부 묶음 미리보기 (조회만, 변경 없음)
-- 묶는 기준: TikTok 핸들 → 없으면 실명+전화 → 없으면 SNS 이름
-- marketing_* 테이블만 대상이라 pos_orders Realtime·자동인쇄와 무관

WITH src AS (
  SELECT
    i.id,
    coalesce(i.tenant_id, '') AS tid,
    lower(coalesce(substring(i.platform_links->>'tiktok' FROM '@([A-Za-z0-9._]+)'), '')) AS tt,
    lower(trim(coalesce(i.contact_name, ''))) AS cn,
    regexp_replace(coalesce(i.contact_phone, ''), '\D', '', 'g') AS ph,
    lower(trim(coalesce(i.name, ''))) AS nm
  FROM public.marketing_influencers i
  WHERE i.profile_id IS NULL
),
keyed AS (
  SELECT
    *,
    CASE
      WHEN tt <> '' THEN 'tt:' || tt
      WHEN cn <> '' OR ph <> '' THEN 'cp:' || cn || '|' || ph
      ELSE 'nm:' || nm
    END AS gkey
  FROM src
)
SELECT
  tid AS tenant_id,
  gkey,
  count(*) AS upload_rows,
  array_agg(id ORDER BY id) AS influencer_ids
FROM keyed
GROUP BY tid, gkey
ORDER BY upload_rows DESC, gkey;
