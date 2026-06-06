-- ============================================================
-- supabase_one_paste_phase2.sql  (auto-generated)
-- Supabase SQL Editor: paste entire file and Run (UTF-8)
--
-- ì„ í–‰: supabase_one_paste_all_in_one.sql (ë˜ëŠ” Â§2 ê¸°ë³¸ ìŠ¤í‚¤ë§ˆ) ì‹¤í–‰ í›„
-- Regenerate: vercel-app/scripts/build-supabase-one-paste-phase2.ps1
-- Guide: vercel-app/sql/SUPABASE_EDITOR_RUNBOOK.md
--
-- Includes: paid_at, HR, member tiers, CRM coupons, petty cash VAT, compliance RPCs
-- Excludes: diagnostic SELECTs, erp_stores alias seed (ë³„ë„), K/T menu recovery
-- ============================================================

-- ============================================================
-- 23 pos_orders paid_at
-- source: sql/pos_orders_paid_at.sql
-- ============================================================

-- pos_orders.paid_at: 최초 결제 완료 시각 (주문 접수 created_at 과 구분)
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

COMMENT ON COLUMN public.pos_orders.paid_at IS
  'POS 최초 결제 완료 시각(방콕 저장). 주문 접수(created_at)와 별도.';

-- updated_at 컬럼·트리거가 없는 레거시 DB 보강
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_row_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_orders_set_updated_at ON public.pos_orders;
CREATE TRIGGER trg_pos_orders_set_updated_at
BEFORE UPDATE ON public.pos_orders
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- 기존 데이터: updated_at 이 접수보다 늦으면 결제 시각으로 추정
UPDATE public.pos_orders o
SET paid_at = COALESCE(
  NULLIF(o.linkpos_responded_at::text, '')::timestamptz,
  o.updated_at
)
WHERE o.paid_at IS NULL
  AND o.updated_at IS NOT NULL
  AND o.created_at IS NOT NULL
  AND o.updated_at > o.created_at
  AND (
    LOWER(COALESCE(o.status, '')) IN ('paid', 'completed')
    OR (
      COALESCE(o.payment_cash, 0)
      + COALESCE(o.payment_card, 0)
      + COALESCE(o.payment_qr, 0)
      + COALESCE(o.payment_other, 0)
      + COALESCE(o.payment_delivery_app, 0)
    ) > 0.005
  );

-- 동시 접수·결제(포장 등): updated_at ≈ created_at 이면 접수 시각을 결제 시각으로
UPDATE public.pos_orders o
SET paid_at = o.created_at
WHERE o.paid_at IS NULL
  AND o.created_at IS NOT NULL
  AND LOWER(COALESCE(o.status, '')) IN ('paid', 'completed')
  AND (
    COALESCE(o.payment_cash, 0)
    + COALESCE(o.payment_card, 0)
    + COALESCE(o.payment_qr, 0)
    + COALESCE(o.payment_other, 0)
    + COALESCE(o.payment_delivery_app, 0)
  ) > 0.005;


-- ============================================================
-- 24 menu ingredients quantity_unit_key
-- source: sql/pos_menu_ingredients_quantity_unit_key.sql
-- ============================================================

-- BOM 입력 단위 저장 (원가 계산기에서 선택한 ml/g/kg/ea 등)
-- Supabase SQL Editor에서 1회 실행

alter table public.pos_menu_ingredients
  add column if not exists quantity_unit_key text;

comment on column public.pos_menu_ingredients.quantity_unit_key is
  '원가 계산기 입력 단위. 형식 unit::totalQuantity (예 g::1, kg::1000). quantity는 음식=g·포장=ea 기준.';


-- ============================================================
-- 25 hr policies reads
-- source: sql/hr_policies_hr_policy_reads.sql
-- ============================================================

-- 인사 규정 + 열람 확인 (Supabase SQL Editor에서 실행)
-- API는 service_role로 접근하나, anon 시 스키마 노출 시를 대비해 RLS+정책을 둡니다.

