# Supabase SQL Editor — 실행 가이드

SQL Editor에 스크립트를 **계속 쌓아두지 말고**, 이 문서에서 필요한 파일만 열어 **한 파일씩** 복사·실행하세요.  
대부분 `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`이라 **재실행해도 안전**합니다.

> 파일 전체 목록·키워드 검색: [`docs/SQL-INDEX.md`](../docs/SQL-INDEX.md)

---

## 1. 원칙 (Editor 정리)

| 하지 말 것 | 대신 |
|---|---|
| 여러 스크립트를 한 탭에 이어 붙여 두기 | **붙여넣기 파일 2개만** (§1b·§1c) |
| 진단용 `SELECT`를 DDL과 섞어 실행 | [`supabase_editor_diagnostic_only.sql`](./supabase_editor_diagnostic_only.sql) — 필요할 때만 열고 닫기 |
| 회원 CRM·메뉴 복구 SQL을 매번 전체 실행 | 증상별로 해당 파일 **1개**만 |
| `get_pos_sales_period_summary` · `get_pos_channel_settlement_gross` **2번** | all-in-one에 이미 포함 — **중복 블록 삭제** |

### SQL Editor에 쌓인 덩어리 — 지울 것 / 남길 것

**Editor 탭 전체를 비우고**, 아래 **2개 파일만** 순서대로 Run 하면 됩니다. (이미 스키마가 맞으면 재실행해도 안전)

| Editor에 있던 내용 | 조치 | 대신 |
|---|---|---|
| `supabase_one_paste_all_in_one` 헤더 ~ END | **유지(1회 Run)** | [`supabase_one_paste_all_in_one.sql`](./supabase_one_paste_all_in_one.sql) |
| `paid_at` · HR · 등급 · CRM 쿠폰 · 패티캐시 VAT · compliance RPC | **삭제 후 phase2로 대체** | [`supabase_one_paste_phase2.sql`](./supabase_one_paste_phase2.sql) |
| Grab 주문/웹훅 `SELECT` · `#058` · SOY SAUCE SET · `option_code` 빈 품목 | **삭제** (스키마 변경 없음) | [`supabase_editor_diagnostic_only.sql`](./supabase_editor_diagnostic_only.sql) 참고만 |
| `information_schema.columns` · `pos_grab_webhook_events` 조회 | **삭제** | 위 diagnostic 파일 |
| `seed_erp_store_aliases()` + `select *` | **삭제** (매장 alias 보강할 때만) | [`erp_stores_seed_all_aliases.sql`](./erp_stores_seed_all_aliases.sql) |
| `get_pos_channel_settlement_gross` **두 번째** 정의 (배달 gross 보정판) | **삭제** | all-in-one §11에 최신版 포함 |
| `pos_coupons marketing_campaign_id` **중복 ALTER** | **삭제** | phase2 §29 1회만 |
| K001/T001 메뉴 코드 복구 | **삭제** (ID 확인 후만) | [`supabase_one_paste_optional_menu_code_recovery.sql`](./supabase_one_paste_optional_menu_code_recovery.sql) |

---

## 1b. 한 번에 붙여넣기 — 1차 (운영 DB 기본)

Supabase SQL Editor → 아래 파일 **전체** 복사 → Run:

**[`supabase_one_paste_all_in_one.sql`](./supabase_one_paste_all_in_one.sql)**

포함: 회계·세무·POS·결산·RLS·채널정산·CRM·회원포털·RPC (22개 섹션, 재실행 가능)  
제외: 진단 SELECT, K001/T001 메뉴 코드 복구(ID 확인 필요)

재생성: `vercel-app/scripts/build-supabase-one-paste-all-in-one.ps1`

---

## 1c. 한 번에 붙여넣기 — 2차 (최근 기능)

**1b 실행 후** 같은 Editor 탭을 비우고 아래 **전체** Run:

