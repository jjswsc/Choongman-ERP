-- Omni 파일럿: QR 테이블오더 매장 enable 템플릿
-- 1) 먼저 pos_qr_table_order_buffet.sql 적용
-- 2) 아래 STORE_CODE 를 Omni 파일럿 매장 코드로 바꾼 뒤 실행
-- 3) 관리 화면(/admin/pos-qr-table-order)에서 티어·포함메뉴·QR 토큰 생성

-- 예: Omni 매장 코드가 'OMNI01' 인 경우
-- STORE_CODE 를 실제 코드로 교체하세요.

insert into public.pos_qr_order_store_settings (
  store_code,
  enabled,
  mode,
  entry_payment_mode,
  extras_payment_mode,
  require_staff_open,
  max_open_minutes,
  allow_reorder_after_paid,
  updated_at
) values (
  'OMNI01', -- << 파일럿 매장 코드
  true,
  'buffet',
  'guest_choice', -- 또는 postpay(1차 안전) / prepay
  'postpay',
  true,
  240,
  false,
  now()
)
on conflict (store_code) do update set
  enabled = excluded.enabled,
  mode = excluded.mode,
  entry_payment_mode = excluded.entry_payment_mode,
  extras_payment_mode = excluded.extras_payment_mode,
  require_staff_open = excluded.require_staff_open,
  max_open_minutes = excluded.max_open_minutes,
  allow_reorder_after_paid = excluded.allow_reorder_after_paid,
  updated_at = excluded.updated_at;

-- 샘플 티어 (포함 메뉴는 관리 UI에서 체크)
insert into public.pos_buffet_tiers (
  store_code, code, name_th, name_en, name_ko, price_per_person, sort_order, active
) values
  ('OMNI01', 'STD', 'บุฟเฟต์มาตรฐาน', 'Standard buffet', '스탠다드 뷔페', 299, 1, true),
  ('OMNI01', 'PREM', 'บุฟเฟต์พรีเมียม', 'Premium buffet', '프리미엄 뷔페', 399, 2, true)
on conflict (store_code, code) do update set
  name_th = excluded.name_th,
  name_en = excluded.name_en,
  name_ko = excluded.name_ko,
  price_per_person = excluded.price_per_person,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();

/*
현장 E2E 체크리스트 (Omni)
1. SQL DDL + 이 파일럿 설정 적용
2. /admin/pos-qr-table-order 에서 포함 메뉴 지정 (음료는 미포함)
3. 테이블 레이아웃명과 QR table_name 일치 확인 후 QR 생성·인쇄
4. POS: 빈 테이블 → QR 세션 오픈(인원·티어) → 손님 /t/{token} 접속
5. 포함 메뉴 1개 + 별도 메뉴 1개 전송 → 주방 1회
6. POS 결제: total = 입장(티어×인원) + 별도, payment_qr 누적 반영 확인
7. (Phase2) entry prepay 후 동일 시나리오
8. 영업 중 pos_orders 일괄 UPDATE 금지
*/