CREATE TABLE IF NOT EXISTS public.hr_policies (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  content text,
  target_store text NOT NULL DEFAULT '전체',
  target_role text NOT NULL DEFAULT '전체',
  target_permission_group text,
  target_recipients text,
  content_version integer NOT NULL DEFAULT 1,
  effective_at date,
  is_active boolean NOT NULL DEFAULT true,
  attachments text,
  sender text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_policies_created_at ON public.hr_policies (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_policies_is_active ON public.hr_policies (is_active);

CREATE TABLE IF NOT EXISTS public.hr_policy_reads (
  id bigserial PRIMARY KEY,
  policy_id bigint NOT NULL REFERENCES public.hr_policies (id) ON DELETE CASCADE,
  store text NOT NULL,
  name text NOT NULL,
  read_at timestamptz,
  status text NOT NULL DEFAULT '확인',
  acknowledged_version integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_policy_reads_policy_store_name
  ON public.hr_policy_reads (policy_id, store, name);
CREATE INDEX IF NOT EXISTS idx_hr_policy_reads_policy_id ON public.hr_policy_reads (policy_id);

CREATE OR REPLACE FUNCTION public.trg_hr_policies_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_policies_updated_at ON public.hr_policies;
CREATE TRIGGER trg_hr_policies_updated_at
BEFORE UPDATE ON public.hr_policies
FOR EACH ROW EXECUTE PROCEDURE public.trg_hr_policies_set_updated_at();

ALTER TABLE public.hr_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_policy_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_policies_all_service" ON public.hr_policies;
CREATE POLICY "hr_policies_all_service"
  ON public.hr_policies FOR ALL
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "hr_policy_reads_all_service" ON public.hr_policy_reads;
CREATE POLICY "hr_policy_reads_all_service"
  ON public.hr_policy_reads FOR ALL
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.hr_policies IS '인사 규정 본문 및 발행 대상(공지 target_* 와 동일 의미)';
COMMENT ON TABLE public.hr_policy_reads IS '직원별 열람/확인(acknowledged_version=당시 content_version)';


-- ============================================================
-- 26 member tiers portal
-- source: sql/member_tiers_portal_benefits.sql
-- ============================================================

-- 회원 등급: LINE OA 기준 포인트·누적금액 + 회원앱 혜택 문구
-- Supabase SQL Editor에서 한 번에 실행 (테이블 없어도 동작)

-- 1) members 로열티 컬럼 (없으면 추가)
alter table public.members
  add column if not exists tier_code text default 'BRONZE',
  add column if not exists lifetime_amount numeric(14,2) not null default 0,
  add column if not exists point_balance integer not null default 0;

-- 2) 등급 마스터 테이블 (없으면 생성)
create table if not exists public.member_tiers (
  id bigint generated by default as identity primary key,
  code text not null unique,
  name text not null,
  min_amount numeric(14,2) not null default 0,
  min_points integer not null default 0,
  point_rate numeric(8,4) not null default 0.0100,
  sort_order integer not null default 0,
  benefits_ko text,
  benefits_en text,
  benefits_th text,
  created_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok'),
  updated_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok')
);

-- 3) 기존 테이블에 컬럼만 부족한 경우 보강
alter table public.member_tiers
  add column if not exists min_points integer not null default 0,
  add column if not exists sort_order integer not null default 0,
  add column if not exists benefits_ko text,
  add column if not exists benefits_en text,
  add column if not exists benefits_th text;

-- 4) 등급 변경 이력 (선택·없으면 생성 — POS 등급 재계산용)
create table if not exists public.member_tier_histories (
  id bigint generated by default as identity primary key,
  member_id bigint not null references public.members(id) on delete cascade,
  prev_tier_code text,
  next_tier_code text not null,
  reason text,
  changed_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok')
);

create index if not exists idx_member_tier_histories_member_id on public.member_tier_histories(member_id);

-- 5) VIP → DIAMOND (LINE OA 명칭 통일)
update public.members set tier_code = 'DIAMOND' where tier_code = 'VIP';

-- 6) LINE OA 기준 시드
insert into public.member_tiers (code, name, min_amount, min_points, point_rate, sort_order, benefits_ko, benefits_en, benefits_th)
values
  (
    'BRONZE',
    'Bronze',
    0,
    0,
    0.0100,
    1,
    '기본 회원 등급입니다.',
    'Basic membership level.',
    'สมาชิกระดับพื้นฐาน'
  ),
  (
    'SILVER',
    'Silver',
    3000,
    120,
    0.0125,
    2,
    null,
    null,
    null
  ),
  (
    'GOLD',
    'Gold',
    6000,
    240,
    0.0150,
    3,
    null,
    null,
    null
  ),
  (
    'DIAMOND',
    'Diamond',
    10000,
    400,
    0.0200,
    4,
    null,
    null,
    null
  )
