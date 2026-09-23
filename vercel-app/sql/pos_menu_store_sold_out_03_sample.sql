-- 매장별 품절 현황 샘플 (01 생성·02 존재 확인 후)

select store_code, menu_id, sold_out_date, updated_at
from public.pos_menu_store_sold_out
order by updated_at desc nulls last
limit 30;
