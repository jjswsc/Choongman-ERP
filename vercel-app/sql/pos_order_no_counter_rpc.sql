-- POS 주문번호 원자 할당 (주문 폭주 시 select+scan 병목/충돌 방지)
create table if not exists public.pos_order_no_counters (
  store_slug text not null,
  business_ymd text not null check (business_ymd ~ '^[0-9]{8}$'),
  last_seq integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (store_slug, business_ymd)
);

create or replace function public.allocate_pos_order_no(
  p_store_slug text,
  p_business_ymd text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_ymd text;
  v_next integer;
begin
  v_slug := upper(regexp_replace(coalesce(p_store_slug, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_slug = '' then
    v_slug := 'ST';
  end if;
  v_slug := left(v_slug, 12);

  v_ymd := regexp_replace(coalesce(p_business_ymd, ''), '[^0-9]', '', 'g');
  if length(v_ymd) <> 8 then
    raise exception 'invalid business ymd: %', coalesce(p_business_ymd, '');
  end if;

  insert into public.pos_order_no_counters as c (store_slug, business_ymd, last_seq, updated_at)
  values (v_slug, v_ymd, 1, now())
  on conflict (store_slug, business_ymd)
  do update
    set last_seq = c.last_seq + 1,
        updated_at = now()
  returning last_seq into v_next;

  return v_slug || '-' || v_ymd || '-' || lpad(v_next::text, 3, '0');
end;
$$;

revoke all on function public.allocate_pos_order_no(text, text) from public, anon, authenticated;
grant execute on function public.allocate_pos_order_no(text, text) to service_role;