on conflict (code) do update
set
  name = excluded.name,
  min_amount = excluded.min_amount,
  min_points = excluded.min_points,
  point_rate = excluded.point_rate,
  sort_order = excluded.sort_order,
  benefits_ko = coalesce(public.member_tiers.benefits_ko, excluded.benefits_ko),
  benefits_en = coalesce(public.member_tiers.benefits_en, excluded.benefits_en),
  benefits_th = coalesce(public.member_tiers.benefits_th, excluded.benefits_th),
  updated_at = (now() at time zone 'Asia/Bangkok');

delete from public.member_tiers where code = 'VIP';

-- 7) 승급 기준 설정 + tier_points (포인트 기준 승급용)
alter table public.members
  add column if not exists tier_points integer not null default 0;

insert into public.system_settings (key, value_json, updated_at)
values ('member_tier_upgrade_basis', '"points"'::jsonb, (now() at time zone 'Asia/Bangkok'))
on conflict (key) do nothing;

update public.members m
set tier_points = greatest(
  coalesce(m.tier_points, 0),
  coalesce(sub.sum_pts, 0),
  coalesce(m.line_tier_points, 0)
)
from (
  select
    member_id,
    coalesce(sum(case when points > 0 then points else 0 end), 0)::integer as sum_pts
  from public.member_points_ledger
  group by member_id
) sub
where m.id = sub.member_id;

update public.members
set tier_points = greatest(coalesce(tier_points, 0), coalesce(line_tier_points, 0))
where coalesce(line_tier_points, 0) > coalesce(tier_points, 0);


-- ============================================================
-- 27 member tier upgrade basis
-- source: sql/member_tier_upgrade_basis.sql
-- ============================================================

-- 등급 승급 기준 설정 + 포인트 기준용 tier_points
-- Supabase SQL Editor에서 실행

alter table public.members
  add column if not exists tier_points integer not null default 0;

insert into public.system_settings (key, value_json, updated_at)
values ('member_tier_upgrade_basis', '"points"'::jsonb, (now() at time zone 'Asia/Bangkok'))
on conflict (key) do nothing;

-- 원장 적립분으로 tier_points 백필 (기존 회원)
update public.members m
set tier_points = greatest(
  coalesce(m.tier_points, 0),
  coalesce(sub.sum_pts, 0),
  coalesce(m.line_tier_points, 0)
)
from (
  select
    member_id,
    coalesce(sum(case when points > 0 then points else 0 end), 0)::integer as sum_pts
  from public.member_points_ledger
  group by member_id
) sub
where m.id = sub.member_id;

-- LINE tier points만 있는 회원
update public.members
set tier_points = greatest(coalesce(tier_points, 0), coalesce(line_tier_points, 0))
where coalesce(line_tier_points, 0) > coalesce(tier_points, 0);


-- ============================================================
-- 28 crm coupon campaigns
-- source: sql/crm_coupon_campaigns_phase1.sql
-- ============================================================

-- CRM 쿠폰 캠페인 통합 (POS + 회원포털 + CRM)
-- 실행 대상: Supabase SQL Editor (PostgreSQL)

-- 0) 선행 테이블 가드 (신규/부분 환경에서도 본 SQL 1회 실행 가능)
do $$
begin
  if to_regclass('public.members') is not null then
    create table if not exists public.member_coupon_issues (
      id bigint generated by default as identity primary key,
      member_id bigint references public.members(id) on delete cascade,
      coupon_code text not null,
      issued_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok'),
      used_at timestamp without time zone,
      order_id bigint,
      status text not null default 'issued'
    );
    create index if not exists idx_member_coupon_issues_member_id
      on public.member_coupon_issues(member_id);
  else
    raise notice 'skip: public.members not found — member_coupon_issues not created';
  end if;
end $$;

do $$
begin
  if to_regclass('public.pos_orders') is not null
     and to_regclass('public.pos_coupons') is not null then
    create table if not exists public.pos_order_coupon_redemptions (
      id bigserial primary key,
      order_id bigint not null references public.pos_orders(id) on delete cascade,
      store_code text not null,
      coupon_id bigint references public.pos_coupons(id),
      coupon_code text not null,
      discount_amt numeric(14,2) not null default 0,
      quantity integer not null default 1,
      serial_id bigint,
      member_coupon_issue_id bigint,
      created_at timestamptz not null default now()
    );
    create index if not exists idx_pos_order_coupon_redemptions_order_id
      on public.pos_order_coupon_redemptions(order_id);
  else
    raise notice 'skip: pos_orders/pos_coupons not found — pos_order_coupon_redemptions not created';
  end if;
