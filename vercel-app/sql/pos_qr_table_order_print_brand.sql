-- QR 테이블오더 인쇄 카드 브랜드 (로고·색)
-- pos_qr_table_order_buffet.sql 적용 후 실행

alter table if exists public.pos_qr_order_store_settings
  add column if not exists print_logo_url text,
  add column if not exists print_brand_color text,
  add column if not exists print_accent_color text,
  add column if not exists print_brand_line text;

comment on column public.pos_qr_order_store_settings.print_logo_url is 'Table QR card logo image URL';
comment on column public.pos_qr_order_store_settings.print_brand_color is 'Table QR card primary hex e.g. #b45309';
comment on column public.pos_qr_order_store_settings.print_accent_color is 'Table QR card accent hex';
comment on column public.pos_qr_order_store_settings.print_brand_line is 'Optional brand subtitle on print card';
