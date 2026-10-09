-- 인플루언서 명부 5/5: 기존 업로드 기록으로 명부 생성 + profile_id 채우기 (한 트랜잭션, 이 블록 전체를 한 번에 Run)
-- 04 미리보기로 묶음 확인 후 실행. 재실행해도 profile_id 가 비어 있는 행만 처리
-- marketing_* 테이블만 대상이라 pos_orders Realtime·자동인쇄와 무관
-- marketing_influencers.tenant_id 는 DB에 따라 없을 수 있어 to_jsonb(i)->>'tenant_id' 로 읽음

BEGIN;

CREATE TEMP TABLE _inf_profile_bf ON COMMIT DROP AS
WITH src AS (
  SELECT
    i.id,
    coalesce(to_jsonb(i)->>'tenant_id', '') AS tid,
    lower(coalesce(substring(i.platform_links->>'tiktok' FROM '@([A-Za-z0-9._]+)'), '')) AS tt,
    lower(coalesce(substring(i.platform_links->>'instagram' FROM 'instagram\.com/([A-Za-z0-9._]+)'), '')) AS ig,
    lower(trim(coalesce(i.contact_name, ''))) AS cn,
    regexp_replace(coalesce(i.contact_phone, ''), '\D', '', 'g') AS ph,
    lower(trim(coalesce(i.name, ''))) AS nm,
    i.name,
    i.contact_name,
    i.contact_phone,
    i.platform_links,
    i.branch_review,
    i.publish_date,
    i.shooting_date
  FROM public.marketing_influencers i
  WHERE i.profile_id IS NULL
)
SELECT
  *,
  CASE
    WHEN tt <> '' THEN 'tt:' || tt
    WHEN cn <> '' OR ph <> '' THEN 'cp:' || cn || '|' || ph
    ELSE 'nm:' || nm
  END AS gkey
FROM src;

DO $$
DECLARE
  r record;
  pid bigint;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (tid, gkey) *
    FROM _inf_profile_bf
    ORDER BY tid, gkey, publish_date DESC NULLS LAST, shooting_date DESC NULLS LAST, id DESC
  LOOP
    pid := NULL;
    IF r.tt <> '' THEN
      SELECT p.id INTO pid
      FROM public.marketing_influencer_profiles p
      WHERE coalesce(p.tenant_id, '') = r.tid AND lower(p.tiktok_handle) = r.tt
      LIMIT 1;
    END IF;

    IF pid IS NULL THEN
      INSERT INTO public.marketing_influencer_profiles (
        tenant_id, display_name, tiktok_url, tiktok_handle, instagram_url, instagram_handle,
        facebook_url, contact_name, contact_phone, preferred_store, pipeline_status, created_by
      ) VALUES (
        nullif(r.tid, ''),
        coalesce(nullif(trim(r.name), ''), nullif(trim(r.contact_name), ''), ''),
        coalesce(r.platform_links->>'tiktok', ''),
        r.tt,
        coalesce(r.platform_links->>'instagram', ''),
        r.ig,
        coalesce(r.platform_links->>'facebook', ''),
        coalesce(r.contact_name, ''),
        coalesce(r.contact_phone, ''),
        coalesce(r.branch_review, ''),
        'hired',
        'backfill'
      )
      RETURNING id INTO pid;
    END IF;

    UPDATE public.marketing_influencers i
    SET profile_id = pid
    WHERE i.id IN (SELECT b.id FROM _inf_profile_bf b WHERE b.tid = r.tid AND b.gkey = r.gkey);
  END LOOP;
END $$;

COMMIT;