end $$;

-- 1) 캠페인 마스터
create table if not exists public.crm_coupon_campaigns (
  id bigint generated by default as identity primary key,
  campaign_key text unique,
  name text not null,
  description text,
  status text not null default 'draft', -- draft/active/paused/archived
  trigger_type text not null default 'manual', -- manual/auto
  audience_type text not null default 'all', -- all/tier/recent/dormant/birthday_month/new_joined
  audience_payload jsonb not null default '{}'::jsonb,
  coupon_code text not null,
  issue_limit integer,
  starts_at timestamp without time zone,
  ends_at timestamp without time zone,
  auto_schedule jsonb not null default '{}'::jsonb,
  created_by text,
  updated_by text,
  created_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok'),
  updated_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok')
);

create index if not exists idx_crm_coupon_campaigns_status
  on public.crm_coupon_campaigns(status, updated_at desc);

create index if not exists idx_crm_coupon_campaigns_coupon_code
  on public.crm_coupon_campaigns(coupon_code);

comment on column public.crm_coupon_campaigns.auto_schedule
  is 'auto 실행 스케줄 (Bangkok 기준) 예: {"timezone":"Asia/Bangkok","at":"10:00","days":["mon","wed"]}';

-- POS 쿠폰 엔진 고도화 컬럼 (1+1/세트/상품지정/우선순위)
do $$
begin
  if to_regclass('public.pos_coupons') is not null then
    alter table public.pos_coupons
      add column if not exists benefit_kind text, -- bogo/set_fixed/item_fixed/null
      add column if not exists set_qty integer,
      add column if not exists item_scope_json jsonb,
      add column if not exists priority integer not null default 0,
      add column if not exists combinable_with_manual_discount boolean not null default true,
      add column if not exists marketing_campaign_id bigint references public.marketing_campaigns(id) on delete set null;
    create index if not exists idx_pos_coupons_campaign
      on public.pos_coupons(marketing_campaign_id);
  else
    raise notice 'skip: public.pos_coupons not found';
  end if;
end $$;

-- 2) 캠페인 실행 이력
create table if not exists public.crm_coupon_campaign_runs (
  id bigint generated by default as identity primary key,
  campaign_id bigint not null references public.crm_coupon_campaigns(id) on delete cascade,
  run_mode text not null default 'manual', -- manual/auto/retry
  run_reason text,
  target_count integer not null default 0,
  issued_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  executed_by text,
  executed_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok')
);

create index if not exists idx_crm_coupon_campaign_runs_campaign_id
  on public.crm_coupon_campaign_runs(campaign_id, executed_at desc);

-- 3) 실행 대상 멤버 상세 이력 (재실행/디버깅용)
do $$
begin
  if to_regclass('public.members') is not null
     and to_regclass('public.member_coupon_issues') is not null then
    create table if not exists public.crm_coupon_campaign_run_members (
      id bigint generated by default as identity primary key,
      run_id bigint not null references public.crm_coupon_campaign_runs(id) on delete cascade,
      campaign_id bigint not null references public.crm_coupon_campaigns(id) on delete cascade,
      member_id bigint not null references public.members(id) on delete cascade,
      status text not null default 'issued', -- issued/skipped/failed
      reason text,
      member_coupon_issue_id bigint references public.member_coupon_issues(id) on delete set null,
      created_at timestamp without time zone not null default (now() at time zone 'Asia/Bangkok'),
      unique (run_id, member_id)
    );
    create index if not exists idx_crm_coupon_campaign_run_members_campaign
      on public.crm_coupon_campaign_run_members(campaign_id, created_at desc);
    create index if not exists idx_crm_coupon_campaign_run_members_member
      on public.crm_coupon_campaign_run_members(member_id, created_at desc);
  else
    raise notice 'skip: members/member_coupon_issues not found — crm_coupon_campaign_run_members not created';
  end if;
end $$;

