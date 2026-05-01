-- =============================================================================
-- POS 테스트 매출·주문 데이터 일괄 삭제 (실사용 전 정리)
-- =============================================================================
-- ⚠️ 되돌릴 수 없습니다. 실행 전 Supabase 백업·스냅샷을 권장합니다.
--
-- 삭제 대상: pos_orders 행과 연결된
--   - 분개(journal_entries: pos_order / pos_order_reversal)
--   - 부가세 초안(vat_ledger_entries, POS 자동 메모)
--   - 회원 포인트·쿠폰(테이블이 배포되어 있을 때만, order_id 연동)
--   - LINKPOS 결제 시도 로그(pos_payment_attempts)
--   - POS 재고 차감(pos_stock_deductions, stock_logs spec POS-{id})
--   - outbound_delete_events(주문 연동 시)
--   - pos_orders
--
-- 회원: member_points_ledger 가 없으면 해당 단계는 건너뜁니다. 있으면 삭제 후 members.point_balance 는
--       자동 일치하지 않을 수 있으니, 실회원 테스트였다면 포인트를 수동 점검하십시오.
--
-- 사용: Supabase SQL Editor에서 아래 v_cutover_utc 만 조정한 뒤 전체 실행.
--   NULL     → pos_orders 전부 삭제
--   시각값  → created_at 이 그 시각 **미만**인 주문만 삭제 (방콕 10:00 = UTC 03:00 당일)
--
-- 예) 방콕 2026-05-01 10:00 이전만 삭제:
--   timestamptz '2026-05-01 03:00:00+00'
-- =============================================================================

begin;

do $purge$
declare
  v_cutover timestamptz := null;  -- 전체 삭제. 부분만이면 예: '2026-05-01 03:00:00+00'::timestamptz
begin
  create temporary table tmp_pos_purge_order_ids (id bigint primary key) on commit drop;

  insert into tmp_pos_purge_order_ids (id)
  select o.id
  from public.pos_orders o
  where v_cutover is null
     or o.created_at < v_cutover;

  raise notice 'pos_orders to delete: %', (select count(*) from tmp_pos_purge_order_ids);

  -- 1) 분개 (journal_lines 는 보통 entries 삭제 시 CASCADE)
  if to_regclass('public.journal_entries') is not null then
    delete from public.journal_entries je
    using tmp_pos_purge_order_ids t
    where je.source_type in ('pos_order', 'pos_order_reversal')
      and je.source_id = t.id;
  end if;

  -- 2) POS 자동 부가세 초안 (주문 id 가 메모에 포함됨)
  if to_regclass('public.vat_ledger_entries') is not null then
    delete from public.vat_ledger_entries v
    using tmp_pos_purge_order_ids t
    where v.memo ilike '%[AUTO:POS_ORDER:' || t.id::text || ']%';
  end if;

  -- 3) 회원 (스키마에 테이블이 있을 때만)
  if to_regclass('public.member_points_ledger') is not null then
    delete from public.member_points_ledger mpl
    using tmp_pos_purge_order_ids t
    where mpl.order_id is not null
      and mpl.order_id = t.id;
  end if;

  if to_regclass('public.member_coupon_issues') is not null then
    delete from public.member_coupon_issues mci
    using tmp_pos_purge_order_ids t
    where mci.order_id is not null
      and mci.order_id = t.id;
  end if;

  -- 4) LINKPOS 결제 시도 (FK 가 있으면 주문 삭제 전 정리)
  if to_regclass('public.pos_payment_attempts') is not null then
    delete from public.pos_payment_attempts ppa
    using tmp_pos_purge_order_ids t
    where ppa.order_id is not null
      and ppa.order_id = t.id;
  end if;

  -- 5) POS 재고 차감 메타
  if to_regclass('public.pos_stock_deductions') is not null then
    delete from public.pos_stock_deductions psd
    using tmp_pos_purge_order_ids t
    where psd.order_id = t.id;
  end if;

  -- 6) stock_logs (POS 주문 spec)
  if to_regclass('public.stock_logs') is not null then
    delete from public.stock_logs sl
    using tmp_pos_purge_order_ids t
    where sl.log_type = 'POS'
      and (
        sl.spec = 'POS-' || t.id::text
        or sl.spec = 'POS-REV-' || t.id::text
      );
  end if;

  -- 7) 출고 삭제 이벤트(스키마에 있을 때)
  if to_regclass('public.outbound_delete_events') is not null then
    delete from public.outbound_delete_events ode
    using tmp_pos_purge_order_ids t
    where ode.order_id is not null
      and ode.order_id = t.id;
  end if;

  -- 8) 주문 본문
  delete from public.pos_orders o
  using tmp_pos_purge_order_ids t
  where o.id = t.id;
end;
$purge$;

commit;
