-- 본사 입고 location 표기 CM Office·HQ·본사 등 → 입고등록(창고) 단일화
-- 화면 선택명은 CM Office. stock_logs·inbound_batches 저장은 입고등록.
-- Supabase SQL Editor에서 1회 실행. (백업 후 적용 권장)

do $inbound$
declare
  canon text := '입고등록';
begin
  if to_regclass('public.inbound_batches') is not null then
    update public.inbound_batches
    set location = canon
    where lower(trim(coalesce(location, ''))) in (
      'cm office', 'cmoffice', 'hq', 'office', '본사', '오피스', '본점', 'head office',
      '입고등록(본사)'
    )
      and trim(coalesce(location, '')) <> canon;
  end if;

  if to_regclass('public.stock_logs') is not null then
    update public.stock_logs
    set location = canon
    where lower(trim(coalesce(log_type, ''))) = 'inbound'
      and lower(trim(coalesce(location, ''))) in (
        'cm office', 'cmoffice', 'hq', 'office', '본사', '오피스', '본점', 'head office',
        '입고등록(본사)'
      )
      and trim(coalesce(location, '')) <> canon;
  end if;
end
$inbound$;