-- 4) 회원 쿠폰 이슈 확장 (캠페인/만료/복원 추적)
do $$
begin
  if to_regclass('public.member_coupon_issues') is not null then
    alter table public.member_coupon_issues
      add column if not exists campaign_id bigint references public.crm_coupon_campaigns(id) on delete set null,
      add column if not exists expires_at timestamp without time zone,
      add column if not exists issued_store_scope jsonb,
      add column if not exists restored_at timestamp without time zone,
      add column if not exists restore_reason text,
      add column if not exists restored_from_order_id bigint;

    create index if not exists idx_member_coupon_issues_member_status_expires
      on public.member_coupon_issues(member_id, status, expires_at);

    create index if not exists idx_member_coupon_issues_campaign
      on public.member_coupon_issues(campaign_id, issued_at desc);

    create index if not exists idx_member_coupon_issues_restored_order
      on public.member_coupon_issues(restored_from_order_id);

    comment on column public.member_coupon_issues.status
      is 'issued/used/expired/cancelled/restored';

    create unique index if not exists uq_member_coupon_issues_campaign_member_code_issued
      on public.member_coupon_issues(member_id, coupon_code, coalesce(campaign_id, 0))
      where status = 'issued';
  else
    raise notice 'skip: member_coupon_issues not found — column/index extension skipped';
  end if;
end $$;

-- 5) POS 쿠폰 사용 멱등성 강화 (주문+회원쿠폰 기준)
do $$
begin
  if to_regclass('public.pos_order_coupon_redemptions') is not null then
    create unique index if not exists uq_pos_order_coupon_redemptions_order_member_issue
      on public.pos_order_coupon_redemptions(order_id, member_coupon_issue_id)
      where member_coupon_issue_id is not null;
  end if;
end $$;


-- ============================================================
-- 29 pos_coupons marketing_campaign_id
-- source: sql/pos_coupons_marketing_campaign_id.sql
-- ============================================================

-- pos_coupons에 marketing_campaign_id 추가
-- 증상: PGRST204 — Could not find the 'marketing_campaign_id' column of 'pos_coupons' in the schema cache
-- 사용법: Supabase SQL Editor에서 실행

ALTER TABLE public.pos_coupons
  ADD COLUMN IF NOT EXISTS marketing_campaign_id BIGINT REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_coupons_campaign
  ON public.pos_coupons(marketing_campaign_id);

COMMENT ON COLUMN public.pos_coupons.marketing_campaign_id IS '연계 마케팅 캠페인';


-- ============================================================
-- 30 pos_promos grab campaign time
-- source: sql/pos_promos_grab_campaign_time_bkk.sql
-- ============================================================

-- Grab 타겟가 캠페인 시작·종료 시각 (방콕 HH:mm, nullable)
-- valid_from / valid_to 날짜와 조합해 Grab conditions.startTime / endTime 계산에 사용

ALTER TABLE public.pos_promos
  ADD COLUMN IF NOT EXISTS grab_campaign_start_time_bkk varchar(5),
  ADD COLUMN IF NOT EXISTS grab_campaign_end_time_bkk varchar(5);

COMMENT ON COLUMN public.pos_promos.grab_campaign_start_time_bkk IS
  'Grab 캠페인 시작 시각(방콕 HH:mm). null이면 valid_from 당일 00:00 BKK';
COMMENT ON COLUMN public.pos_promos.grab_campaign_end_time_bkk IS
  'Grab 캠페인 종료 시각(방콕 HH:mm). null이면 valid_to 당일 23:59:59 BKK';


-- ============================================================
-- 31 expense accruals invoice
-- source: sql/expense_accruals_invoice_received.sql
-- ============================================================

-- 지출 발생(expense_accruals) 세금계산서(텍스 인보이스) 수령 여부
-- Supabase SQL Editor에서 1회 실행 (idempotent)

ALTER TABLE public.expense_accruals
  ADD COLUMN IF NOT EXISTS invoice_received BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invoice_no TEXT NULL,
  ADD COLUMN IF NOT EXISTS invoice_photo_url TEXT NULL;

COMMENT ON COLUMN public.expense_accruals.invoice_received IS '세금계산서(텍스 인보이스) 수령 여부';
COMMENT ON COLUMN public.expense_accruals.invoice_no IS '세금계산서/인보이스 번호';
COMMENT ON COLUMN public.expense_accruals.invoice_photo_url IS '세금계산서 이미지(data URL 또는 URL)';


