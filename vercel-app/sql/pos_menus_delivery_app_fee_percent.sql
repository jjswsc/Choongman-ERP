-- 원가 계산기: 메뉴별 배달앱 수수료(%) 저장 (Grab 25%, LineMan 30% 등)
-- NULL = 앱 기본값(25%) 사용. 0 = 수수료 없음.

ALTER TABLE public.pos_menus
  ADD COLUMN IF NOT EXISTS delivery_app_fee_percent NUMERIC(5, 2);

COMMENT ON COLUMN public.pos_menus.delivery_app_fee_percent IS
  '원가 분석용 배달앱 수수료(%). NULL이면 UI 기본 25%. 0 허용.';
