-- 캠페인 디자인 작업(2차 확장안) — URL 링크 중심
-- 필요 시 Supabase SQL Editor에서 실행

create table if not exists public.marketing_campaign_design_tasks (
  id bigserial primary key,
  campaign_id bigint not null,
  work_type text not null default 'ad',
  title text not null default '',
  start_date date,
  end_date date,
  owner text not null default '',
  status text not null default 'planned',
  asset_url text not null default '',
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.marketing_campaign_design_tasks is
  '캠페인별 디자인 작업 항목(2차 확장). 승인 게이트 없이 일정/담당/산출물 URL 추적';
comment on column public.marketing_campaign_design_tasks.work_type is
  'ad | influencer | material | collab | promo 등';
comment on column public.marketing_campaign_design_tasks.status is
  'planned | in_progress | done';
comment on column public.marketing_campaign_design_tasks.asset_url is
  'Figma/Drive/Notion 등 외부 링크';

-- 캠페인 삭제 시 작업도 정리
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_marketing_campaign_design_tasks_campaign'
  ) then
    alter table public.marketing_campaign_design_tasks
      add constraint fk_marketing_campaign_design_tasks_campaign
      foreign key (campaign_id)
      references public.marketing_campaigns(id)
      on delete cascade;
  end if;
end $$;

create index if not exists idx_marketing_campaign_design_tasks_campaign
  on public.marketing_campaign_design_tasks(campaign_id);