-- ============================================================
-- 32 petty cash invoice vat
-- source: sql/petty_cash_invoice_vat.sql
-- ============================================================

-- 패티캐시 세금계산서(텍스 인보이스) · 매입 부가세(PP30) 연동
-- Supabase SQL Editor에서 1회 실행 (idempotent)

ALTER TABLE public.petty_cash_transactions
  ADD COLUMN IF NOT EXISTS invoice_received BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invoice_no TEXT NULL,
  ADD COLUMN IF NOT EXISTS invoice_photo_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS vendor_code TEXT NULL;

COMMENT ON COLUMN public.petty_cash_transactions.invoice_received IS '세금계산서(텍스 인보이스) 수령 여부';
COMMENT ON COLUMN public.petty_cash_transactions.invoice_no IS '세금계산서/인보이스 번호';
COMMENT ON COLUMN public.petty_cash_transactions.invoice_photo_url IS '세금계산서 이미지(data URL 또는 URL)';
COMMENT ON COLUMN public.petty_cash_transactions.vat_amount IS '매입 부가세 금액(PP30 매입 원장 연동)';
COMMENT ON COLUMN public.petty_cash_transactions.vendor_code IS '거래처 코드(세금 ID 조회용, 선택)';


-- ============================================================
-- 33 get_petty_cash_summary RPC
-- source: sql/get_petty_cash_summary.sql
-- ============================================================

-- Petty cash 기간 합계 RPC (페이지·2,000건 limit 없이 DB 집계)
-- Supabase SQL Editor에서 1회 실행. 미배포 시 API가 클라이언트 집계 fallback.
-- invoice_received / vat_amount 컬럼: petty_cash_invoice_vat.sql 선행

CREATE OR REPLACE FUNCTION public.get_petty_cash_summary(
  p_start_date date,
  p_end_date date,
  p_effective_store text DEFAULT NULL,
  p_trans_type text DEFAULT NULL,
  p_account_subject_id integer DEFAULT NULL,
  p_account_subject_empty boolean DEFAULT false,
  p_memo_keyword text DEFAULT NULL,
  p_invoice_status text DEFAULT NULL,
  p_pp30_vat_only boolean DEFAULT false
)
RETURNS TABLE (
  expense_total numeric,
  inflow_total numeric,
  net_change numeric,
  vat_total numeric,
  vat_pending_total numeric,
  vat_pending_count bigint,
  row_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      t.trans_type,
      t.amount,
      COALESCE(t.vat_amount, 0)::numeric AS vat_amount,
      COALESCE(t.invoice_received, false) AS invoice_received
    FROM public.petty_cash_transactions t
    WHERE t.trans_date::date >= p_start_date
      AND t.trans_date::date <= p_end_date
      AND COALESCE(btrim(t.store), '') <> ''
      AND (
        p_effective_store IS NULL
        OR btrim(p_effective_store) = ''
        OR (
          btrim(p_effective_store) = 'Office'
          AND (
            t.store IN ('Office', '본사', '오피스', '본점')
            OR t.store ILIKE 'Office-%'
          )
        )
        OR t.store = btrim(p_effective_store)
      )
      AND (
        p_trans_type IS NULL
        OR btrim(p_trans_type) = ''
        OR lower(t.trans_type) = lower(btrim(p_trans_type))
      )
      AND (
        NOT COALESCE(p_account_subject_empty, false)
        OR t.account_subject_id IS NULL
        OR t.account_subject_id = 0
      )
      AND (
        p_account_subject_id IS NULL
        OR p_account_subject_id = 0
        OR t.account_subject_id = p_account_subject_id
      )
      AND (
        p_memo_keyword IS NULL
        OR btrim(p_memo_keyword) = ''
        OR t.memo ILIKE ('%' || btrim(p_memo_keyword) || '%')
        OR t.user_name ILIKE ('%' || btrim(p_memo_keyword) || '%')
      )
      AND (
        p_invoice_status IS NULL
        OR btrim(p_invoice_status) = ''
        OR btrim(p_invoice_status) = 'all'
        OR (
          lower(t.trans_type) = 'expense'
          AND (
            (btrim(p_invoice_status) = 'received' AND COALESCE(t.invoice_received, false))
            OR (btrim(p_invoice_status) = 'pending' AND NOT COALESCE(t.invoice_received, false))
          )
        )
      )
      AND (
        NOT COALESCE(p_pp30_vat_only, false)
        OR (
          lower(t.trans_type) = 'expense'
          AND COALESCE(t.vat_amount, 0) > 0
        )
      )
  )
  SELECT
    COALESCE(SUM(CASE WHEN lower(trans_type) = 'expense' THEN ABS(amount) ELSE 0 END), 0)::numeric AS expense_total,
    COALESCE(SUM(CASE WHEN lower(trans_type) IN ('receive', 'replenish') THEN ABS(amount) ELSE 0 END), 0)::numeric AS inflow_total,
    COALESCE(SUM(amount), 0)::numeric AS net_change,
    COALESCE(SUM(CASE WHEN lower(trans_type) = 'expense' AND vat_amount > 0 THEN vat_amount ELSE 0 END), 0)::numeric AS vat_total,
    COALESCE(SUM(CASE WHEN lower(trans_type) = 'expense' AND vat_amount > 0 AND NOT invoice_received THEN vat_amount ELSE 0 END), 0)::numeric AS vat_pending_total,
    COUNT(*) FILTER (
      WHERE lower(trans_type) = 'expense' AND vat_amount > 0 AND NOT invoice_received
    )::bigint AS vat_pending_count,
    COUNT(*)::bigint AS row_count
  FROM base;
