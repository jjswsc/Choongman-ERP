-- 인플루언서 명부 5/5: 기존 업로드 기록으로 명부 생성 + profile_id 채우기 (DO 블록 1개 = 한 번에 Run, 실패 시 전체 롤백)
-- 04 미리보기로 묶음 확인 후 실행. 재실행해도 profile_id 가 비어 있는 행만 처리
-- marketing_* 테이블만 대상이라 pos_orders Realtime·자동인쇄와 무관
-- Supabase SQL Editor 는 문장 사이에 임시 테이블이 유지되지 않을 수 있어 TEMP TABLE 없이 한 블록으로 처리

DO $$
DECLARE
  r record;
  pid bigint;
  handle text;
BEGIN
  FOR r IN
    WITH src AS (
      SELECT
        i.id,
        coalesce(to_jsonb(i)->>'tenant_id', '') AS tid,
        lower(coalesce(substring(i.platform_links->>'tiktok' FROM '@([A-Za-z0-9._]+)'), '')) AS tt,
        lower(coalesce(substring(i.platform_links->>'instagram' FROM 'instagram\.com/([A-Za-z0-9._]+)'), '')) AS ig,
        lower(trim(coalesce(i.contact_name, ''))) AS cn,
        regexp_replace(coalesce(i.contact_phone, ''), '\D', '', 'g') AS ph,
        lower(ltrim(trim(coalesce(i.name, '')), '@')) AS nm,
        i.name,
        i.contact_name,
        i.contact_phone,
        i.platform_links,
        i.branch_review,
        i.publish_date,
        i.shooting_date
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
    ),
    grouped AS (
      SELECT tid, gkey, array_agg(id) AS ids FROM keyed GROUP BY tid, gkey
    ),
    rep AS (
      SELECT DISTINCT ON (tid, gkey) *
      FROM keyed
      ORDER BY tid, gkey, (tt <> '') DESC, publish_date DESC NULLS LAST, shooting_date DESC NULLS LAST, id DESC
    )
    SELECT rep.*, grouped.ids
    FROM rep
    JOIN grouped USING (tid, gkey)
  LOOP
    handle := CASE WHEN r.gkey LIKE 'tt:%' THEN substring(r.gkey FROM 4) ELSE '' END;
    pid := NULL;

    IF handle <> '' THEN
      SELECT p.id INTO pid
      FROM public.marketing_influencer_profiles p
      WHERE coalesce(p.tenant_id, '') = r.tid AND lower(p.tiktok_handle) = handle
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
        handle,
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
    WHERE i.id = ANY (r.ids);
  END LOOP;
END $$;
