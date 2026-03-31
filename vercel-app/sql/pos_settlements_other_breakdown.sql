-- POS 결산: 결제 탭「기타」와 동일한 세부 항목 (other_breakdown)
alter table public.pos_settlements
  add column if not exists other_breakdown jsonb default '{}'::jsonb;

update public.pos_settlements
set other_breakdown = '{}'::jsonb
where other_breakdown is null;