$$;

COMMENT ON FUNCTION public.get_petty_cash_summary(date, date, text, text, integer, boolean, text, text, boolean) IS
  'Petty cash 기간 합계(지출·입금·VAT·건수). 관리자 검색 합계 카드용.';

GRANT EXECUTE ON FUNCTION public.get_petty_cash_summary(date, date, text, text, integer, boolean, text, text, boolean)
  TO anon, authenticated, service_role;


-- ============================================================
-- 34 pos vat compliance RPCs
-- source: sql/accounting_pos_compliance_reconciliation_rpc.sql
-- ============================================================

-- POS 결제완료 합계 vs VAT draft 합계 비교용 RPC

CREATE OR REPLACE FUNCTION public.get_pos_paid_totals_by_window(
  p_start_utc TIMESTAMPTZ,
  p_end_utc_exclusive TIMESTAMPTZ,
  p_store_code TEXT DEFAULT NULL
)
RETURNS TABLE (
  order_count BIGINT,
  subtotal NUMERIC,
  vat NUMERIC,
  total NUMERIC
)
LANGUAGE sql
AS $$
SELECT
  COUNT(*)::BIGINT AS order_count,
  COALESCE(SUM(COALESCE(o.subtotal, 0)), 0)::NUMERIC AS subtotal,
  COALESCE(SUM(COALESCE(o.vat, 0)), 0)::NUMERIC AS vat,
  COALESCE(SUM(COALESCE(o.total, 0)), 0)::NUMERIC AS total
FROM public.pos_orders o
WHERE o.created_at >= p_start_utc
  AND o.created_at < p_end_utc_exclusive
  AND lower(COALESCE(o.status, '')) IN ('paid', 'completed', 'ready')
  AND (
    COALESCE(NULLIF(trim(p_store_code), ''), '*') = '*'
    OR COALESCE(o.store_code, '') = trim(p_store_code)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_vat_draft_totals_by_window(
  p_start_date DATE,
  p_end_date DATE,
  p_store_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  row_count BIGINT,
  net_amount NUMERIC,
  vat_amount NUMERIC,
  total_amount NUMERIC
)
LANGUAGE sql
AS $$
SELECT
  COUNT(*)::BIGINT AS row_count,
  COALESCE(SUM(COALESCE(v.net_amount, 0)), 0)::NUMERIC AS net_amount,
  COALESCE(SUM(COALESCE(v.vat_amount, 0)), 0)::NUMERIC AS vat_amount,
  COALESCE(SUM(COALESCE(v.total_amount, 0)), 0)::NUMERIC AS total_amount
FROM public.vat_ledger_entries v
WHERE v.doc_date >= p_start_date
  AND v.doc_date <= p_end_date
  AND lower(COALESCE(v.direction, '')) = 'output'
  AND lower(COALESCE(v.filing_status, 'draft')) = 'draft'
  AND (
    COALESCE(NULLIF(trim(p_store_name), ''), '*') = '*'
    OR COALESCE(v.store_name, '') = trim(p_store_name)
  );
$$;


-- ============================================================
-- END supabase_one_paste_phase2.sql
-- ============================================================