**[`supabase_one_paste_phase2.sql`](./supabase_one_paste_phase2.sql)**

포함: `paid_at` · BOM 단위 · 인사 규정 · 회원 등급 · CRM 쿠폰 캠페인 · 지출/패티캐시 세금계산서 · `get_petty_cash_summary` · POS/VAT 대사 RPC  
제외: 진단 SELECT, `erp_stores` alias 시드

재생성: `vercel-app/scripts/build-supabase-one-paste-phase2.ps1`

---

## 2. 처음 세팅 (신규 DB)

순서대로 **각 파일 전체** 실행:

| 순서 | 파일 | 내용 |
|:---:|---|---|
| 0 | [`supabase_schema.sql`](../../supabase_schema.sql) + [`supabase_migration_consolidated.sql`](../../supabase_migration_consolidated.sql) | 기본 스키마 |
| 1 | [`supabase_one_paste_all_in_one.sql`](./supabase_one_paste_all_in_one.sql) | **아래 3~12를 한 번에 포함** |

<details>
<summary>개별 파일로 나눠 실행할 때 (접기)</summary>

| 순서 | 파일 | 내용 |
|:---:|---|---|
| 1 | [`../../supabase_schema.sql`](../../supabase_schema.sql) | 기본 ERP/POS 스키마 |
| 2 | [`../../supabase_migration_consolidated.sql`](../../supabase_migration_consolidated.sql) | 통합 마이그레이션 |
| 3 | [`supabase_one_paste_accounting_and_pos_printer_cut_clean.sql`](./supabase_one_paste_accounting_and_pos_printer_cut_clean.sql) | 회계·세무·POS 주문 컬럼·쿠폰·프린터·치킨 옵션 UI |
| 4 | [`pos_settlements_bootstrap.sql`](./pos_settlements_bootstrap.sql) | POS 결산 테이블 |
| 5 | [`pos_orders_rls_bootstrap.sql`](./pos_orders_rls_bootstrap.sql) | POS 조회/저장 RLS |
| 6 | [`supabase_rpc_egress_helpers_deploy.sql`](./supabase_rpc_egress_helpers_deploy.sql) | 재고·미수/미지급 RPC |
| 7 | [`get_pos_sales_period_summary_deploy.sql`](./get_pos_sales_period_summary_deploy.sql) | POS 매출 요약 RPC |
| 8 | [`members_crm_scale_phase1_to_4.sql`](./members_crm_scale_phase1_to_4.sql) | 회원/CRM·LINE import |
| 9 | [`member_portal_content_cms.sql`](./member_portal_content_cms.sql) | 회원 앱 CMS |
| 10 | [`../scripts/pos_delivery_apps_schema.sql`](../scripts/pos_delivery_apps_schema.sql) | 배달앱 마스터 |
| 11 | [`../scripts/pos_payment_method_items.sql`](../scripts/pos_payment_method_items.sql) | 결제 수단 항목 |
| 12 | [`../scripts/pos_menu_screen_config_schema.sql`](../scripts/pos_menu_screen_config_schema.sql) | POS 화면 구성 |

</details>

---

## 3. 운영 DB — 증상별 (필요한 것만)

### 회계 · 세무

| 증상 / 필요 기능 | 실행 파일 |
|---|---|
| 복식부기·VAT·WHT·KT20k 한 번에 | [`supabase_one_paste_accounting_and_pos_printer_cut_clean.sql`](./supabase_one_paste_accounting_and_pos_printer_cut_clean.sql) |
| 배달앱/카드 수수료 계정과목(5528·5529) | [`account_subjects_delivery_card_fee.sql`](./account_subjects_delivery_card_fee.sql) |
| 채널 정산·플랫폼 %·`card_fee_amt` | [`pos_channel_settlement_deploy_one_paste.sql`](./pos_channel_settlement_deploy_one_paste.sql) (all-in-one §11) |
| 지출 발생 세금계산서 수령 | [`expense_accruals_invoice_received.sql`](./expense_accruals_invoice_received.sql) (phase2 §31) |
| 패티캐시 세금계산서·매입 VAT | [`petty_cash_invoice_vat.sql`](./petty_cash_invoice_vat.sql) + [`get_petty_cash_summary.sql`](./get_petty_cash_summary.sql) (phase2 §32–33) |
| POS vs VAT draft 대사 RPC | [`accounting_pos_compliance_reconciliation_rpc.sql`](./accounting_pos_compliance_reconciliation_rpc.sql) (phase2 §34) |

