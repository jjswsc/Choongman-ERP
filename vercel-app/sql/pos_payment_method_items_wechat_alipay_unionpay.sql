-- POS 결제 수단: WeChat / Alipay / UnionPay (기존 DB에 없을 때만 추가)
-- The Street 등 pos_payment_method_items 전환 매장에서 「기타」탭 누락 복구용

insert into public.pos_payment_method_items (store_code, category, name, hidden, sort_order)
select v.store_code, v.category, v.name, v.hidden, v.sort_order
from (values
  (null::text, 'qr', 'WeChat', false, 2),
  (null, 'qr', 'Alipay', false, 3),
  (null, 'qr', 'UnionPay', false, 4)
) as v(store_code, category, name, hidden, sort_order)
where not exists (
  select 1 from public.pos_payment_method_items p
  where p.store_code is null and p.category = v.category and p.name = v.name
);
