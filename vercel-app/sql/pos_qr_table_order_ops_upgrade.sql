-- QR 테이블오더: 직원 호출 + (이미 buffet에 있으면 경우 no-op) 인쇄 브랜드
-- pos_qr_table_order_buffet.sql 적용 후 실행

alter table if exists public.pos_qr_table_sessions
  add column if not exists staff_call_at timestamptz,
  add column if not exists staff_call_note text;

comment on column public.pos_qr_table_sessions.staff_call_at is 'Guest requested staff (water/bill/help); cleared when staff acks';
comment on column public.pos_qr_table_sessions.staff_call_note is 'Optional guest call note';

alter table if exists public.pos_qr_order_store_settings
  add column if not exists print_logo_url text,
  add column if not exists print_brand_color text,
  add column if not exists print_accent_color text,
  add column if not exists print_brand_line text;