### POS 주문 · 결산 · 매출

| 증상 / 필요 기능 | 실행 파일 |
|---|---|
| 홀/배달/포장 **주문 리스트가 전부 비어 있음** | [`supabase_one_paste_pos_orders_list.sql`](./supabase_one_paste_pos_orders_list.sql) 또는 clean §(3) |
| 주문은 되는데 **목록 API만** 컬럼 오류 | 위와 동일 |
| **결산 저장** PGRST204 `cash_amt` 없음 | [`pos_settlements_bootstrap.sql`](./pos_settlements_bootstrap.sql) → [`pos_settlements_align_app_columns.sql`](./pos_settlements_align_app_columns.sql) |
| 결산 테이블 자체가 없음 | [`pos_settlements_bootstrap.sql`](./pos_settlements_bootstrap.sql) |
| RLS 때문에 조회/저장 0건 | [`pos_orders_rls_bootstrap.sql`](./pos_orders_rls_bootstrap.sql) |
| 오늘 매출 요약 RPC 없음 | [`get_pos_sales_period_summary_deploy.sql`](./get_pos_sales_period_summary_deploy.sql) |
| 재고 합계·미수/미지급 RPC | [`supabase_rpc_egress_helpers_deploy.sql`](./supabase_rpc_egress_helpers_deploy.sql) |

### POS 프린터 · UI · 메뉴

| 증상 / 필요 기능 | 실행 파일 |
|---|---|
| ESC/POS 절단·주방 옵션 출력 JSON | clean §(2) 또는 [`pos_printer_kitchen_option_group_print.sql`](./pos_printer_kitchen_option_group_print.sql) |
| 금전 서랍 PIN | [`pos_printer_settings_drawer_pin.sql`](./pos_printer_settings_drawer_pin.sql) |
| 고객화면 언어 | [`pos_dual_monitor_language_override.sql`](./pos_dual_monitor_language_override.sql) |
| 메뉴 홀/배달/포장 노출 플래그 | [`pos_menus_sell_channels.sql`](./pos_menus_sell_channels.sql) |
| CURRY/GARLIC BBQ 옵션이 size/part 단계로만 나옴 | [`pos_menu_fix_curry_garlic_barbq_option_ui.sql`](./pos_menu_fix_curry_garlic_barbq_option_ui.sql) (clean §6과 동일) |
| `option_code` prefix 불일치 | [`pos_menu_option_code_prefix_autofix.sql`](./pos_menu_option_code_prefix_autofix.sql) |
| 반반 메뉴 whitelist | [`pos_banban_flavor_links.sql`](./pos_banban_flavor_links.sql) |
| QR WeChat/Alipay/UnionPay 누락 | [`pos_payment_method_items_wechat_alipay_unionpay.sql`](./pos_payment_method_items_wechat_alipay_unionpay.sql) |
| 다중 쿠폰 | [`pos_multi_coupon.sql`](./pos_multi_coupon.sql) (clean §5에 포함) |

### 회원 · CRM · 포털

