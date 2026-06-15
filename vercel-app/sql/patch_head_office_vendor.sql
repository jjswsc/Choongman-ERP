-- 본사(Head Office) 거래처 — Tax Invoice FROM 회사명·주소 복구
-- Supabase SQL Editor에서 1회 실행 (vendors.type=본사 또는 code=HQ)

update public.vendors
set
  name = 'S&J GLOBAL CO., LTD. (Head Office)',
  addr = '101 true digital park pegasus building, floor 5, unit 545, Sukhumvit Rd. Khwang Bang Chak, Khet Phra Khanong, Bangkok 10260',
  tax_id = coalesce(nullif(trim(tax_id), ''), '0105566137147'),
  phone = coalesce(nullif(trim(phone), ''), '091-072-6252'),
  type = '본사',
  code = coalesce(nullif(trim(code), ''), 'HQ')
where code = 'HQ'
   or type in ('본사', 'Head Office');

-- 본사 행이 없으면 신규 삽입
insert into public.vendors (type, code, name, addr, tax_id, phone, memo)
select
  '본사',
  'HQ',
  'S&J GLOBAL CO., LTD. (Head Office)',
  '101 true digital park pegasus building, floor 5, unit 545, Sukhumvit Rd. Khwang Bang Chak, Khet Phra Khanong, Bangkok 10260',
  '0105566137147',
  '091-072-6252',
  'ธนาคารกสิกรไทย เลขที่ 166-2-97079-0 ชื่อบัญชี บจก. เอสแอนด์เจ โกลบอล'
where not exists (
  select 1 from public.vendors
  where code = 'HQ' or type in ('본사', 'Head Office')
);
