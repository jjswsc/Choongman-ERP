-- 1/2 조회 — CW Tower 협업 할인(The Street) POS 노출 조건 점검
-- 이것만 복사 → Run. UPDATE 없음.
-- 기대: status=ongoing, collab_management=true, branches에 The Street,
--       collab_detail.posDiscountType=percent|amount, posDiscountValue > 0
-- 2026-10-22: posDiscountValue=0 이면 POS 목록에 안 나옴 (getPosCollabCampaigns)

SELECT
  id,
  campaign_no,
  topic,
  status,
  start_date,
  end_date,
  collab_management,
  branches,
  collab_detail ->> 'posDiscountType' AS pos_discount_type,
  (collab_detail ->> 'posDiscountValue')::numeric AS pos_discount_value,
  collab_detail ->> 'partnerName' AS partner_name,
  CASE
    WHEN collab_management IS NOT TRUE THEN 'fail: collab_management off'
    WHEN status IS DISTINCT FROM 'ongoing' THEN 'fail: status not ongoing'
    WHEN COALESCE((collab_detail ->> 'posDiscountValue')::numeric, 0) <= 0 THEN 'fail: POS discount value is 0'
    WHEN COALESCE(collab_detail ->> 'posDiscountType', '') NOT IN ('percent', 'amount') THEN 'fail: POS discount type unset'
    ELSE 'ok: would show on POS (store match separate)'
  END AS pos_visibility_check
FROM marketing_campaigns
WHERE topic ILIKE '%CW%'
   OR topic ILIKE '%พนักงานตึก%CW%'
   OR (collab_detail ->> 'partnerName') ILIKE '%CW%'
ORDER BY id;