| 증상 / 필요 기능 | 실행 파일 |
|---|---|
| 회원 필드·OTP·RFM·LINE import | [`members_crm_scale_phase1_to_4.sql`](./members_crm_scale_phase1_to_4.sql) **1번만** |
| 회원 앱 팝업/매장 사진 CMS | [`member_portal_content_cms.sql`](./member_portal_content_cms.sql) |
| CRM 쿠폰 캠페인·member_coupon_issues | [`crm_coupon_campaigns_phase1.sql`](./crm_coupon_campaigns_phase1.sql) (phase2 §28) |
| 회원 등급·혜택 문구 | [`member_tiers_portal_benefits.sql`](./member_tiers_portal_benefits.sql) (phase2 §26) |
| 등급 승급 기준(tier_points) | [`member_tier_upgrade_basis.sql`](./member_tier_upgrade_basis.sql) (phase2 §27) |
| 인사 규정·열람 확인 | [`hr_policies_hr_policy_reads.sql`](./hr_policies_hr_policy_reads.sql) (phase2 §25) |

---

## 4. ⚠️ 확인 후에만 (일회성·ID 의존)

**사전 `SELECT`로 id·code 확인 후** 해당 파일만 실행:

| 목적 | 파일 |
|---|---|
| K001~K003 도시락 코드 ↔ T001~T003 떡볶이 재배정 | [`supabase_one_paste_optional_menu_code_recovery.sql`](./supabase_one_paste_optional_menu_code_recovery.sql) |
| K 도시락만 (구버전) | [`pos_menu_recover_k_dosirak_codes.sql`](./pos_menu_recover_k_dosirak_codes.sql) |
| T 떡볶이만 | [`pos_menu_assign_tteokbokki_codes.sql`](./pos_menu_assign_tteokbokki_codes.sql) |

---

## 5. Editor에 쌓인 덩어리 → 레포 파일 매핑

아래는 **예전에 SQL Editor에 한꺼번에 붙여넣었던 블록**과 **지금 쓸 파일** 대응표입니다.

