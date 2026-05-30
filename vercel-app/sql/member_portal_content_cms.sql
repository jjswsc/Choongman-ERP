-- Member Portal CMS content (popup / info / store photo)
create table if not exists public.member_portal_content (
  id bigserial primary key,
  content_key text not null unique,
  content_type text not null check (content_type in ('popup', 'info', 'store_photo')),
  store_code text,
  title text,
  body text,
  image_url text,
  target_tab text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists idx_member_portal_content_type_active
  on public.member_portal_content (content_type, is_active, sort_order, updated_at desc);

create index if not exists idx_member_portal_content_store
  on public.member_portal_content (store_code);

