-- Omni SaaS: Grab 레거시 테이블 tenant_id (매장 store_code → erp_stores.tenant_id)
-- pos_orders.tenant_id 는 saas_base_schema / grab 앱 insert 로 처리.

do $$
begin
  if to_regclass('public.pos_grab_store_integrations') is not null then
    alter table public.pos_grab_store_integrations
      add column if not exists tenant_id text;
    create index if not exists idx_pos_grab_store_integrations_tenant_id
      on public.pos_grab_store_integrations (tenant_id);
  end if;

  if to_regclass('public.pos_grab_webhook_events') is not null then
    alter table public.pos_grab_webhook_events
      add column if not exists tenant_id text;
    create index if not exists idx_pos_grab_webhook_events_tenant_id
      on public.pos_grab_webhook_events (tenant_id);
  end if;
end $$;

-- partner_merchant_id → erp_stores.store_code 로 tenant 백필
do $$
begin
  if to_regclass('public.pos_grab_store_integrations') is null
     or to_regclass('public.erp_stores') is null then
    return;
  end if;

  update public.pos_grab_store_integrations g
  set tenant_id = es.tenant_id
  from public.erp_stores es
  where coalesce(trim(g.tenant_id), '') = ''
    and nullif(trim(es.tenant_id), '') is not null
    and lower(trim(coalesce(g.partner_merchant_id, '')))
      = lower(trim(coalesce(es.store_code, '')));
end $$;

-- pos_menu_ingredients_audit tenant (선택)
do $$
begin
  if to_regclass('public.pos_menu_ingredients_audit') is not null then
    alter table public.pos_menu_ingredients_audit
      add column if not exists tenant_id text;
    create index if not exists idx_pos_menu_ingredients_audit_tenant_id
      on public.pos_menu_ingredients_audit (tenant_id);

    if to_regclass('public.pos_menus') is not null then
      update public.pos_menu_ingredients_audit a
      set tenant_id = m.tenant_id
      from public.pos_menus m
      where a.menu_id = m.id
        and coalesce(trim(a.tenant_id), '') = ''
        and nullif(trim(m.tenant_id), '') is not null;
    end if;
  end if;
end $$;