| Editor에 있던 내용 | 대신 실행할 파일 | 비고 |
|---|---|---|
| `supabase_one_paste_accounting_and_pos_printer_cut_clean` 헤더 + BEGIN~COMMIT 회계 | [`supabase_one_paste_accounting_and_pos_printer_cut_clean.sql`](./supabase_one_paste_accounting_and_pos_printer_cut_clean.sql) | **메인 1개** |
| `pos_printer_settings` + ESC/POS cut 3컬럼 | clean §(2) | 단독 필요 시 printer 관련 sql |
| C020~C023 BBQ 옵션 UI | [`pos_menu_fix_curry_garlic_barbq_option_ui.sql`](./pos_menu_fix_curry_garlic_barbq_option_ui.sql) | SELECT 진단 제외 |
| `kitchen_slip_option_group_print` | [`pos_printer_kitchen_option_group_print.sql`](./pos_printer_kitchen_option_group_print.sql) | clean에 포함 |
| K001/K002/K003 복구 + T001~T003 | [`supabase_one_paste_optional_menu_code_recovery.sql`](./supabase_one_paste_optional_menu_code_recovery.sql) | ID 확인 필수 |
| option_code autofix | [`pos_menu_option_code_prefix_autofix.sql`](./pos_menu_option_code_prefix_autofix.sql) | UPDATE만 (clean §7) |
| 메뉴 코드 영향 점검 SELECT 묶음 | [`pos_menu_code_dedupe_impact_checks.sql`](./pos_menu_code_dedupe_impact_checks.sql) | **진단만** |
| POS 다중 쿠폰 | [`pos_multi_coupon.sql`](./pos_multi_coupon.sql) | clean §5 |
| 채널 정산 + Grab/LINE/Shopee % | [`pos_channel_settlement_deploy_one_paste.sql`](./pos_channel_settlement_deploy_one_paste.sql) | |
| `sell_hall` / `sell_delivery` / `sell_packaging` | [`pos_menus_sell_channels.sql`](./pos_menus_sell_channels.sql) | |
| `drawer_pin_hash` | [`pos_printer_settings_drawer_pin.sql`](./pos_printer_settings_drawer_pin.sql) | |
| `customer_display_lang_*` | [`pos_dual_monitor_language_override.sql`](./pos_dual_monitor_language_override.sql) | |
| `pos_banban_flavor_links` | [`pos_banban_flavor_links.sql`](./pos_banban_flavor_links.sql) | |
| `pos_payment_method_items` + 시드 | [`../scripts/pos_payment_method_items.sql`](../scripts/pos_payment_method_items.sql) | |
| `pos_menu_screen_configs` / `pos_delivery_apps` / `pos_payment_settings` | scripts 3개 (§2 순서 10~12) | |
| `pos_orders` list 컬럼 ALTER | [`supabase_one_paste_pos_orders_list.sql`](./supabase_one_paste_pos_orders_list.sql) | |
| pos_orders/menus RLS | [`pos_orders_rls_bootstrap.sql`](./pos_orders_rls_bootstrap.sql) | |
| `to_regclass` 테이블 존재 확인 SELECT | **실행 불필요** | 진단용 |
| `pos_settlements` CREATE + align + index | [`pos_settlements_bootstrap.sql`](./pos_settlements_bootstrap.sql) + align | |
| 아속 결산 `SELECT` / `pg_stat_statements` | **실행 불필요** | 운영 조회용 |
| `get_pos_sales_period_summary` (2번 반복) | [`get_pos_sales_period_summary_deploy.sql`](./get_pos_sales_period_summary_deploy.sql) | **1번만** |
| `get_store_stock` 등 RPC | [`supabase_rpc_egress_helpers_deploy.sql`](./supabase_rpc_egress_helpers_deploy.sql) | |
| 5528·5529 계정과목 | [`account_subjects_delivery_card_fee.sql`](./account_subjects_delivery_card_fee.sql) | |
| 회원 CRM (3번 중복 붙여넣기) | [`members_crm_scale_phase1_to_4.sql`](./members_crm_scale_phase1_to_4.sql) | **1번만** |
| WeChat/Alipay/UnionPay | [`pos_payment_method_items_wechat_alipay_unionpay.sql`](./pos_payment_method_items_wechat_alipay_unionpay.sql) | |
| `member_portal_content` | [`member_portal_content_cms.sql`](./member_portal_content_cms.sql) | |

---

## 6. 진단 전용 (스키마 변경 없음)

결과만 보고 싶을 때 — **운영 장애 복구용이 아님**:

| 파일 | 용도 |
|---|---|
| [`pos_menu_code_dedupe_impact_checks.sql`](./pos_menu_code_dedupe_impact_checks.sql) | 메뉴 코드 중복·고아 참조 |
| [`pos_menu_fix_curry_garlic_barbq_option_ui.sql`](./pos_menu_fix_curry_garlic_barbq_option_ui.sql) 상단 SELECT | BBQ 옵션 적용 전후 비교 |
| [`accounting_legacy_cleanup_checks.sql`](./accounting_legacy_cleanup_checks.sql) | 회계 레거시 점검 |

---

## 7. 추천 Editor 북마크 (최소 3개)

1. **1차 전체** — [`supabase_one_paste_all_in_one.sql`](./supabase_one_paste_all_in_one.sql)
2. **2차 최근 기능** — [`supabase_one_paste_phase2.sql`](./supabase_one_paste_phase2.sql)
3. **K/T 메뉴 코드 복구** — [`supabase_one_paste_optional_menu_code_recovery.sql`](./supabase_one_paste_optional_menu_code_recovery.sql) (확인 후만)
4. **매장 alias 보강** — [`erp_stores_seed_all_aliases.sql`](./erp_stores_seed_all_aliases.sql) (필요할 때만)
5. **가이드** — `SUPABASE_EDITOR_RUNBOOK.md`

진단 SELECT만 필요할 때: [`supabase_editor_diagnostic_only.sql`](./supabase_editor_diagnostic_only.sql) (Editor에 상시 보관 X)
