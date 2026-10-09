-- QR 숨김 메뉴 컬럼 적용 확인 (조회만, 변경 없음)
-- 1행 나오면 적용 완료. 0행이면 pos_qr_hidden_menu_ids_01_ddl.sql 먼저 실행.

select
  c.column_name,
  c.data_type,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'pos_qr_order_store_settings'
  and c.column_name = 'hidden_menu_ids';
