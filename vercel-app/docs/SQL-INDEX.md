# SQL 인덱스 가이드

이 문서는 `vercel-app/sql` 아래 SQL 파일을 **빠르게 찾기 위한 인덱스**입니다.
기존 SQL 파일(문서·코드에서 경로로 참조됨)은 이동/개명하지 않고, 탐색성과 유지보수성을 높이는 목적입니다.
예외: 옛 루트 `supabase_*.sql`은 `sql/legacy/`, 참조 없는 진단 전용 `diagnose_*`는 `sql/archive/diagnose/`로 옮겼습니다. 맨 아래 §8에 전체 목록이 자동 생성됩니다.

**Supabase SQL Editor에 무엇을 붙여넣을지** → [`../sql/SUPABASE_EDITOR_RUNBOOK.md`](../sql/SUPABASE_EDITOR_RUNBOOK.md) (증상별·일괄 실행 순서)

## 1) 빠른 탐색 순서

1. 먼저 도메인(회계/인사/POS/마케팅/SaaS/물류)을 정합니다.
2. 그 다음 파일 유형(스키마/정책/RPC/일괄 스크립트)을 고릅니다.
3. 마지막으로 파일명 키워드로 좁힙니다. (`*_rpc.sql`, `*_rls_policies.sql`, `*_all_in_one.sql`)

## 2) 파일 유형 규칙

- `*_all_in_one.sql`: 여러 변경을 한 번에 적용하는 번들 스크립트
- `*_one_shot.sql`: 1회성 대규모 적용 스크립트
- `*_rpc.sql`: 함수(RPC) 추가/수정
- `*_rls_policies.sql`: RLS 정책 관련
- `*_foundation.sql`, `*_schema.sql`, `*_bootstrap.sql`: 기반 스키마/초기화

## 3) 도메인별 인덱스

| 도메인 | 주요 키워드 | 대표 파일 예시 |
|---|---|---|
| 회계/세무 | `accounting`, `tax`, `kt20k`, `vat`, `wht`, `account_subjects` | `accounting_identity_keys.sql`, `accounting_tax_upgrade_one_shot.sql`, `accounting_kt20k_summary_rpc.sql`, `tax_ledger_filing_status.sql`, `items_account_subject_id.sql` |
| POS/결제/프린터 | `pos_`, `linkpos`, `printer`, `settlements`, `customer_display`, `grab` | `pos_linkpos_payments.sql`, `pos_printer_kitchen_routes.sql`, `pos_printer_settings_rls_policies.sql`, `pos_settlements_other_breakdown.sql`, `pos_grab_store_integrations.sql`, `pos_grab_webhook_events.sql` |
| 인사/근태/급여 | `employees`, `attendance`, `payroll`, `hr_policies`, `leave` | `employees_employee_code_leave_employee_id.sql`, `attendance_employee_id_hardening.sql`, `attendance_schedule_employee_keys.sql`, `payroll_records_employee_keys.sql`, `hr_policies_hr_policy_reads.sql` |
| 물류/재고/출고 | `logistics`, `stock_logs`, `outbound`, `inbound` | `logistics_integrity_monitoring_batch.sql`, `logistics_hardening_and_monitoring_all_in_one.sql`, `stock_logs_soft_delete_outbound.sql`, `stock_logs_supabase_ram_indexes.sql`, `outbound_soft_delete_integrity_checks.sql` |
| 마케팅 | `marketing_` | `marketing_campaign_hub_extensions.sql`, `marketing_campaigns_rls_policies.sql`, `marketing_material_deployments.sql`, `marketing_material_gifts.sql`, `marketing_ads_content_detail.sql` |
| 멤버십/매장운영 | `members`, `store_repair`, `company_hybrid_documents` | `members_identity_source_convention.sql`, `store_repair_schema_all.sql`, `store_repair_tickets.sql`, `company_hybrid_documents.sql`, `company_hybrid_documents_all_in_one.sql` |
| SaaS/멀티테넌트 | `saas_` | `saas_base_schema.sql`, `saas_tenant_bootstrap.sql`, `saas_admin_control_plane.sql`, `saas_employees_add_nick.sql` |
| 공통 운영/안정성 | `idempotency`, `linter`, `public_tables` | `api_request_idempotency_keys.sql`, `pos_orders_idempotency_key_hash.sql`, `supabase_linter_function_search_path_fix.sql`, `rls_public_tables_supabase_linter_fix.sql` |

## 4) 실제 작업 시 권장 규칙

- 신규 SQL 파일명은 목적이 보이도록 명사형으로 작성합니다.
  - 예: `accounting_identity_keys.sql`, `pos_dual_monitor_idle_media.sql`
- 정책/함수/일괄 스크립트는 suffix를 유지합니다.
  - 정책: `*_rls_policies.sql`
  - 함수: `*_rpc.sql`
  - 일괄: `*_all_in_one.sql`, `*_one_shot.sql`
- 1회성 보정 SQL도 파일을 남기고, 적용 범위/주의점을 상단 주석에 기록합니다.

## 5) SQL 변경 체크리스트

- 테이블/컬럼/인덱스 생성 전 `IF NOT EXISTS` 고려
- 함수 변경 시 `CREATE OR REPLACE FUNCTION` 사용 여부 점검
- RLS 변경 시 대상 role(`anon`, `authenticated`, `service_role`) 확인
- 성능 이슈 가능 쿼리는 인덱스 영향 확인
- 운영 적용 전 스테이징에서 최소 1회 실행

## 6) 자주 사용하는 검색 패턴

- POS 관련: `pos_*.sql`
- 회계/세무: `accounting*.sql`, `*tax*.sql`, `*vat*.sql`
- 정책 파일: `*_rls_policies.sql`
- RPC 파일: `*_rpc.sql`
- 번들 파일: `*_all_in_one.sql`, `*_one_shot.sql`

## 7) 참고 문서

- DB 개요 및 주요 테이블: [`DATABASE.md`](./DATABASE.md)
- 전체 코드/기능 맵: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- 파일 정리 원칙: [`FILE-ORGANIZATION-GUIDE-KO.md`](./FILE-ORGANIZATION-GUIDE-KO.md)

<!-- sql-index:auto:start -->

## 8) 전체 파일 목록 (자동 생성)

> `npm run sql:index`로 갱신합니다. 이 구역은 직접 수정하지 마세요.
> 유형은 파일명으로 추정: preview·verify·diagnose(읽기) / apply·backfill·bundle·rpc·rls(변경). `log` = 끝에 `sql_applied_log` 기록 블록 있음.

- `sql/` 최상위: **746**개 · 접두어 그룹 **94**개
- `sql/legacy/` (옛 루트 `supabase_*.sql`): **144**개
- `sql/archive/` (진단 전용 등 보관): **49**개

<details><summary><code>pos_*</code> (214)</summary>

- [`pos_banban_flavor_links.sql`](../sql/pos_banban_flavor_links.sql)
- [`pos_business_day_start_system_settings.sql`](../sql/pos_business_day_start_system_settings.sql)
- [`pos_business_day_unify_06_global.sql`](../sql/pos_business_day_unify_06_global.sql)
- [`pos_business_day_unify_08_global.sql`](../sql/pos_business_day_unify_08_global.sql)
- [`pos_catalog_tenant_id.sql`](../sql/pos_catalog_tenant_id.sql)
- [`pos_channel_price_menu_grab_audit.sql`](../sql/pos_channel_price_menu_grab_audit.sql) — diagnose
- [`pos_channel_settlement_deploy_one_paste.sql`](../sql/pos_channel_settlement_deploy_one_paste.sql) — bundle
- [`pos_channel_settlements.sql`](../sql/pos_channel_settlements.sql)
- [`pos_chicken_classic_option_step_values_backfill.sql`](../sql/pos_chicken_classic_option_step_values_backfill.sql) — backfill
- [`pos_chicken_fill_option_steps_and_codes.sql`](../sql/pos_chicken_fill_option_steps_and_codes.sql)
- [`pos_chicken_vs_bbq_option_diff_audit.sql`](../sql/pos_chicken_vs_bbq_option_diff_audit.sql) — diagnose
- [`pos_close_runs.sql`](../sql/pos_close_runs.sql)
- [`pos_connected_devices_attendance_display_role.sql`](../sql/pos_connected_devices_attendance_display_role.sql)
- [`pos_connected_devices_display_label.sql`](../sql/pos_connected_devices_display_label.sql)
- [`pos_coupons_marketing_campaign_id.sql`](../sql/pos_coupons_marketing_campaign_id.sql)
- [`pos_coupons_portal_claim.sql`](../sql/pos_coupons_portal_claim.sql)
- [`pos_coupons_portal_image.sql`](../sql/pos_coupons_portal_image.sql)
- [`pos_crypto_payment.sql`](../sql/pos_crypto_payment.sql)
- [`pos_delivery_app_policies.sql`](../sql/pos_delivery_app_policies.sql)
- [`pos_delivery_app_settlement_fee_pct.sql`](../sql/pos_delivery_app_settlement_fee_pct.sql)
- [`pos_delivery_app_settlement_fee_pct_all_stores.sql`](../sql/pos_delivery_app_settlement_fee_pct_all_stores.sql)
- [`pos_deposit_ledger.sql`](../sql/pos_deposit_ledger.sql)
- [`pos_dual_monitor_customer_display.sql`](../sql/pos_dual_monitor_customer_display.sql)
- [`pos_dual_monitor_idle_media.sql`](../sql/pos_dual_monitor_idle_media.sql)
- [`pos_dual_monitor_language_override.sql`](../sql/pos_dual_monitor_language_override.sql)
- [`pos_employee_theft_suspect_01_store_rank.sql`](../sql/pos_employee_theft_suspect_01_store_rank.sql)
- [`pos_employee_theft_suspect_02_paid_then_cancel.sql`](../sql/pos_employee_theft_suspect_02_paid_then_cancel.sql)
- [`pos_employee_theft_suspect_03_unpaid_cancel_after_serve.sql`](../sql/pos_employee_theft_suspect_03_unpaid_cancel_after_serve.sql)
- [`pos_employee_theft_suspect_04_manual_discount_service.sql`](../sql/pos_employee_theft_suspect_04_manual_discount_service.sql)
- [`pos_employee_theft_suspect_05_pay_correct.sql`](../sql/pos_employee_theft_suspect_05_pay_correct.sql)
- [`pos_employee_theft_suspect_06_staff_concentration.sql`](../sql/pos_employee_theft_suspect_06_staff_concentration.sql)
- [`pos_grab_banban_flavor_diagnostic.sql`](../sql/pos_grab_banban_flavor_diagnostic.sql) — diagnose
- [`pos_grab_bangna_kitchen_diagnostic.sql`](../sql/pos_grab_bangna_kitchen_diagnostic.sql) — diagnose
- [`pos_grab_bangna_size_diagnostic.sql`](../sql/pos_grab_bangna_size_diagnostic.sql) — diagnose
- [`pos_grab_member_point_menu_image_01_lookup.sql`](../sql/pos_grab_member_point_menu_image_01_lookup.sql) — diagnose
- [`pos_grab_member_point_menu_image_02_delivery_override.sql`](../sql/pos_grab_member_point_menu_image_02_delivery_override.sql)
- [`pos_grab_member_point_menu_image_03_true_store.sql`](../sql/pos_grab_member_point_menu_image_03_true_store.sql)
- [`pos_grab_member_point_menu_image_04_copy_override_preview.sql`](../sql/pos_grab_member_point_menu_image_04_copy_override_preview.sql) — preview
- [`pos_grab_member_point_menu_image_05_copy_override_upsert.sql`](../sql/pos_grab_member_point_menu_image_05_copy_override_upsert.sql) — apply
- [`pos_grab_member_point_menu_image_06_use_working_photo_abtest.sql`](../sql/pos_grab_member_point_menu_image_06_use_working_photo_abtest.sql)
- [`pos_grab_store_integrations.sql`](../sql/pos_grab_store_integrations.sql)
- [`pos_grab_the_street_menu_diagnostic.sql`](../sql/pos_grab_the_street_menu_diagnostic.sql) — diagnose
- [`pos_grab_webhook_events.sql`](../sql/pos_grab_webhook_events.sql)
- [`pos_hardening_phase2.sql`](../sql/pos_hardening_phase2.sql)
- [`pos_kitchen_printer_audit_and_fix_20260515.sql`](../sql/pos_kitchen_printer_audit_and_fix_20260515.sql) — diagnose, apply
- [`pos_kitchen_printer_audit_route_map_mismatch.sql`](../sql/pos_kitchen_printer_audit_route_map_mismatch.sql) — diagnose
- [`pos_linkpos_force_manual_card_all_stores.sql`](../sql/pos_linkpos_force_manual_card_all_stores.sql)
- [`pos_linkpos_payments.sql`](../sql/pos_linkpos_payments.sql)
- [`pos_linkpos_retry_trace.sql`](../sql/pos_linkpos_retry_trace.sql)
- [`pos_linkpos_tender_rules.sql`](../sql/pos_linkpos_tender_rules.sql)
- [`pos_membership_qr_all_stores.sql`](../sql/pos_membership_qr_all_stores.sql)
- [`pos_menu_assign_tteokbokki_codes.sql`](../sql/pos_menu_assign_tteokbokki_codes.sql)
- [`pos_menu_audit_logs.sql`](../sql/pos_menu_audit_logs.sql) — diagnose
- [`pos_menu_banban_size_s_qr_off_01_preview.sql`](../sql/pos_menu_banban_size_s_qr_off_01_preview.sql) — preview
- [`pos_menu_boards.sql`](../sql/pos_menu_boards.sql)
- [`pos_menu_bom_previous_values_diagnostic.sql`](../sql/pos_menu_bom_previous_values_diagnostic.sql) — diagnose
- [`pos_menu_bom_restore_tteokbokki_from_dosirak.sql`](../sql/pos_menu_bom_restore_tteokbokki_from_dosirak.sql)
- [`pos_menu_chicken_dosirak_k031_k032_bom_apply.sql`](../sql/pos_menu_chicken_dosirak_k031_k032_bom_apply.sql) — apply
- [`pos_menu_chicken_image_audit_diagnostic.sql`](../sql/pos_menu_chicken_image_audit_diagnostic.sql) — diagnose
- [`pos_menu_chicken_image_diagnostic.sql`](../sql/pos_menu_chicken_image_diagnostic.sql) — diagnose
- [`pos_menu_clear_chicken_images.sql`](../sql/pos_menu_clear_chicken_images.sql)
- [`pos_menu_code_centered_reseed_tteok_dosirak.sql`](../sql/pos_menu_code_centered_reseed_tteok_dosirak.sql)
- [`pos_menu_code_dedupe_impact_checks.sql`](../sql/pos_menu_code_dedupe_impact_checks.sql) — verify
- [`pos_menu_code_lock_and_dedupe.sql`](../sql/pos_menu_code_lock_and_dedupe.sql)
- [`pos_menu_descriptions.sql`](../sql/pos_menu_descriptions.sql)
- [`pos_menu_dosirak_bom_apply_by_id.sql`](../sql/pos_menu_dosirak_bom_apply_by_id.sql) — apply
- [`pos_menu_dosirak_only_pitr_restore.sql`](../sql/pos_menu_dosirak_only_pitr_restore.sql)
- [`pos_menu_emergency_safe_restore_from_previous_snapshot.sql`](../sql/pos_menu_emergency_safe_restore_from_previous_snapshot.sql)
- [`pos_menu_fix_bbq_m_group_key.sql`](../sql/pos_menu_fix_bbq_m_group_key.sql) — apply
- [`pos_menu_fix_bbq_m_sell_delivery.sql`](../sql/pos_menu_fix_bbq_m_sell_delivery.sql) — apply
- [`pos_menu_fix_chicken_images_strict.sql`](../sql/pos_menu_fix_chicken_images_strict.sql) — apply
- [`pos_menu_fix_curry_garlic_barbq_option_ui.sql`](../sql/pos_menu_fix_curry_garlic_barbq_option_ui.sql) — apply
- [`pos_menu_fix_supreme_chicken_delivery_options.sql`](../sql/pos_menu_fix_supreme_chicken_delivery_options.sql) — apply
- [`pos_menu_fix_supreme_chicken_empty_picker_01_preview.sql`](../sql/pos_menu_fix_supreme_chicken_empty_picker_01_preview.sql) — preview, apply
- [`pos_menu_fix_supreme_chicken_empty_picker_02_apply.sql`](../sql/pos_menu_fix_supreme_chicken_empty_picker_02_apply.sql) — apply
- [`pos_menu_fix_supreme_chicken_empty_picker_03_verify.sql`](../sql/pos_menu_fix_supreme_chicken_empty_picker_03_verify.sql) — verify, apply
- [`pos_menu_fix_supreme_chicken_empty_picker_04_preview_links.sql`](../sql/pos_menu_fix_supreme_chicken_empty_picker_04_preview_links.sql) — preview, apply
- [`pos_menu_fix_supreme_chicken_empty_picker_05_unlink_size_part.sql`](../sql/pos_menu_fix_supreme_chicken_empty_picker_05_unlink_size_part.sql) — apply
- [`pos_menu_fix_supreme_chicken_empty_picker_06_verify_links.sql`](../sql/pos_menu_fix_supreme_chicken_empty_picker_06_verify_links.sql) — verify, apply
- [`pos_menu_fix_supreme_chicken_empty_picker_07_clear_empty_groups.sql`](../sql/pos_menu_fix_supreme_chicken_empty_picker_07_clear_empty_groups.sql) — apply
- [`pos_menu_fix_supreme_chicken_empty_picker_08_verify_clear.sql`](../sql/pos_menu_fix_supreme_chicken_empty_picker_08_verify_clear.sql) — verify, apply
- [`pos_menu_fk_recover_after_wrong_canonical.sql`](../sql/pos_menu_fk_recover_after_wrong_canonical.sql)
- [`pos_menu_garlic_bbq_off_01_flags.sql`](../sql/pos_menu_garlic_bbq_off_01_flags.sql)
- [`pos_menu_garlic_bbq_off_02_silom_grab_policy.sql`](../sql/pos_menu_garlic_bbq_off_02_silom_grab_policy.sql)
- [`pos_menu_garlic_bbq_off_03_audit.sql`](../sql/pos_menu_garlic_bbq_off_03_audit.sql) — diagnose
- [`pos_menu_garlic_bbq_off_04_all_stores_grab.sql`](../sql/pos_menu_garlic_bbq_off_04_all_stores_grab.sql)
- [`pos_menu_garlic_bbq_off_05_silom_scope.sql`](../sql/pos_menu_garlic_bbq_off_05_silom_scope.sql)
- [`pos_menu_image_menu_id_mismatch_audit.sql`](../sql/pos_menu_image_menu_id_mismatch_audit.sql) — diagnose
- [`pos_menu_images_storage_bucket.sql`](../sql/pos_menu_images_storage_bucket.sql)
- [`pos_menu_ingredients_audit.sql`](../sql/pos_menu_ingredients_audit.sql) — diagnose
- [`pos_menu_ingredients_code_guard.sql`](../sql/pos_menu_ingredients_code_guard.sql)
- [`pos_menu_ingredients_quantity_unit_key.sql`](../sql/pos_menu_ingredients_quantity_unit_key.sql)
- [`pos_menu_ingredients_rls_policies.sql`](../sql/pos_menu_ingredients_rls_policies.sql) — rls
- [`pos_menu_ingredients_rls_select.sql`](../sql/pos_menu_ingredients_rls_select.sql) — rls
- [`pos_menu_integrity_global_audit.sql`](../sql/pos_menu_integrity_global_audit.sql) — diagnose
- [`pos_menu_kitchen_printer_dosirak_duplicate_fix.sql`](../sql/pos_menu_kitchen_printer_dosirak_duplicate_fix.sql) — apply
- [`pos_menu_option_code_prefix_autofix.sql`](../sql/pos_menu_option_code_prefix_autofix.sql)
- [`pos_menu_option_groups_autoclean.sql`](../sql/pos_menu_option_groups_autoclean.sql)
- [`pos_menu_option_selection_config.sql`](../sql/pos_menu_option_selection_config.sql)
- [`pos_menu_options_additive_source_menu.sql`](../sql/pos_menu_options_additive_source_menu.sql)
- [`pos_menu_options_option_code.sql`](../sql/pos_menu_options_option_code.sql)
- [`pos_menu_packaging_check_items.sql`](../sql/pos_menu_packaging_check_items.sql) — verify
- [`pos_menu_recover_k_dosirak_codes.sql`](../sql/pos_menu_recover_k_dosirak_codes.sql)
- [`pos_menu_restore_c005_soy_spring_onion_options.sql`](../sql/pos_menu_restore_c005_soy_spring_onion_options.sql)
- [`pos_menu_restore_image_from_audit.sql`](../sql/pos_menu_restore_image_from_audit.sql) — diagnose
- [`pos_menu_restore_image_precheck.sql`](../sql/pos_menu_restore_image_precheck.sql)
- [`pos_menu_restore_image_remaining_chicken.sql`](../sql/pos_menu_restore_image_remaining_chicken.sql)
- [`pos_menu_restore_snow_onion_dosirak.sql`](../sql/pos_menu_restore_snow_onion_dosirak.sql)
- [`pos_menu_restore_snow_series_part_options.sql`](../sql/pos_menu_restore_snow_series_part_options.sql)
- [`pos_menu_soy_sauce_chicken_missing_01_flags.sql`](../sql/pos_menu_soy_sauce_chicken_missing_01_flags.sql)
- [`pos_menu_soy_sauce_chicken_missing_02_store_scope.sql`](../sql/pos_menu_soy_sauce_chicken_missing_02_store_scope.sql)
- [`pos_menu_soy_sauce_chicken_missing_03_scope_gaps.sql`](../sql/pos_menu_soy_sauce_chicken_missing_03_scope_gaps.sql)
- [`pos_menu_soy_sauce_chicken_missing_04_audit.sql`](../sql/pos_menu_soy_sauce_chicken_missing_04_audit.sql) — diagnose
- [`pos_menu_soy_sauce_chicken_missing_05_same_time_scopes.sql`](../sql/pos_menu_soy_sauce_chicken_missing_05_same_time_scopes.sql)
- [`pos_menu_soy_sauce_chicken_missing_06_original_scope_compare.sql`](../sql/pos_menu_soy_sauce_chicken_missing_06_original_scope_compare.sql)
- [`pos_menu_soy_sauce_chicken_missing_07_scope_row_count.sql`](../sql/pos_menu_soy_sauce_chicken_missing_07_scope_row_count.sql)
- [`pos_menu_soy_sauce_chicken_missing_08_truncated_c010.sql`](../sql/pos_menu_soy_sauce_chicken_missing_08_truncated_c010.sql)
- [`pos_menu_store_scope_backfill.sql`](../sql/pos_menu_store_scope_backfill.sql) — backfill
- [`pos_menu_store_scope_empty_audit.sql`](../sql/pos_menu_store_scope_empty_audit.sql) — diagnose
- [`pos_menu_store_scope_s011_s012_diagnostic.sql`](../sql/pos_menu_store_scope_s011_s012_diagnostic.sql) — diagnose
- [`pos_menu_store_scope_sync_from_pos_visibility.sql`](../sql/pos_menu_store_scope_sync_from_pos_visibility.sql)
- [`pos_menu_store_scopes_create.sql`](../sql/pos_menu_store_scopes_create.sql)
- [`pos_menu_store_sold_out_01_create.sql`](../sql/pos_menu_store_sold_out_01_create.sql)
- [`pos_menu_store_sold_out_02_verify.sql`](../sql/pos_menu_store_sold_out_02_verify.sql) — verify
- [`pos_menu_store_sold_out_03_sample.sql`](../sql/pos_menu_store_sold_out_03_sample.sql)
- [`pos_menu_sync_mirror_image_from_promo_items.sql`](../sql/pos_menu_sync_mirror_image_from_promo_items.sql)
- [`pos_menu_tteok_dosirak_bom_apply_by_id.sql`](../sql/pos_menu_tteok_dosirak_bom_apply_by_id.sql) — apply
- [`pos_menu_tteokbokki_pitr_recovery_playbook.sql`](../sql/pos_menu_tteokbokki_pitr_recovery_playbook.sql)
- [`pos_menus_buffet_includable.sql`](../sql/pos_menus_buffet_includable.sql)
- [`pos_menus_delivery_app_fee_percent.sql`](../sql/pos_menus_delivery_app_fee_percent.sql)
- [`pos_menus_guest_i18n.sql`](../sql/pos_menus_guest_i18n.sql)
- [`pos_menus_rls_policies.sql`](../sql/pos_menus_rls_policies.sql) — rls
- [`pos_menus_sell_channels.sql`](../sql/pos_menus_sell_channels.sql)
- [`pos_menus_sell_member.sql`](../sql/pos_menus_sell_member.sql)
- [`pos_multi_coupon.sql`](../sql/pos_multi_coupon.sql)
- [`pos_open_1001_20260923_01_check.sql`](../sql/pos_open_1001_20260923_01_check.sql) — verify
- [`pos_option_groups_group_code.sql`](../sql/pos_option_groups_group_code.sql)
- [`pos_option_groups_master_and_menu_links.sql`](../sql/pos_option_groups_master_and_menu_links.sql)
- [`pos_order_audit_trail.sql`](../sql/pos_order_audit_trail.sql) — diagnose
- [`pos_order_events.sql`](../sql/pos_order_events.sql)
- [`pos_order_no_counter_rpc.sql`](../sql/pos_order_no_counter_rpc.sql) — rpc
- [`pos_orders_advance_deposit.sql`](../sql/pos_orders_advance_deposit.sql)
- [`pos_orders_clear_non_dine_in_table_name_ekkamai.sql`](../sql/pos_orders_clear_non_dine_in_table_name_ekkamai.sql)
- [`pos_orders_collab_discount_amt.sql`](../sql/pos_orders_collab_discount_amt.sql)
- [`pos_orders_delivery_app_code.sql`](../sql/pos_orders_delivery_app_code.sql)
- [`pos_orders_fee_snapshot.sql`](../sql/pos_orders_fee_snapshot.sql)
- [`pos_orders_guest_count.sql`](../sql/pos_orders_guest_count.sql)
- [`pos_orders_idempotency_key_hash.sql`](../sql/pos_orders_idempotency_key_hash.sql)
- [`pos_orders_list_api_bootstrap.sql`](../sql/pos_orders_list_api_bootstrap.sql)
- [`pos_orders_paid_at.sql`](../sql/pos_orders_paid_at.sql)
- [`pos_orders_payment_delivery_app.sql`](../sql/pos_orders_payment_delivery_app.sql)
- [`pos_orders_payment_other_breakdown.sql`](../sql/pos_orders_payment_other_breakdown.sql)
- [`pos_orders_rls_bootstrap.sql`](../sql/pos_orders_rls_bootstrap.sql) — rls
- [`pos_orders_service_amount_columns.sql`](../sql/pos_orders_service_amount_columns.sql)
- [`pos_payment_cash_tendered.sql`](../sql/pos_payment_cash_tendered.sql)
- [`pos_payment_method_items_wechat_alipay_unionpay.sql`](../sql/pos_payment_method_items_wechat_alipay_unionpay.sql)
- [`pos_print_jobs.sql`](../sql/pos_print_jobs.sql)
- [`pos_print_jobs_realtime_insert.sql`](../sql/pos_print_jobs_realtime_insert.sql) — apply
- [`pos_print_jobs_select_realtime.sql`](../sql/pos_print_jobs_select_realtime.sql)
- [`pos_printer_kitchen3.sql`](../sql/pos_printer_kitchen3.sql)
- [`pos_printer_kitchen_option_group_print.sql`](../sql/pos_printer_kitchen_option_group_print.sql)
- [`pos_printer_kitchen_routes.sql`](../sql/pos_printer_kitchen_routes.sql)
- [`pos_printer_kitchen_slip_design.sql`](../sql/pos_printer_kitchen_slip_design.sql)
- [`pos_printer_print_layout_calibration.sql`](../sql/pos_printer_print_layout_calibration.sql)
- [`pos_printer_receipt_custom_assets.sql`](../sql/pos_printer_receipt_custom_assets.sql)
- [`pos_printer_receipt_show_biz_address.sql`](../sql/pos_printer_receipt_show_biz_address.sql)
- [`pos_printer_settings_auto_print_final_before_payment.sql`](../sql/pos_printer_settings_auto_print_final_before_payment.sql)
- [`pos_printer_settings_auto_print_on_cancel.sql`](../sql/pos_printer_settings_auto_print_on_cancel.sql)
- [`pos_printer_settings_bootstrap_and_esc_pos_cut.sql`](../sql/pos_printer_settings_bootstrap_and_esc_pos_cut.sql)
- [`pos_printer_settings_device_role_limits.sql`](../sql/pos_printer_settings_device_role_limits.sql)
- [`pos_printer_settings_drawer_pin.sql`](../sql/pos_printer_settings_drawer_pin.sql)
- [`pos_printer_settings_fee_stack.sql`](../sql/pos_printer_settings_fee_stack.sql)
- [`pos_printer_settings_hide_buffet_included_on_guest_bill.sql`](../sql/pos_printer_settings_hide_buffet_included_on_guest_bill.sql)
- [`pos_printer_settings_kbank_mid.sql`](../sql/pos_printer_settings_kbank_mid.sql)
- [`pos_printer_settings_kbank_skip_api_for_qr.sql`](../sql/pos_printer_settings_kbank_skip_api_for_qr.sql)
- [`pos_printer_settings_linkpos_skip_terminal.sql`](../sql/pos_printer_settings_linkpos_skip_terminal.sql)
- [`pos_printer_settings_payment_total_rounding_mode.sql`](../sql/pos_printer_settings_payment_total_rounding_mode.sql)
- [`pos_printer_settings_qr_display_mode.sql`](../sql/pos_printer_settings_qr_display_mode.sql)
- [`pos_printer_settings_require_guest_count.sql`](../sql/pos_printer_settings_require_guest_count.sql)
- [`pos_printer_settings_rls_policies.sql`](../sql/pos_printer_settings_rls_policies.sql) — rls
- [`pos_promo_extensions.sql`](../sql/pos_promo_extensions.sql)
- [`pos_promo_items_choice_group_columns.sql`](../sql/pos_promo_items_choice_group_columns.sql)
- [`pos_promo_items_option_code_column.sql`](../sql/pos_promo_items_option_code_column.sql)
- [`pos_promo_items_rls_policies.sql`](../sql/pos_promo_items_rls_policies.sql) — rls
- [`pos_promo_items_unique_by_choice_group.sql`](../sql/pos_promo_items_unique_by_choice_group.sql)
- [`pos_promo_mirror_image_audit.sql`](../sql/pos_promo_mirror_image_audit.sql) — diagnose
- [`pos_promo_mirror_image_fix_side_copy.sql`](../sql/pos_promo_mirror_image_fix_side_copy.sql) — apply
- [`pos_promo_simulation_runs.sql`](../sql/pos_promo_simulation_runs.sql)
- [`pos_promo_templates.sql`](../sql/pos_promo_templates.sql)
- [`pos_promos_compose_pricing_basis.sql`](../sql/pos_promos_compose_pricing_basis.sql)
- [`pos_promos_grab_campaign_time_bkk.sql`](../sql/pos_promos_grab_campaign_time_bkk.sql)
- [`pos_promos_indexes_constraints.sql`](../sql/pos_promos_indexes_constraints.sql)
- [`pos_promos_legacy_code_migration.sql`](../sql/pos_promos_legacy_code_migration.sql)
- [`pos_promos_rls_policies.sql`](../sql/pos_promos_rls_policies.sql) — rls
- [`pos_promotion_main_category_promotion.sql`](../sql/pos_promotion_main_category_promotion.sql)
- [`pos_purge_all_orders_for_go_live.sql`](../sql/pos_purge_all_orders_for_go_live.sql)
- [`pos_qr_guest_bill_pay_enabled_01_ddl.sql`](../sql/pos_qr_guest_bill_pay_enabled_01_ddl.sql)
- [`pos_qr_guest_bill_pay_enabled_02_union_mall_off.sql`](../sql/pos_qr_guest_bill_pay_enabled_02_union_mall_off.sql)
- [`pos_qr_hidden_menu_ids_01_ddl.sql`](../sql/pos_qr_hidden_menu_ids_01_ddl.sql) — log
- [`pos_qr_hidden_menu_ids_02_verify.sql`](../sql/pos_qr_hidden_menu_ids_02_verify.sql) — verify
- [`pos_qr_table_order_buffet.sql`](../sql/pos_qr_table_order_buffet.sql)
- [`pos_qr_table_order_extra_menus.sql`](../sql/pos_qr_table_order_extra_menus.sql)
- [`pos_qr_table_order_omni_pilot.sql`](../sql/pos_qr_table_order_omni_pilot.sql)
- [`pos_qr_table_order_ops_upgrade.sql`](../sql/pos_qr_table_order_ops_upgrade.sql)
- [`pos_qr_table_order_print_brand.sql`](../sql/pos_qr_table_order_print_brand.sql)
- [`pos_sales_payment_tender_gap_diagnostic.sql`](../sql/pos_sales_payment_tender_gap_diagnostic.sql) — diagnose
- [`pos_settlements_align_app_columns.sql`](../sql/pos_settlements_align_app_columns.sql)
- [`pos_settlements_bootstrap.sql`](../sql/pos_settlements_bootstrap.sql)
- [`pos_settlements_cash_actual_denoms.sql`](../sql/pos_settlements_cash_actual_denoms.sql)
- [`pos_settlements_dine_in_delivery.sql`](../sql/pos_settlements_dine_in_delivery.sql)
- [`pos_settlements_other_breakdown.sql`](../sql/pos_settlements_other_breakdown.sql)
- [`pos_tax_invoice_recipients.sql`](../sql/pos_tax_invoice_recipients.sql)
- [`pos_tax_invoice_recipients_shared_pool.sql`](../sql/pos_tax_invoice_recipients_shared_pool.sql)
- [`pos_tier_discount_amt.sql`](../sql/pos_tier_discount_amt.sql)

</details>

<details><summary><code>omni_*</code> (49)</summary>

- [`omni_attendance_logs_employee_code_01_alter.sql`](../sql/omni_attendance_logs_employee_code_01_alter.sql)
- [`omni_attendance_logs_employee_id_01_alter.sql`](../sql/omni_attendance_logs_employee_id_01_alter.sql)
- [`omni_attendance_logs_employee_id_02_index.sql`](../sql/omni_attendance_logs_employee_id_02_index.sql)
- [`omni_employees_company_backfill_01_preview.sql`](../sql/omni_employees_company_backfill_01_preview.sql) — preview, backfill
- [`omni_employees_company_backfill_02_update.sql`](../sql/omni_employees_company_backfill_02_update.sql) — backfill, apply
- [`omni_employees_tenant_id.sql`](../sql/omni_employees_tenant_id.sql)
- [`omni_inbound_batches_01_create.sql`](../sql/omni_inbound_batches_01_create.sql)
- [`omni_inbound_batches_02_verify.sql`](../sql/omni_inbound_batches_02_verify.sql) — verify
- [`omni_item_categories_01_create.sql`](../sql/omni_item_categories_01_create.sql)
- [`omni_item_categories_02_verify.sql`](../sql/omni_item_categories_02_verify.sql) — verify
- [`omni_item_categories_03_reset_default.sql`](../sql/omni_item_categories_03_reset_default.sql)
- [`omni_item_categories_04_list.sql`](../sql/omni_item_categories_04_list.sql)
- [`omni_items_save_columns_01_alter.sql`](../sql/omni_items_save_columns_01_alter.sql)
- [`omni_items_save_columns_02_verify.sql`](../sql/omni_items_save_columns_02_verify.sql) — verify
- [`omni_missing_columns_42703_patch.sql`](../sql/omni_missing_columns_42703_patch.sql)
- [`omni_missing_objects_01_apply.sql`](../sql/omni_missing_objects_01_apply.sql) — apply
- [`omni_missing_objects_02_verify.sql`](../sql/omni_missing_objects_02_verify.sql) — verify
- [`omni_missing_objects_03_apply.sql`](../sql/omni_missing_objects_03_apply.sql) — apply
- [`omni_missing_objects_04_verify.sql`](../sql/omni_missing_objects_04_verify.sql) — verify
- [`omni_payroll_records_early_ded_01_alter.sql`](../sql/omni_payroll_records_early_ded_01_alter.sql)
- [`omni_payroll_records_early_ded_02_verify.sql`](../sql/omni_payroll_records_early_ded_02_verify.sql) — verify
- [`omni_pos_anon_deny_rls.sql`](../sql/omni_pos_anon_deny_rls.sql) — rls
- [`omni_pos_choongman_parity.sql`](../sql/omni_pos_choongman_parity.sql)
- [`omni_pos_connected_devices.sql`](../sql/omni_pos_connected_devices.sql)
- [`omni_pos_menu_ingredients_channel_scope_01_alter.sql`](../sql/omni_pos_menu_ingredients_channel_scope_01_alter.sql)
- [`omni_pos_menu_ingredients_channel_scope_02_verify.sql`](../sql/omni_pos_menu_ingredients_channel_scope_02_verify.sql) — verify
- [`omni_pos_menu_ingredients_ingredient_type_01_alter.sql`](../sql/omni_pos_menu_ingredients_ingredient_type_01_alter.sql)
- [`omni_pos_menu_ingredients_ingredient_type_02_verify.sql`](../sql/omni_pos_menu_ingredients_ingredient_type_02_verify.sql) — verify
- [`omni_pos_orders_idempotency_tenant_01.sql`](../sql/omni_pos_orders_idempotency_tenant_01.sql)
- [`omni_pos_printer_settings_full_columns.sql`](../sql/omni_pos_printer_settings_full_columns.sql)
- [`omni_readiness_audit_01_objects.sql`](../sql/omni_readiness_audit_01_objects.sql) — diagnose
- [`omni_readiness_audit_02_rls_uniques.sql`](../sql/omni_readiness_audit_02_rls_uniques.sql) — diagnose, rls
- [`omni_rls_deny_items_stock_payroll_01.sql`](../sql/omni_rls_deny_items_stock_payroll_01.sql) — rls
- [`omni_rls_deny_open_policies_01.sql`](../sql/omni_rls_deny_open_policies_01.sql) — rls
- [`omni_saas_choongman_bridge.sql`](../sql/omni_saas_choongman_bridge.sql)
- [`omni_saas_login_security.sql`](../sql/omni_saas_login_security.sql)
- [`omni_sauces_01_create.sql`](../sql/omni_sauces_01_create.sql)
- [`omni_sauces_02_verify.sql`](../sql/omni_sauces_02_verify.sql) — verify
- [`omni_supabase_bootstrap_preflight.sql`](../sql/omni_supabase_bootstrap_preflight.sql)
- [`omni_tenant_store_keys_01_preview.sql`](../sql/omni_tenant_store_keys_01_preview.sql) — preview
- [`omni_tenant_store_keys_02_apply.sql`](../sql/omni_tenant_store_keys_02_apply.sql) — apply
- [`omni_tenant_store_keys_03_catalog_company.sql`](../sql/omni_tenant_store_keys_03_catalog_company.sql)
- [`omni_tenant_store_keys_04_blank_tenant_counts.sql`](../sql/omni_tenant_store_keys_04_blank_tenant_counts.sql)
- [`omni_tenant_store_keys_05_members_by_tenant.sql`](../sql/omni_tenant_store_keys_05_members_by_tenant.sql)
- [`omni_tenant_uniques_staff_menu_01.sql`](../sql/omni_tenant_uniques_staff_menu_01.sql)
- [`omni_vendors_missing_columns.sql`](../sql/omni_vendors_missing_columns.sql)
- [`omni_warehouse_locations_01_list.sql`](../sql/omni_warehouse_locations_01_list.sql)
- [`omni_warehouse_locations_02_seed_usage.sql`](../sql/omni_warehouse_locations_02_seed_usage.sql)
- [`omni_warehouse_locations_03_delete_unused_seed.sql`](../sql/omni_warehouse_locations_03_delete_unused_seed.sql) — apply

</details>

<details><summary><code>member_*</code> (36)</summary>

- [`member_coupon_promo_codes.sql`](../sql/member_coupon_promo_codes.sql)
- [`member_import_duplicate_check.sql`](../sql/member_import_duplicate_check.sql) — verify
- [`member_import_merge_candidates.sql`](../sql/member_import_merge_candidates.sql)
- [`member_join_store_code.sql`](../sql/member_join_store_code.sql)
- [`member_line_carryover_points_01_customer.sql`](../sql/member_line_carryover_points_01_customer.sql)
- [`member_line_carryover_points_02_customer_ledger.sql`](../sql/member_line_carryover_points_02_customer_ledger.sql)
- [`member_line_carryover_points_03_scope.sql`](../sql/member_line_carryover_points_03_scope.sql)
- [`member_line_carryover_points_04_preview.sql`](../sql/member_line_carryover_points_04_preview.sql) — preview
- [`member_line_carryover_points_05_apply.sql`](../sql/member_line_carryover_points_05_apply.sql) — apply, log
- [`member_line_carryover_points_06_verify.sql`](../sql/member_line_carryover_points_06_verify.sql) — verify
- [`member_line_carryover_points_07_redeem_impact.sql`](../sql/member_line_carryover_points_07_redeem_impact.sql)
- [`member_line_carryover_points_08_outliers.sql`](../sql/member_line_carryover_points_08_outliers.sql)
- [`member_line_carryover_points_09_check_outliers.sql`](../sql/member_line_carryover_points_09_check_outliers.sql) — verify
- [`member_line_carryover_points_10_rollback_m001670.sql`](../sql/member_line_carryover_points_10_rollback_m001670.sql) — log
- [`member_line_carryover_points_11_tier_preview.sql`](../sql/member_line_carryover_points_11_tier_preview.sql) — preview
- [`member_line_carryover_points_12_tier_apply.sql`](../sql/member_line_carryover_points_12_tier_apply.sql) — apply, log
- [`member_line_reach_breakdown_01_by_source.sql`](../sql/member_line_reach_breakdown_01_by_source.sql)
- [`member_line_reach_breakdown_02_unreachable_targets.sql`](../sql/member_line_reach_breakdown_02_unreachable_targets.sql)
- [`member_line_reach_breakdown_03_real_visitors.sql`](../sql/member_line_reach_breakdown_03_real_visitors.sql)
- [`member_point_expiry_policy.sql`](../sql/member_point_expiry_policy.sql)
- [`member_point_retention_years_setting.sql`](../sql/member_point_retention_years_setting.sql)
- [`member_points_decimal.sql`](../sql/member_points_decimal.sql)
- [`member_points_search_cursor.sql`](../sql/member_points_search_cursor.sql)
- [`member_portal_content_cms.sql`](../sql/member_portal_content_cms.sql)
- [`member_portal_content_storage_bucket.sql`](../sql/member_portal_content_storage_bucket.sql)
- [`member_portal_prepay_all_public_01_enable.sql`](../sql/member_portal_prepay_all_public_01_enable.sql)
- [`member_portal_prepay_all_public_02_verify.sql`](../sql/member_portal_prepay_all_public_02_verify.sql) — verify
- [`member_portal_prepay_office_pilot.sql`](../sql/member_portal_prepay_office_pilot.sql)
- [`member_signup_store_all_in_one.sql`](../sql/member_signup_store_all_in_one.sql) — bundle
- [`member_signup_store_enhancements.sql`](../sql/member_signup_store_enhancements.sql)
- [`member_stamp_card.sql`](../sql/member_stamp_card.sql)
- [`member_stamp_card_enhancements.sql`](../sql/member_stamp_card_enhancements.sql)
- [`member_tier_discount_rate.sql`](../sql/member_tier_discount_rate.sql)
- [`member_tier_upgrade_basis.sql`](../sql/member_tier_upgrade_basis.sql)
- [`member_tiers_portal_benefits.sql`](../sql/member_tiers_portal_benefits.sql)
- [`member_visit_analysis_rpc.sql`](../sql/member_visit_analysis_rpc.sql) — rpc

</details>

<details><summary><code>marketing_*</code> (35)</summary>

- [`marketing_ads_content_detail.sql`](../sql/marketing_ads_content_detail.sql)
- [`marketing_ads_period_end.sql`](../sql/marketing_ads_period_end.sql)
- [`marketing_campaign_design_tasks.sql`](../sql/marketing_campaign_design_tasks.sql)
- [`marketing_campaign_hub_extensions.sql`](../sql/marketing_campaign_hub_extensions.sql)
- [`marketing_campaign_number.sql`](../sql/marketing_campaign_number.sql)
- [`marketing_campaign_other_cost.sql`](../sql/marketing_campaign_other_cost.sql)
- [`marketing_campaign_types.sql`](../sql/marketing_campaign_types.sql)
- [`marketing_campaigns_apply_all.sql`](../sql/marketing_campaigns_apply_all.sql) — apply
- [`marketing_campaigns_collab_detail.sql`](../sql/marketing_campaigns_collab_detail.sql)
- [`marketing_campaigns_collab_management.sql`](../sql/marketing_campaigns_collab_management.sql)
- [`marketing_campaigns_count_check.sql`](../sql/marketing_campaigns_count_check.sql) — verify
- [`marketing_campaigns_discount_target_audience.sql`](../sql/marketing_campaigns_discount_target_audience.sql)
- [`marketing_campaigns_phase_periods.sql`](../sql/marketing_campaigns_phase_periods.sql)
- [`marketing_campaigns_rls_policies.sql`](../sql/marketing_campaigns_rls_policies.sql) — rls
- [`marketing_campaigns_vercel_api_bootstrap.sql`](../sql/marketing_campaigns_vercel_api_bootstrap.sql)
- [`marketing_expense_accrual_link.sql`](../sql/marketing_expense_accrual_link.sql)
- [`marketing_influencer_profiles_01_table.sql`](../sql/marketing_influencer_profiles_01_table.sql)
- [`marketing_influencer_profiles_02_alter_posts.sql`](../sql/marketing_influencer_profiles_02_alter_posts.sql)
- [`marketing_influencer_profiles_03_rls.sql`](../sql/marketing_influencer_profiles_03_rls.sql) — rls
- [`marketing_influencer_profiles_04_backfill_preview.sql`](../sql/marketing_influencer_profiles_04_backfill_preview.sql) — preview, backfill
- [`marketing_influencer_profiles_05_backfill.sql`](../sql/marketing_influencer_profiles_05_backfill.sql) — backfill
- [`marketing_influencer_profiles_06_post_job_columns.sql`](../sql/marketing_influencer_profiles_06_post_job_columns.sql)
- [`marketing_influencers_contact_menus.sql`](../sql/marketing_influencers_contact_menus.sql)
- [`marketing_material_deployments.sql`](../sql/marketing_material_deployments.sql)
- [`marketing_material_gifts.sql`](../sql/marketing_material_gifts.sql)
- [`marketing_material_install_photos_storage_bucket.sql`](../sql/marketing_material_install_photos_storage_bucket.sql)
- [`marketing_material_store_checks.sql`](../sql/marketing_material_store_checks.sql) — verify
- [`marketing_material_store_checks_install_photo.sql`](../sql/marketing_material_store_checks_install_photo.sql) — verify
- [`marketing_material_store_checks_quantity.sql`](../sql/marketing_material_store_checks_quantity.sql) — verify
- [`marketing_materials.sql`](../sql/marketing_materials.sql)
- [`marketing_materials_produced_on.sql`](../sql/marketing_materials_produced_on.sql)
- [`marketing_meta_connections.sql`](../sql/marketing_meta_connections.sql)
- [`marketing_meta_ig_and_campaign_map.sql`](../sql/marketing_meta_ig_and_campaign_map.sql)
- [`marketing_tenant_id.sql`](../sql/marketing_tenant_id.sql)
- [`marketing_tiktok_connections.sql`](../sql/marketing_tiktok_connections.sql)

</details>

<details><summary><code>fix_*</code> (26)</summary>

- [`fix_abc_company_1001_align_malatang01.sql`](../sql/fix_abc_company_1001_align_malatang01.sql) — apply
- [`fix_barbq_chicken_option_prices.sql`](../sql/fix_barbq_chicken_option_prices.sql) — apply
- [`fix_erp_stores_code_1001_not_tenant_prefix.sql`](../sql/fix_erp_stores_code_1001_not_tenant_prefix.sql) — apply
- [`fix_hq_like_receivable_01_delete_apo89.sql`](../sql/fix_hq_like_receivable_01_delete_apo89.sql) — apply
- [`fix_hq_like_receivable_02_delete_cm_office_receive.sql`](../sql/fix_hq_like_receivable_02_delete_cm_office_receive.sql) — apply
- [`fix_hq_warehouse_accounting_po_receivable.sql`](../sql/fix_hq_warehouse_accounting_po_receivable.sql) — apply
- [`fix_member_coupon_issued_after_paid_m004579.sql`](../sql/fix_member_coupon_issued_after_paid_m004579.sql) — apply
- [`fix_omnifoodtech_admin_password_hash.sql`](../sql/fix_omnifoodtech_admin_password_hash.sql) — apply
- [`fix_pay_correct_inflated_discounts.sql`](../sql/fix_pay_correct_inflated_discounts.sql) — apply
- [`fix_payroll_wht_ledger_pnd3_to_pnd1.sql`](../sql/fix_payroll_wht_ledger_pnd3_to_pnd1.sql) — apply
- [`fix_pos_menus_abc_company_tenant_alias.sql`](../sql/fix_pos_menus_abc_company_tenant_alias.sql) — apply
- [`fix_pos_menus_malatang01_after_deploy.sql`](../sql/fix_pos_menus_malatang01_after_deploy.sql) — apply
- [`fix_pos_menus_null_tenant_backfill.sql`](../sql/fix_pos_menus_null_tenant_backfill.sql) — backfill, apply
- [`fix_pos_menus_scope_store_1001_malatang01.sql`](../sql/fix_pos_menus_scope_store_1001_malatang01.sql) — apply
- [`fix_pos_order_birthday_coupon_total_cmthestreet_20260801_015.sql`](../sql/fix_pos_order_birthday_coupon_total_cmthestreet_20260801_015.sql) — apply
- [`fix_pos_orders_tenant_id_for_sales_rpc.sql`](../sql/fix_pos_orders_tenant_id_for_sales_rpc.sql) — rpc, apply
- [`fix_pos_sales_analytics_agg_timeout.sql`](../sql/fix_pos_sales_analytics_agg_timeout.sql) — apply
- [`fix_pos_sales_business_ymd_overnight.sql`](../sql/fix_pos_sales_business_ymd_overnight.sql) — apply
- [`fix_reactivate_inactive_line_shells_no_phone.sql`](../sql/fix_reactivate_inactive_line_shells_no_phone.sql) — apply
- [`fix_rpkm2026_member_promo_code.sql`](../sql/fix_rpkm2026_member_promo_code.sql) — apply
- [`fix_silom_tax_wh_195_dup_delete.sql`](../sql/fix_silom_tax_wh_195_dup_delete.sql) — apply
- [`fix_stamp_reward_coupon_gdfstamp.sql`](../sql/fix_stamp_reward_coupon_gdfstamp.sql) — apply
- [`fix_store_visit_duplicate_opens_2026_08_07.sql`](../sql/fix_store_visit_duplicate_opens_2026_08_07.sql) — apply
- [`fix_tax_entity_mapping_choongman_live.sql`](../sql/fix_tax_entity_mapping_choongman_live.sql) — apply
- [`fix_tax_invoice_reference_apo_to_po_no.sql`](../sql/fix_tax_invoice_reference_apo_to_po_no.sql) — apply
- [`fix_wht_ledger_natural_person_pnd3.sql`](../sql/fix_wht_ledger_natural_person_pnd3.sql) — apply

</details>

<details><summary><code>get_*</code> (23)</summary>

- [`get_collab_discount_usage_by_store_daily_rpc.sql`](../sql/get_collab_discount_usage_by_store_daily_rpc.sql) — rpc
- [`get_collab_discount_usage_rpc.sql`](../sql/get_collab_discount_usage_rpc.sql) — rpc
- [`get_corporate_tax_pl_agg_rpc.sql`](../sql/get_corporate_tax_pl_agg_rpc.sql) — rpc
- [`get_evaluation_analytics_rpc.sql`](../sql/get_evaluation_analytics_rpc.sql) — rpc
- [`get_evaluation_distinct_store_names.sql`](../sql/get_evaluation_distinct_store_names.sql)
- [`get_gl_balance_as_of.sql`](../sql/get_gl_balance_as_of.sql)
- [`get_ingredient_usage_actual.sql`](../sql/get_ingredient_usage_actual.sql)
- [`get_login_data_employees_rpc.sql`](../sql/get_login_data_employees_rpc.sql) — rpc
- [`get_member_line_reach.sql`](../sql/get_member_line_reach.sql)
- [`get_member_list_cursor_status.sql`](../sql/get_member_list_cursor_status.sql)
- [`get_my_order_history_rpc.sql`](../sql/get_my_order_history_rpc.sql) — rpc
- [`get_petty_cash_summary.sql`](../sql/get_petty_cash_summary.sql)
- [`get_pos_cancel_reason_summary.sql`](../sql/get_pos_cancel_reason_summary.sql)
- [`get_pos_channel_settlement_gross.sql`](../sql/get_pos_channel_settlement_gross.sql)
- [`get_pos_close_snapshot.sql`](../sql/get_pos_close_snapshot.sql)
- [`get_pos_sales_analytics_agg.sql`](../sql/get_pos_sales_analytics_agg.sql)
- [`get_pos_sales_filter_store_codes.sql`](../sql/get_pos_sales_filter_store_codes.sql)
- [`get_pos_sales_period_summary_deploy.sql`](../sql/get_pos_sales_period_summary_deploy.sql)
- [`get_pp30_channel_sales_daily_rpc.sql`](../sql/get_pp30_channel_sales_daily_rpc.sql) — rpc
- [`get_stock_logs_history_rpc.sql`](../sql/get_stock_logs_history_rpc.sql) — rpc
- [`get_stock_logs_purchase_agg.sql`](../sql/get_stock_logs_purchase_agg.sql)
- [`get_store_stock_exclude_deleted_01_deploy.sql`](../sql/get_store_stock_exclude_deleted_01_deploy.sql)
- [`get_store_stock_exclude_deleted_02_verify.sql`](../sql/get_store_stock_exclude_deleted_02_verify.sql) — verify

</details>

<details><summary><code>bank_*</code> (22)</summary>

- [`bank_account_audit_logs.sql`](../sql/bank_account_audit_logs.sql) — diagnose
- [`bank_accounts_store_diagnostic.sql`](../sql/bank_accounts_store_diagnostic.sql) — diagnose
- [`bank_purchase_inbound_link_cleanup.sql`](../sql/bank_purchase_inbound_link_cleanup.sql) — apply
- [`bank_surplus_credit_carry_01_find_overpay.sql`](../sql/bank_surplus_credit_carry_01_find_overpay.sql) — diagnose
- [`bank_surplus_credit_carry_02_store_remaining.sql`](../sql/bank_surplus_credit_carry_02_store_remaining.sql)
- [`bank_surplus_credit_carry_02b_applies.sql`](../sql/bank_surplus_credit_carry_02b_applies.sql)
- [`bank_surplus_credit_carry_03_available_sum.sql`](../sql/bank_surplus_credit_carry_03_available_sum.sql)
- [`bank_surplus_credit_carry_04_truncation_risk.sql`](../sql/bank_surplus_credit_carry_04_truncation_risk.sql)
- [`bank_surplus_credit_carry_05_all_surplus.sql`](../sql/bank_surplus_credit_carry_05_all_surplus.sql)
- [`bank_surplus_credit_carry_06_huamak_store_credit.sql`](../sql/bank_surplus_credit_carry_06_huamak_store_credit.sql)
- [`bank_surplus_credit_carry_07_bank_tx.sql`](../sql/bank_surplus_credit_carry_07_bank_tx.sql)
- [`bank_surplus_credit_carry_08_find_3274.sql`](../sql/bank_surplus_credit_carry_08_find_3274.sql) — diagnose
- [`bank_surplus_credit_carry_09_recv_store_names.sql`](../sql/bank_surplus_credit_carry_09_recv_store_names.sql)
- [`bank_surplus_credit_carry_09b_erp_stores.sql`](../sql/bank_surplus_credit_carry_09b_erp_stores.sql)
- [`bank_surplus_credit_carry_10_credit_applies.sql`](../sql/bank_surplus_credit_carry_10_credit_applies.sql)
- [`bank_surplus_credit_carry_11_all_refs.sql`](../sql/bank_surplus_credit_carry_11_all_refs.sql)
- [`bank_surplus_credit_carry_12_bank_14320.sql`](../sql/bank_surplus_credit_carry_12_bank_14320.sql)
- [`bank_surplus_credit_carry_13_links_14320.sql`](../sql/bank_surplus_credit_carry_13_links_14320.sql)
- [`bank_surplus_credit_carry_14_huamak_deposits_0922.sql`](../sql/bank_surplus_credit_carry_14_huamak_deposits_0922.sql)
- [`bank_surplus_credit_carry_15_accruals_14320.sql`](../sql/bank_surplus_credit_carry_15_accruals_14320.sql)
- [`bank_surplus_credit_carry_16_credit_receives.sql`](../sql/bank_surplus_credit_carry_16_credit_receives.sql)
- [`bank_transactions_attachment_urls.sql`](../sql/bank_transactions_attachment_urls.sql)

</details>

<details><summary><code>tax_*</code> (18)</summary>

- [`tax_accounting_periods_01.sql`](../sql/tax_accounting_periods_01.sql)
- [`tax_book_journal_01_columns.sql`](../sql/tax_book_journal_01_columns.sql)
- [`tax_book_vat_clearing_account_01.sql`](../sql/tax_book_vat_clearing_account_01.sql)
- [`tax_daybook_01_channel_settlement_receipt.sql`](../sql/tax_daybook_01_channel_settlement_receipt.sql)
- [`tax_daybook_02_reclassify_kinds.sql`](../sql/tax_daybook_02_reclassify_kinds.sql)
- [`tax_daybook_03_preview_vat_missing.sql`](../sql/tax_daybook_03_preview_vat_missing.sql) — preview
- [`tax_daybook_04_expense_doc_to_entry_no.sql`](../sql/tax_daybook_04_expense_doc_to_entry_no.sql)
- [`tax_daybook_04_preview_expense_doc_mismatch.sql`](../sql/tax_daybook_04_preview_expense_doc_mismatch.sql) — preview
- [`tax_entities_and_store_mapping.sql`](../sql/tax_entities_and_store_mapping.sql)
- [`tax_filing_period_key.sql`](../sql/tax_filing_period_key.sql)
- [`tax_filing_scale_indexes.sql`](../sql/tax_filing_scale_indexes.sql)
- [`tax_filing_store_scope_and_wht_store.sql`](../sql/tax_filing_store_scope_and_wht_store.sql)
- [`tax_ledger_filing_status.sql`](../sql/tax_ledger_filing_status.sql)
- [`tax_mirror_01_preview_summaries.sql`](../sql/tax_mirror_01_preview_summaries.sql) — preview
- [`tax_mirror_02_preview_ops_missing_tax.sql`](../sql/tax_mirror_02_preview_ops_missing_tax.sql) — preview
- [`tax_mirror_03_preview_summary_ids.sql`](../sql/tax_mirror_03_preview_summary_ids.sql) — preview
- [`tax_mirror_04_delete_summaries.sql`](../sql/tax_mirror_04_delete_summaries.sql) — apply
- [`tax_mirror_05_verify_summaries_gone.sql`](../sql/tax_mirror_05_verify_summaries_gone.sql) — verify

</details>

<details><summary><code>saas_*</code> (14)</summary>

- [`saas_admin_control_plane.sql`](../sql/saas_admin_control_plane.sql)
- [`saas_base_schema.sql`](../sql/saas_base_schema.sql)
- [`saas_billing_company_profiles.sql`](../sql/saas_billing_company_profiles.sql)
- [`saas_employees_add_hr_fields.sql`](../sql/saas_employees_add_hr_fields.sql)
- [`saas_employees_add_join_date.sql`](../sql/saas_employees_add_join_date.sql)
- [`saas_employees_add_nick.sql`](../sql/saas_employees_add_nick.sql)
- [`saas_erp_stores_tenant_backfill.sql`](../sql/saas_erp_stores_tenant_backfill.sql) — backfill
- [`saas_full_bootstrap_one_shot.sql`](../sql/saas_full_bootstrap_one_shot.sql) — bundle
- [`saas_module_pricing.sql`](../sql/saas_module_pricing.sql)
- [`saas_partner_enhancements.sql`](../sql/saas_partner_enhancements.sql)
- [`saas_partner_reseller.sql`](../sql/saas_partner_reseller.sql)
- [`saas_tenant_bootstrap.sql`](../sql/saas_tenant_bootstrap.sql)
- [`saas_tenant_onboarding.sql`](../sql/saas_tenant_onboarding.sql)
- [`saas_tenant_usage_rpc.sql`](../sql/saas_tenant_usage_rpc.sql) — rpc

</details>

<details><summary><code>accounting_*</code> (13)</summary>

- [`accounting_compliance_audit_logs.sql`](../sql/accounting_compliance_audit_logs.sql) — diagnose
- [`accounting_compliance_audit_trend_rpc.sql`](../sql/accounting_compliance_audit_trend_rpc.sql) — diagnose, rpc
- [`accounting_compliance_extensions.sql`](../sql/accounting_compliance_extensions.sql)
- [`accounting_identity_keys.sql`](../sql/accounting_identity_keys.sql)
- [`accounting_kt20k_summary_rpc.sql`](../sql/accounting_kt20k_summary_rpc.sql) — rpc
- [`accounting_legacy_cleanup_checks.sql`](../sql/accounting_legacy_cleanup_checks.sql) — verify, apply
- [`accounting_period_unlock_approval.sql`](../sql/accounting_period_unlock_approval.sql)
- [`accounting_periods_store_scope.sql`](../sql/accounting_periods_store_scope.sql)
- [`accounting_pos_compliance_reconciliation_rpc.sql`](../sql/accounting_pos_compliance_reconciliation_rpc.sql) — rpc
- [`accounting_tax_filing_summary_rpc.sql`](../sql/accounting_tax_filing_summary_rpc.sql) — rpc
- [`accounting_tax_upgrade_one_shot.sql`](../sql/accounting_tax_upgrade_one_shot.sql) — bundle
- [`accounting_tenant_id.sql`](../sql/accounting_tenant_id.sql)
- [`accounting_workflow_events.sql`](../sql/accounting_workflow_events.sql)

</details>

<details><summary><code>kbank_*</code> (13)</summary>

- [`kbank_mbk_true_digital_01_preview.sql`](../sql/kbank_mbk_true_digital_01_preview.sql) — preview
- [`kbank_mbk_true_digital_02_update.sql`](../sql/kbank_mbk_true_digital_02_update.sql) — apply
- [`kbank_mbk_true_digital_03_verify.sql`](../sql/kbank_mbk_true_digital_03_verify.sql) — verify
- [`kbank_oauth_token_cache.sql`](../sql/kbank_oauth_token_cache.sql)
- [`kbank_the_street_qr_cashier_01_preview.sql`](../sql/kbank_the_street_qr_cashier_01_preview.sql) — preview
- [`kbank_the_street_qr_cashier_02_update.sql`](../sql/kbank_the_street_qr_cashier_02_update.sql) — apply
- [`kbank_the_street_qr_cashier_03_verify.sql`](../sql/kbank_the_street_qr_cashier_03_verify.sql) — verify
- [`kbank_the_street_union_mall_01_preview.sql`](../sql/kbank_the_street_union_mall_01_preview.sql) — preview
- [`kbank_the_street_union_mall_02_update.sql`](../sql/kbank_the_street_union_mall_02_update.sql) — apply
- [`kbank_the_street_union_mall_03_verify.sql`](../sql/kbank_the_street_union_mall_03_verify.sql) — verify
- [`kbank_true_digital_mid_01_preview.sql`](../sql/kbank_true_digital_mid_01_preview.sql) — preview
- [`kbank_true_digital_mid_02_update.sql`](../sql/kbank_true_digital_mid_02_update.sql) — apply
- [`kbank_true_digital_mid_03_verify.sql`](../sql/kbank_true_digital_mid_03_verify.sql) — verify

</details>

<details><summary><code>true_*</code> (13)</summary>

- [`true_digital_emergency_autoprint_off_01.sql`](../sql/true_digital_emergency_autoprint_off_01.sql)
- [`true_digital_emergency_autoprint_on_01.sql`](../sql/true_digital_emergency_autoprint_on_01.sql)
- [`true_digital_pl_comm_vs_electric_01_accounts.sql`](../sql/true_digital_pl_comm_vs_electric_01_accounts.sql)
- [`true_digital_pl_comm_vs_electric_02_monthly.sql`](../sql/true_digital_pl_comm_vs_electric_02_monthly.sql)
- [`true_digital_pl_comm_vs_electric_03_july_aug_lines.sql`](../sql/true_digital_pl_comm_vs_electric_03_july_aug_lines.sql)
- [`true_digital_pl_comm_vs_electric_04_preview_reclass.sql`](../sql/true_digital_pl_comm_vs_electric_04_preview_reclass.sql) — preview
- [`true_digital_pl_comm_vs_electric_05_update_reclass.sql`](../sql/true_digital_pl_comm_vs_electric_05_update_reclass.sql) — apply
- [`true_digital_pl_comm_vs_electric_06_rename_5420.sql`](../sql/true_digital_pl_comm_vs_electric_06_rename_5420.sql)
- [`true_digital_pl_comm_vs_electric_07_verify.sql`](../sql/true_digital_pl_comm_vs_electric_07_verify.sql) — verify
- [`true_digital_pl_comm_vs_electric_08_verify_rows.sql`](../sql/true_digital_pl_comm_vs_electric_08_verify_rows.sql) — verify
- [`true_digital_receipt_biz_address_01_check.sql`](../sql/true_digital_receipt_biz_address_01_check.sql) — verify
- [`true_digital_receipt_biz_address_02_preview.sql`](../sql/true_digital_receipt_biz_address_02_preview.sql) — preview
- [`true_digital_receipt_biz_address_03_apply.sql`](../sql/true_digital_receipt_biz_address_03_apply.sql) — apply

</details>

<details><summary><code>attendance_*</code> (12)</summary>

- [`attendance_break_resume_dedupe.sql`](../sql/attendance_break_resume_dedupe.sql)
- [`attendance_employee_id_hardening.sql`](../sql/attendance_employee_id_hardening.sql)
- [`attendance_employee_id_second_pass.sql`](../sql/attendance_employee_id_second_pass.sql)
- [`attendance_employee_id_third_pass.sql`](../sql/attendance_employee_id_third_pass.sql)
- [`attendance_log_adjustments.sql`](../sql/attendance_log_adjustments.sql)
- [`attendance_logs_employee_code.sql`](../sql/attendance_logs_employee_code.sql)
- [`attendance_manual_map_cm_office.sql`](../sql/attendance_manual_map_cm_office.sql)
- [`attendance_qr_store_mode.sql`](../sql/attendance_qr_store_mode.sql)
- [`attendance_schedule_employee_keys.sql`](../sql/attendance_schedule_employee_keys.sql)
- [`attendance_schedule_match_diagnostic.sql`](../sql/attendance_schedule_match_diagnostic.sql) — diagnose
- [`attendance_unresolved_csv2_lookup.sql`](../sql/attendance_unresolved_csv2_lookup.sql) — diagnose
- [`attendance_unresolved_fuzzy_lookup.sql`](../sql/attendance_unresolved_fuzzy_lookup.sql) — diagnose

</details>

<details><summary><code>delete_*</code> (11)</summary>

- [`delete_additive_option_small_kimchi_soup.sql`](../sql/delete_additive_option_small_kimchi_soup.sql) — apply
- [`delete_duplicate_pizza_oven_ekkamai_20260813.sql`](../sql/delete_duplicate_pizza_oven_ekkamai_20260813.sql) — apply
- [`delete_exp2026070039_mbk_makro_01_accrual.sql`](../sql/delete_exp2026070039_mbk_makro_01_accrual.sql) — apply
- [`delete_exp2026070039_mbk_makro_02_siblings.sql`](../sql/delete_exp2026070039_mbk_makro_02_siblings.sql) — apply
- [`delete_exp2026070039_mbk_makro_03_links.sql`](../sql/delete_exp2026070039_mbk_makro_03_links.sql) — apply
- [`delete_exp2026070039_mbk_makro_04_journals_period.sql`](../sql/delete_exp2026070039_mbk_makro_04_journals_period.sql) — apply
- [`delete_exp2026070039_mbk_makro_05_delete.sql`](../sql/delete_exp2026070039_mbk_makro_05_delete.sql) — apply
- [`delete_exp2026070039_mbk_makro_06_verify.sql`](../sql/delete_exp2026070039_mbk_makro_06_verify.sql) — verify, apply
- [`delete_expense_accrual_2451_2452_mbk_shopee.sql`](../sql/delete_expense_accrual_2451_2452_mbk_shopee.sql) — apply
- [`delete_payable_po_transactions.sql`](../sql/delete_payable_po_transactions.sql) — apply
- [`delete_worklog_notices_from_send_history.sql`](../sql/delete_worklog_notices_from_send_history.sql) — apply

</details>

<details><summary><code>qr_*</code> (11)</summary>

- [`qr_table_guest_bill_pay_01_columns.sql`](../sql/qr_table_guest_bill_pay_01_columns.sql)
- [`qr_table_paid_session_stuck_01_preview.sql`](../sql/qr_table_paid_session_stuck_01_preview.sql) — preview
- [`qr_table_paid_session_stuck_02_backfill_payment_qr.sql`](../sql/qr_table_paid_session_stuck_02_backfill_payment_qr.sql) — backfill
- [`qr_table_paid_session_stuck_03_close_sessions.sql`](../sql/qr_table_paid_session_stuck_03_close_sessions.sql)
- [`qr_table_paid_session_stuck_04_fix_created_at_plus7.sql`](../sql/qr_table_paid_session_stuck_04_fix_created_at_plus7.sql) — apply
- [`qr_table_paid_session_stuck_05_verify.sql`](../sql/qr_table_paid_session_stuck_05_verify.sql) — verify
- [`qr_table_paid_session_stuck_06_force_backfill_two.sql`](../sql/qr_table_paid_session_stuck_06_force_backfill_two.sql) — backfill
- [`qr_table_paid_session_stuck_07_force_created_at_two.sql`](../sql/qr_table_paid_session_stuck_07_force_created_at_two.sql)
- [`qr_table_the_street_open_orders_01_preview.sql`](../sql/qr_table_the_street_open_orders_01_preview.sql) — preview
- [`qr_table_the_street_open_sessions_01_preview.sql`](../sql/qr_table_the_street_open_sessions_01_preview.sql) — preview
- [`qr_table_the_street_open_sessions_02_close_paid.sql`](../sql/qr_table_the_street_open_sessions_02_close_paid.sql)

</details>

<details><summary><code>store_*</code> (11)</summary>

- [`store_action_items_schema.sql`](../sql/store_action_items_schema.sql)
- [`store_action_items_v2.sql`](../sql/store_action_items_v2.sql)
- [`store_action_photos_storage_bucket.sql`](../sql/store_action_photos_storage_bucket.sql)
- [`store_repair_photos_storage_bucket.sql`](../sql/store_repair_photos_storage_bucket.sql) — apply
- [`store_repair_progress_logs.sql`](../sql/store_repair_progress_logs.sql) — apply
- [`store_repair_schema_all.sql`](../sql/store_repair_schema_all.sql) — apply
- [`store_repair_tickets.sql`](../sql/store_repair_tickets.sql) — apply
- [`store_repair_tickets_vendor_code.sql`](../sql/store_repair_tickets_vendor_code.sql) — apply
- [`store_tax_filing_profiles.sql`](../sql/store_tax_filing_profiles.sql)
- [`store_tax_filing_profiles_sso_columns.sql`](../sql/store_tax_filing_profiles_sso_columns.sql)
- [`store_tax_filing_profiles_vendor_code.sql`](../sql/store_tax_filing_profiles_vendor_code.sql)

</details>

<details><summary><code>receivable_*</code> (10)</summary>

- [`receivable_b2b_bank_link_backfill_2026.sql`](../sql/receivable_b2b_bank_link_backfill_2026.sql) — backfill
- [`receivable_b2b_bank_link_gaps.sql`](../sql/receivable_b2b_bank_link_gaps.sql)
- [`receivable_bank_manual_double_check.sql`](../sql/receivable_bank_manual_double_check.sql) — verify
- [`receivable_bank_manual_double_cleanup_202606.sql`](../sql/receivable_bank_manual_double_cleanup_202606.sql) — apply
- [`receivable_creditor_store.sql`](../sql/receivable_creditor_store.sql)
- [`receivable_futurepark_silom_cleanup_202606.sql`](../sql/receivable_futurepark_silom_cleanup_202606.sql) — apply
- [`receivable_payable_bank_double_diagnostic.sql`](../sql/receivable_payable_bank_double_diagnostic.sql) — diagnose
- [`receivable_payable_hq_settlement_double_cleanup.sql`](../sql/receivable_payable_hq_settlement_double_cleanup.sql) — apply
- [`receivable_payable_hq_settlement_double_cleanup_202602_202606.sql`](../sql/receivable_payable_hq_settlement_double_cleanup_202602_202606.sql) — apply
- [`receivable_transactions_receive_checked.sql`](../sql/receivable_transactions_receive_checked.sql)

</details>

<details><summary><code>supabase_*</code> (10)</summary>

- [`supabase_editor_diagnostic_only.sql`](../sql/supabase_editor_diagnostic_only.sql) — diagnose
- [`supabase_linter_function_search_path_fix.sql`](../sql/supabase_linter_function_search_path_fix.sql) — apply
- [`supabase_linter_hardening_one_paste.sql`](../sql/supabase_linter_hardening_one_paste.sql) — bundle
- [`supabase_one_paste_accounting_and_pos_printer_cut.sql`](../sql/supabase_one_paste_accounting_and_pos_printer_cut.sql) — bundle
- [`supabase_one_paste_accounting_and_pos_printer_cut_clean.sql`](../sql/supabase_one_paste_accounting_and_pos_printer_cut_clean.sql) — bundle
- [`supabase_one_paste_all_in_one.sql`](../sql/supabase_one_paste_all_in_one.sql) — bundle
- [`supabase_one_paste_optional_menu_code_recovery.sql`](../sql/supabase_one_paste_optional_menu_code_recovery.sql) — bundle
- [`supabase_one_paste_phase2.sql`](../sql/supabase_one_paste_phase2.sql) — bundle
- [`supabase_one_paste_pos_orders_list.sql`](../sql/supabase_one_paste_pos_orders_list.sql) — bundle
- [`supabase_rpc_egress_helpers_deploy.sql`](../sql/supabase_rpc_egress_helpers_deploy.sql) — rpc

</details>

<details><summary><code>payable_*</code> (9)</summary>

- [`payable_backfill_from_bank_purchase_payment.sql`](../sql/payable_backfill_from_bank_purchase_payment.sql) — backfill
- [`payable_bank_link_policy_cleanup_preview.sql`](../sql/payable_bank_link_policy_cleanup_preview.sql) — preview, apply
- [`payable_bank_purchase_link_gaps.sql`](../sql/payable_bank_purchase_link_gaps.sql)
- [`payable_bank_vendor_mismatch_cleanup.sql`](../sql/payable_bank_vendor_mismatch_cleanup.sql) — apply
- [`payable_bank_vendor_mismatch_fix_20260317.sql`](../sql/payable_bank_vendor_mismatch_fix_20260317.sql) — apply
- [`payable_inbound_gross_vat_backfill.sql`](../sql/payable_inbound_gross_vat_backfill.sql) — backfill
- [`payable_polonext_mismatch_fix_20260623.sql`](../sql/payable_polonext_mismatch_fix_20260623.sql) — apply
- [`payable_purchase_payment_no_vendor_cleanup.sql`](../sql/payable_purchase_payment_no_vendor_cleanup.sql) — apply
- [`payable_settlement_links.sql`](../sql/payable_settlement_links.sql)

</details>

<details><summary><code>remove_*</code> (9)</summary>

- [`remove_ottogi_mayo_invoice_01_item.sql`](../sql/remove_ottogi_mayo_invoice_01_item.sql)
- [`remove_ottogi_mayo_invoice_02_orders_ar.sql`](../sql/remove_ottogi_mayo_invoice_02_orders_ar.sql)
- [`remove_ottogi_mayo_invoice_03_outbound_logs.sql`](../sql/remove_ottogi_mayo_invoice_03_outbound_logs.sql)
- [`remove_ottogi_mayo_invoice_04_qty_compare.sql`](../sql/remove_ottogi_mayo_invoice_04_qty_compare.sql)
- [`remove_ottogi_mayo_invoice_05_period_extras.sql`](../sql/remove_ottogi_mayo_invoice_05_period_extras.sql)
- [`remove_ottogi_mayo_invoice_06_store_inbound.sql`](../sql/remove_ottogi_mayo_invoice_06_store_inbound.sql)
- [`remove_ottogi_mayo_invoice_07_billing_preview.sql`](../sql/remove_ottogi_mayo_invoice_07_billing_preview.sql) — preview
- [`remove_ottogi_mayo_invoice_08_billing_update.sql`](../sql/remove_ottogi_mayo_invoice_08_billing_update.sql) — apply
- [`remove_ottogi_mayo_invoice_09_billing_verify.sql`](../sql/remove_ottogi_mayo_invoice_09_billing_verify.sql) — verify

</details>

<details><summary><code>account_*</code> (8)</summary>

- [`account_subject_drop_5210_01_preview.sql`](../sql/account_subject_drop_5210_01_preview.sql) — preview
- [`account_subject_drop_5210_02_repoint_delete.sql`](../sql/account_subject_drop_5210_02_repoint_delete.sql) — apply
- [`account_subject_sso_payable_2195.sql`](../sql/account_subject_sso_payable_2195.sql)
- [`account_subjects_coa_tree.sql`](../sql/account_subjects_coa_tree.sql)
- [`account_subjects_delivery_card_fee.sql`](../sql/account_subjects_delivery_card_fee.sql)
- [`account_subjects_fee_settlement.sql`](../sql/account_subjects_fee_settlement.sql)
- [`account_subjects_other_income_4191.sql`](../sql/account_subjects_other_income_4191.sql)
- [`account_subjects_pl_fixed_to_expense.sql`](../sql/account_subjects_pl_fixed_to_expense.sql)

</details>

<details><summary><code>employees_*</code> (8)</summary>

- [`employees_attendance_allowance.sql`](../sql/employees_attendance_allowance.sql)
- [`employees_audit.sql`](../sql/employees_audit.sql) — diagnose
- [`employees_can_manage_office_payroll.sql`](../sql/employees_can_manage_office_payroll.sql)
- [`employees_employee_code_leave_employee_id.sql`](../sql/employees_employee_code_leave_employee_id.sql)
- [`employees_extra_stores.sql`](../sql/employees_extra_stores.sql)
- [`employees_name_title.sql`](../sql/employees_name_title.sql)
- [`employees_safe_soft_delete_and_status.sql`](../sql/employees_safe_soft_delete_and_status.sql) — apply
- [`employees_sso_exempt.sql`](../sql/employees_sso_exempt.sql)

</details>

<details><summary><code>expense_*</code> (8)</summary>

- [`expense_accrual_attachment_urls.sql`](../sql/expense_accrual_attachment_urls.sql)
- [`expense_accruals_invoice_received.sql`](../sql/expense_accruals_invoice_received.sql)
- [`expense_accruals_vat_withholding.sql`](../sql/expense_accruals_vat_withholding.sql)
- [`expense_accruals_withholding_tax_items.sql`](../sql/expense_accruals_withholding_tax_items.sql)
- [`expense_document_no.sql`](../sql/expense_document_no.sql)
- [`expense_document_no_pv_pp.sql`](../sql/expense_document_no_pv_pp.sql)
- [`expense_document_type.sql`](../sql/expense_document_type.sql)
- [`expense_payee_bank_transfer_fields.sql`](../sql/expense_payee_bank_transfer_fields.sql)

</details>

<details><summary><code>erp_*</code> (6)</summary>

- [`erp_decimal_precision_3.sql`](../sql/erp_decimal_precision_3.sql)
- [`erp_member_delta_since_20260716.sql`](../sql/erp_member_delta_since_20260716.sql)
- [`erp_stores.sql`](../sql/erp_stores.sql)
- [`erp_stores_deactivate_grab_shell_duplicates.sql`](../sql/erp_stores_deactivate_grab_shell_duplicates.sql)
- [`erp_stores_member_portal_fields.sql`](../sql/erp_stores_member_portal_fields.sql)
- [`erp_stores_seed_all_aliases.sql`](../sql/erp_stores_seed_all_aliases.sql)

</details>

<details><summary><code>head_*</code> (6)</summary>

- [`head_office_tenant_isolate_01_tenants.sql`](../sql/head_office_tenant_isolate_01_tenants.sql)
- [`head_office_tenant_isolate_02_hq_rows.sql`](../sql/head_office_tenant_isolate_02_hq_rows.sql)
- [`head_office_tenant_isolate_03_unique.sql`](../sql/head_office_tenant_isolate_03_unique.sql)
- [`head_office_tenant_isolate_04_missing.sql`](../sql/head_office_tenant_isolate_04_missing.sql)
- [`head_office_tenant_isolate_05_copy.sql`](../sql/head_office_tenant_isolate_05_copy.sql)
- [`head_office_tenant_isolate_06_verify.sql`](../sql/head_office_tenant_isolate_06_verify.sql) — verify

</details>

<details><summary><code>members_*</code> (6)</summary>

- [`members_crm_scale_phase1_to_4.sql`](../sql/members_crm_scale_phase1_to_4.sql)
- [`members_crm_tenant_id.sql`](../sql/members_crm_tenant_id.sql)
- [`members_identity_source_convention.sql`](../sql/members_identity_source_convention.sql)
- [`members_phone_canonical_unique.sql`](../sql/members_phone_canonical_unique.sql)
- [`members_tenant_id.sql`](../sql/members_tenant_id.sql)
- [`members_tenant_id_cursor_fix.sql`](../sql/members_tenant_id_cursor_fix.sql) — apply

</details>

<details><summary><code>ai_*</code> (5)</summary>

- [`ai_center_foundation.sql`](../sql/ai_center_foundation.sql)
- [`ai_center_foundation_verify.sql`](../sql/ai_center_foundation_verify.sql) — verify
- [`ai_conversations.sql`](../sql/ai_conversations.sql)
- [`ai_knowledge_vector.sql`](../sql/ai_knowledge_vector.sql)
- [`ai_store_hq_purchase_ratio_rpc.sql`](../sql/ai_store_hq_purchase_ratio_rpc.sql) — rpc

</details>

<details><summary><code>backfill_*</code> (5)</summary>

- [`backfill_hq_vat_ledger_store_name_cm_office.sql`](../sql/backfill_hq_vat_ledger_store_name_cm_office.sql) — backfill
- [`backfill_omni_pos_orders_tenant_id_from_store.sql`](../sql/backfill_omni_pos_orders_tenant_id_from_store.sql) — backfill
- [`backfill_platform_discount_reason.sql`](../sql/backfill_platform_discount_reason.sql) — backfill
- [`backfill_pos_order_line_discount_header.sql`](../sql/backfill_pos_order_line_discount_header.sql) — backfill
- [`backfill_pos_orders_collab_discount_usage.sql`](../sql/backfill_pos_orders_collab_discount_usage.sql) — backfill

</details>

<details><summary><code>company_*</code> (5)</summary>

- [`company_hybrid_document_categories.sql`](../sql/company_hybrid_document_categories.sql)
- [`company_hybrid_documents.sql`](../sql/company_hybrid_documents.sql)
- [`company_hybrid_documents_all_in_one.sql`](../sql/company_hybrid_documents_all_in_one.sql) — bundle
- [`company_hybrid_documents_metadata.sql`](../sql/company_hybrid_documents_metadata.sql)
- [`company_hybrid_documents_summary_rpc.sql`](../sql/company_hybrid_documents_summary_rpc.sql) — rpc

</details>

<details><summary><code>grab_*</code> (5)</summary>

- [`grab_auto_settle_backfill_01_preview.sql`](../sql/grab_auto_settle_backfill_01_preview.sql) — preview, backfill
- [`grab_option_integrity_audit.sql`](../sql/grab_option_integrity_audit.sql) — diagnose
- [`grab_option_integrity_fix.sql`](../sql/grab_option_integrity_fix.sql) — apply
- [`grab_sync_actor_01_menu_audit.sql`](../sql/grab_sync_actor_01_menu_audit.sql) — diagnose
- [`grab_tenant_id.sql`](../sql/grab_tenant_id.sql)

</details>

<details><summary><code>hr_*</code> (5)</summary>

- [`hr_attendance_payroll_tenant_id.sql`](../sql/hr_attendance_payroll_tenant_id.sql)
- [`hr_employees_tenant_backfill.sql`](../sql/hr_employees_tenant_backfill.sql) — backfill
- [`hr_policies_hr_policy_reads.sql`](../sql/hr_policies_hr_policy_reads.sql)
- [`hr_policies_publish_drafts_01_preview.sql`](../sql/hr_policies_publish_drafts_01_preview.sql) — preview
- [`hr_policies_publish_drafts_02_activate.sql`](../sql/hr_policies_publish_drafts_02_activate.sql)

</details>

<details><summary><code>stock_*</code> (5)</summary>

- [`stock_inbound_shift_bangkok_date_one_day_earlier.sql`](../sql/stock_inbound_shift_bangkok_date_one_day_earlier.sql)
- [`stock_logs_invoice_unit_price.sql`](../sql/stock_logs_invoice_unit_price.sql)
- [`stock_logs_reference_no.sql`](../sql/stock_logs_reference_no.sql)
- [`stock_logs_soft_delete_outbound.sql`](../sql/stock_logs_soft_delete_outbound.sql) — apply
- [`stock_logs_supabase_ram_indexes.sql`](../sql/stock_logs_supabase_ram_indexes.sql)

</details>

<details><summary><code>daily_*</code> (4)</summary>

- [`daily_plans_01_schema.sql`](../sql/daily_plans_01_schema.sql)
- [`daily_plans_02_time_rpc.sql`](../sql/daily_plans_02_time_rpc.sql) — rpc
- [`daily_plans_03_seed_sv_template.sql`](../sql/daily_plans_03_seed_sv_template.sql)
- [`daily_plans_04_schedule_columns.sql`](../sql/daily_plans_04_schedule_columns.sql)

</details>

<details><summary><code>interior_*</code> (4)</summary>

- [`interior_dashboard_rpc.sql`](../sql/interior_dashboard_rpc.sql) — rpc
- [`interior_management_upgrade.sql`](../sql/interior_management_upgrade.sql)
- [`interior_quotes_layout_enhancements.sql`](../sql/interior_quotes_layout_enhancements.sql)
- [`interior_vendor_directory.sql`](../sql/interior_vendor_directory.sql)

</details>

<details><summary><code>logistics_*</code> (4)</summary>

- [`logistics_hardening_and_monitoring_all_in_one.sql`](../sql/logistics_hardening_and_monitoring_all_in_one.sql) — bundle
- [`logistics_hardening_phase1.sql`](../sql/logistics_hardening_phase1.sql)
- [`logistics_integrity_monitoring_batch.sql`](../sql/logistics_integrity_monitoring_batch.sql)
- [`logistics_kpi_dashboard_queries.sql`](../sql/logistics_kpi_dashboard_queries.sql)

</details>

<details><summary><code>payroll_*</code> (4)</summary>

- [`payroll_allowance_exclusions.sql`](../sql/payroll_allowance_exclusions.sql)
- [`payroll_records_employee_keys.sql`](../sql/payroll_records_employee_keys.sql)
- [`payroll_records_period_dates.sql`](../sql/payroll_records_period_dates.sql)
- [`payroll_records_published_at.sql`](../sql/payroll_records_published_at.sql)

</details>

<details><summary><code>rls_*</code> (4)</summary>

- [`rls_anon_allow_all_01_policies.sql`](../sql/rls_anon_allow_all_01_policies.sql) — rls
- [`rls_anon_allow_all_02_rls_off.sql`](../sql/rls_anon_allow_all_02_rls_off.sql) — rls
- [`rls_attendance_interior_supabase_linter_fix.sql`](../sql/rls_attendance_interior_supabase_linter_fix.sql) — rls, apply
- [`rls_public_tables_supabase_linter_fix.sql`](../sql/rls_public_tables_supabase_linter_fix.sql) — rls, apply

</details>

<details><summary><code>wht_*</code> (4)</summary>

- [`wht_mbk_branch_address_01_preview.sql`](../sql/wht_mbk_branch_address_01_preview.sql) — preview
- [`wht_mbk_branch_address_02_update.sql`](../sql/wht_mbk_branch_address_02_update.sql) — apply
- [`wht_mbk_branch_address_03_verify.sql`](../sql/wht_mbk_branch_address_03_verify.sql) — verify
- [`wht_mbk_branch_address_04_set_mbk_address.sql`](../sql/wht_mbk_branch_address_04_set_mbk_address.sql) — apply

</details>

<details><summary><code>cancel_*</code> (3)</summary>

- [`cancel_futurepark_orphan_pending_01_preview.sql`](../sql/cancel_futurepark_orphan_pending_01_preview.sql) — preview
- [`cancel_futurepark_orphan_pending_02_update.sql`](../sql/cancel_futurepark_orphan_pending_02_update.sql) — apply
- [`cancel_futurepark_orphan_pending_03_verify.sql`](../sql/cancel_futurepark_orphan_pending_03_verify.sql) — verify

</details>

<details><summary><code>cap_*</code> (3)</summary>

- [`cap_intertrade_wht_530_01_preview.sql`](../sql/cap_intertrade_wht_530_01_preview.sql) — preview
- [`cap_intertrade_wht_530_02_delete.sql`](../sql/cap_intertrade_wht_530_02_delete.sql) — apply
- [`cap_intertrade_wht_530_03_verify.sql`](../sql/cap_intertrade_wht_530_03_verify.sql) — verify

</details>

<details><summary><code>crm_*</code> (3)</summary>

- [`crm_coupon_campaigns_phase1.sql`](../sql/crm_coupon_campaigns_phase1.sql)
- [`crm_dashboard_segment_counts.sql`](../sql/crm_dashboard_segment_counts.sql)
- [`crm_member_summary_store_filter.sql`](../sql/crm_member_summary_store_filter.sql)

</details>

<details><summary><code>meta_*</code> (3)</summary>

- [`meta_ad_account_switch_01_preview.sql`](../sql/meta_ad_account_switch_01_preview.sql) — preview
- [`meta_ad_account_switch_02_update.sql`](../sql/meta_ad_account_switch_02_update.sql) — apply
- [`meta_ad_account_switch_03_verify.sql`](../sql/meta_ad_account_switch_03_verify.sql) — verify

</details>

<details><summary><code>sang_*</code> (3)</summary>

- [`sang_charoen_wht_01_preview.sql`](../sql/sang_charoen_wht_01_preview.sql) — preview
- [`sang_charoen_wht_02_apply.sql`](../sql/sang_charoen_wht_02_apply.sql) — apply
- [`sang_charoen_wht_03_verify.sql`](../sql/sang_charoen_wht_03_verify.sql) — verify

</details>

<details><summary><code>thai_*</code> (3)</summary>

- [`thai_tax_filing_model.sql`](../sql/thai_tax_filing_model.sql)
- [`thai_tax_pp36_pnd54_minimal.sql`](../sql/thai_tax_pp36_pnd54_minimal.sql)
- [`thai_workers_comp_settings.sql`](../sql/thai_workers_comp_settings.sql)

</details>

<details><summary><code>work_*</code> (3)</summary>

- [`work_log_agg_rpc.sql`](../sql/work_log_agg_rpc.sql) — rpc
- [`work_log_enhancements.sql`](../sql/work_log_enhancements.sql)
- [`work_logs_employee_id.sql`](../sql/work_logs_employee_id.sql)

</details>

<details><summary><code>000_*</code> (2)</summary>

- [`000_accounting_core_one_shot.sql`](../sql/000_accounting_core_one_shot.sql) — bundle
- [`000_accounting_pos_interior_all_in_one.sql`](../sql/000_accounting_pos_interior_all_in_one.sql) — bundle

</details>

<details><summary><code>choongman_*</code> (2)</summary>

- [`choongman_pos_api_columns_patch.sql`](../sql/choongman_pos_api_columns_patch.sql)
- [`choongman_pos_printer_settings_pricing_columns.sql`](../sql/choongman_pos_printer_settings_pricing_columns.sql)

</details>

<details><summary><code>complaint_*</code> (2)</summary>

- [`complaint_logs_customer_reply.sql`](../sql/complaint_logs_customer_reply.sql)
- [`complaint_logs_member_source.sql`](../sql/complaint_logs_member_source.sql)

</details>

<details><summary><code>create_*</code> (2)</summary>

- [`create_outbound_invoice_print_status.sql`](../sql/create_outbound_invoice_print_status.sql)
- [`create_price_schedules_table.sql`](../sql/create_price_schedules_table.sql)

</details>

<details><summary><code>daw_*</code> (2)</summary>

- [`daw_hq_expense_approve_01_lookup.sql`](../sql/daw_hq_expense_approve_01_lookup.sql) — diagnose
- [`daw_hq_expense_approve_02_enable.sql`](../sql/daw_hq_expense_approve_02_enable.sql)

</details>

<details><summary><code>fixed_*</code> (2)</summary>

- [`fixed_assets_account_mapping.sql`](../sql/fixed_assets_account_mapping.sql)
- [`fixed_assets_expense_accrual_id.sql`](../sql/fixed_assets_expense_accrual_id.sql)

</details>

<details><summary><code>hq_*</code> (2)</summary>

- [`hq_outbound_duplicate_cleanup.sql`](../sql/hq_outbound_duplicate_cleanup.sql) — apply
- [`hq_warehouse_stock_movement_agg.sql`](../sql/hq_warehouse_stock_movement_agg.sql)

</details>

<details><summary><code>inbound_*</code> (2)</summary>

- [`inbound_krw_fx_fields.sql`](../sql/inbound_krw_fx_fields.sql)
- [`inbound_po_receive_diagnostic.sql`](../sql/inbound_po_receive_diagnostic.sql) — diagnose

</details>

<details><summary><code>income_*</code> (2)</summary>

- [`income_expense_closing_runs.sql`](../sql/income_expense_closing_runs.sql)
- [`income_statement_overrides.sql`](../sql/income_statement_overrides.sql)

</details>

<details><summary><code>inventory_*</code> (2)</summary>

- [`inventory_stock_rpc_tenant.sql`](../sql/inventory_stock_rpc_tenant.sql) — rpc
- [`inventory_tenant_id.sql`](../sql/inventory_tenant_id.sql)

</details>

<details><summary><code>leave_*</code> (2)</summary>

- [`leave_approvers_01_create.sql`](../sql/leave_approvers_01_create.sql)
- [`leave_request_duplicate_01_preview.sql`](../sql/leave_request_duplicate_01_preview.sql) — preview

</details>

<details><summary><code>marubkk_*</code> (2)</summary>

- [`marubkk_admin_pin_01_preview.sql`](../sql/marubkk_admin_pin_01_preview.sql) — preview
- [`marubkk_admin_pin_02_set_9999.sql`](../sql/marubkk_admin_pin_02_set_9999.sql) — apply

</details>

<details><summary><code>migrate_*</code> (2)</summary>

- [`migrate_pp30_auto_input_drafts_01_preview.sql`](../sql/migrate_pp30_auto_input_drafts_01_preview.sql) — preview
- [`migrate_pp30_auto_input_drafts_02_delete.sql`](../sql/migrate_pp30_auto_input_drafts_02_delete.sql) — apply

</details>

<details><summary><code>office_*</code> (2)</summary>

- [`office_inbound_location_unify.sql`](../sql/office_inbound_location_unify.sql)
- [`office_store_unify_cm_office.sql`](../sql/office_store_unify_cm_office.sql)

</details>

<details><summary><code>petty_*</code> (2)</summary>

- [`petty_cash_bank_link.sql`](../sql/petty_cash_bank_link.sql)
- [`petty_cash_invoice_vat.sql`](../sql/petty_cash_invoice_vat.sql)

</details>

<details><summary><code>pp30_*</code> (2)</summary>

- [`pp30_ekamai_2026_05_diagnostic.sql`](../sql/pp30_ekamai_2026_05_diagnostic.sql) — diagnose
- [`pp30_sales_adjustments.sql`](../sql/pp30_sales_adjustments.sql)

</details>

<details><summary><code>rename_*</code> (2)</summary>

- [`rename_omni_jr_inter_login_company_to_jrinter.sql`](../sql/rename_omni_jr_inter_login_company_to_jrinter.sql)
- [`rename_omni_jr_inter_login_company_to_jrinter_verify.sql`](../sql/rename_omni_jr_inter_login_company_to_jrinter_verify.sql) — verify

</details>

<details><summary><code>reset_*</code> (2)</summary>

- [`reset_omni_jrinter_pin_01_preview.sql`](../sql/reset_omni_jrinter_pin_01_preview.sql) — preview
- [`reset_omni_jrinter_pin_02_update.sql`](../sql/reset_omni_jrinter_pin_02_update.sql) — apply

</details>

<details><summary><code>sauces_*</code> (2)</summary>

- [`sauces_rls_anon_read_optional.sql`](../sql/sauces_rls_anon_read_optional.sql) — rls
- [`sauces_usage_kind.sql`](../sql/sauces_usage_kind.sql)

</details>

<details><summary><code>sql_*</code> (2)</summary>

- [`sql_applied_log_01_table.sql`](../sql/sql_applied_log_01_table.sql) — log
- [`sql_applied_log_02_recent.sql`](../sql/sql_applied_log_02_recent.sql) — log

</details>

<details><summary><code>tenant_*</code> (2)</summary>

- [`tenant_integrations.sql`](../sql/tenant_integrations.sql)
- [`tenant_stage_price_overrides.sql`](../sql/tenant_stage_price_overrides.sql)

</details>

<details><summary><code>admin_*</code> (1)</summary>

- [`admin_help_handover_notes.sql`](../sql/admin_help_handover_notes.sql)

</details>

<details><summary><code>api_*</code> (1)</summary>

- [`api_request_idempotency_keys.sql`](../sql/api_request_idempotency_keys.sql)

</details>

<details><summary><code>audit_*</code> (1)</summary>

- [`audit_office_payroll_managers.sql`](../sql/audit_office_payroll_managers.sql) — diagnose

</details>

<details><summary><code>borrowing_*</code> (1)</summary>

- [`borrowing_transactions.sql`](../sql/borrowing_transactions.sql)

</details>

<details><summary><code>card_*</code> (1)</summary>

- [`card_accounts_extra_columns.sql`](../sql/card_accounts_extra_columns.sql)

</details>

<details><summary><code>chicken_*</code> (1)</summary>

- [`chicken_option_groups_part_only.sql`](../sql/chicken_option_groups_part_only.sql)

</details>

<details><summary><code>complete_*</code> (1)</summary>

- [`complete_barbq_chicken_option_bom_from_base.sql`](../sql/complete_barbq_chicken_option_bom_from_base.sql)

</details>

<details><summary><code>disable_*</code> (1)</summary>

- [`disable_saas_admin_2fa.sql`](../sql/disable_saas_admin_2fa.sql)

</details>

<details><summary><code>emergency_*</code> (1)</summary>

- [`emergency_stop_kitchen_print_job_backlog_20260817.sql`](../sql/emergency_stop_kitchen_print_job_backlog_20260817.sql)

</details>

<details><summary><code>employee_*</code> (1)</summary>

- [`employee_warning_letter_registry.sql`](../sql/employee_warning_letter_registry.sql)

</details>

<details><summary><code>enqueue_*</code> (1)</summary>

- [`enqueue_pos_print_job_deploy.sql`](../sql/enqueue_pos_print_job_deploy.sql)

</details>

<details><summary><code>items_*</code> (1)</summary>

- [`items_account_subject_id.sql`](../sql/items_account_subject_id.sql)

</details>

<details><summary><code>notice_*</code> (1)</summary>

- [`notice_enhancements.sql`](../sql/notice_enhancements.sql)

</details>

<details><summary><code>notices_*</code> (1)</summary>

- [`notices_worklog_interior_tenant_id.sql`](../sql/notices_worklog_interior_tenant_id.sql)

</details>

<details><summary><code>outbound_*</code> (1)</summary>

- [`outbound_soft_delete_integrity_checks.sql`](../sql/outbound_soft_delete_integrity_checks.sql) — verify, apply

</details>

<details><summary><code>patch_*</code> (1)</summary>

- [`patch_head_office_vendor.sql`](../sql/patch_head_office_vendor.sql)

</details>

<details><summary><code>po_*</code> (1)</summary>

- [`po_billing_settings.sql`](../sql/po_billing_settings.sql)

</details>

<details><summary><code>product_*</code> (1)</summary>

- [`product_catalog.sql`](../sql/product_catalog.sql)

</details>

<details><summary><code>purchase_*</code> (1)</summary>

- [`purchase_tax_invoices.sql`](../sql/purchase_tax_invoices.sql)

</details>

<details><summary><code>repair_*</code> (1)</summary>

- [`repair_receivable_invoice_no_tax_overwrite.sql`](../sql/repair_receivable_invoice_no_tax_overwrite.sql) — apply

</details>

<details><summary><code>restore_*</code> (1)</summary>

- [`restore_barbq_chicken_option_bom_from_c011.sql`](../sql/restore_barbq_chicken_option_bom_from_c011.sql)

</details>

<details><summary><code>sales_*</code> (1)</summary>

- [`sales_promo_discount_audit.sql`](../sql/sales_promo_discount_audit.sql) — diagnose

</details>

<details><summary><code>schedule_*</code> (1)</summary>

- [`schedule_edit_logs_01_create.sql`](../sql/schedule_edit_logs_01_create.sql)

</details>

<details><summary><code>schedules_*</code> (1)</summary>

- [`schedules_employee_code.sql`](../sql/schedules_employee_code.sql)

</details>

<details><summary><code>upsert_*</code> (1)</summary>

- [`upsert_kbank_store_mid_huamak_seacon.sql`](../sql/upsert_kbank_store_mid_huamak_seacon.sql) — apply

</details>

<details><summary><code>vat_*</code> (1)</summary>

- [`vat_ledger_invoice_evidence.sql`](../sql/vat_ledger_invoice_evidence.sql)

</details>

<details><summary><code>w0_*</code> (1)</summary>

- [`w0_pos_tenant_store_uniques.sql`](../sql/w0_pos_tenant_store_uniques.sql)

</details>

<details><summary><code>withholding_*</code> (1)</summary>

- [`withholding_tax_ledger_source_direction.sql`](../sql/withholding_tax_ledger_source_direction.sql)

</details>

<details><summary><code>legacy/</code> (144)</summary>

- [`legacy/pos_promos_grab_campaign_times.sql`](../sql/legacy/pos_promos_grab_campaign_times.sql)
- [`legacy/repair_grab_pos_orders_store_code.sql`](../sql/legacy/repair_grab_pos_orders_store_code.sql)
- [`legacy/supabase_add_account_subjects.sql`](../sql/legacy/supabase_add_account_subjects.sql)
- [`legacy/supabase_add_account_subjects_excel_sync.sql`](../sql/legacy/supabase_add_account_subjects_excel_sync.sql)
- [`legacy/supabase_add_approved_indices.sql`](../sql/legacy/supabase_add_approved_indices.sql)
- [`legacy/supabase_add_bank_account_bank_name.sql`](../sql/legacy/supabase_add_bank_account_bank_name.sql)
- [`legacy/supabase_add_bank_and_fixed_expenses.sql`](../sql/legacy/supabase_add_bank_and_fixed_expenses.sql)
- [`legacy/supabase_add_bank_expense_date.sql`](../sql/legacy/supabase_add_bank_expense_date.sql)
- [`legacy/supabase_add_bank_invoice_check.sql`](../sql/legacy/supabase_add_bank_invoice_check.sql)
- [`legacy/supabase_add_bank_invoice_photo.sql`](../sql/legacy/supabase_add_bank_invoice_photo.sql)
- [`legacy/supabase_add_bank_memo_mapping_rules.sql`](../sql/legacy/supabase_add_bank_memo_mapping_rules.sql)
- [`legacy/supabase_add_bank_memo_rules.sql`](../sql/legacy/supabase_add_bank_memo_rules.sql)
- [`legacy/supabase_add_bank_receivable_payable_link.sql`](../sql/legacy/supabase_add_bank_receivable_payable_link.sql)
- [`legacy/supabase_add_bank_sales_date.sql`](../sql/legacy/supabase_add_bank_sales_date.sql)
- [`legacy/supabase_add_bank_transaction_category.sql`](../sql/legacy/supabase_add_bank_transaction_category.sql)
- [`legacy/supabase_add_bank_transaction_inbound_links.sql`](../sql/legacy/supabase_add_bank_transaction_inbound_links.sql)
- [`legacy/supabase_add_bank_transaction_note.sql`](../sql/legacy/supabase_add_bank_transaction_note.sql)
- [`legacy/supabase_add_checklist_sort_order.sql`](../sql/legacy/supabase_add_checklist_sort_order.sql)
- [`legacy/supabase_add_delivery_dates_by_outbound.sql`](../sql/legacy/supabase_add_delivery_dates_by_outbound.sql)
- [`legacy/supabase_add_employee_columns.sql`](../sql/legacy/supabase_add_employee_columns.sql)
- [`legacy/supabase_add_employee_id_card_photo.sql`](../sql/legacy/supabase_add_employee_id_card_photo.sql)
- [`legacy/supabase_add_employee_id_number_address.sql`](../sql/legacy/supabase_add_employee_id_number_address.sql)
- [`legacy/supabase_add_food_raw_materials_account_subject.sql`](../sql/legacy/supabase_add_food_raw_materials_account_subject.sql)
- [`legacy/supabase_add_inbound_batches.sql`](../sql/legacy/supabase_add_inbound_batches.sql)
- [`legacy/supabase_add_inbound_batches_invoice_received.sql`](../sql/legacy/supabase_add_inbound_batches_invoice_received.sql)
- [`legacy/supabase_add_inbound_batches_po_no.sql`](../sql/legacy/supabase_add_inbound_batches_po_no.sql)
- [`legacy/supabase_add_indexes_performance.sql`](../sql/legacy/supabase_add_indexes_performance.sql)
- [`legacy/supabase_add_items_description.sql`](../sql/legacy/supabase_add_items_description.sql)
- [`legacy/supabase_add_leave_reject_reason.sql`](../sql/legacy/supabase_add_leave_reject_reason.sql)
- [`legacy/supabase_add_orders_reject_reason.sql`](../sql/legacy/supabase_add_orders_reject_reason.sql)
- [`legacy/supabase_add_original_order_qty_json.sql`](../sql/legacy/supabase_add_original_order_qty_json.sql)
- [`legacy/supabase_add_petty_cash_account_subject.sql`](../sql/legacy/supabase_add_petty_cash_account_subject.sql)
- [`legacy/supabase_add_pos_sales_import.sql`](../sql/legacy/supabase_add_pos_sales_import.sql)
- [`legacy/supabase_add_purchase_order_withholding.sql`](../sql/legacy/supabase_add_purchase_order_withholding.sql)
- [`legacy/supabase_add_received_indices.sql`](../sql/legacy/supabase_add_received_indices.sql)
- [`legacy/supabase_add_received_qty_json.sql`](../sql/legacy/supabase_add_received_qty_json.sql)
- [`legacy/supabase_add_revenue_account_subjects.sql`](../sql/legacy/supabase_add_revenue_account_subjects.sql)
- [`legacy/supabase_add_stock_logs_unit_cost.sql`](../sql/legacy/supabase_add_stock_logs_unit_cost.sql)
- [`legacy/supabase_add_stock_logs_user_name.sql`](../sql/legacy/supabase_add_stock_logs_user_name.sql)
- [`legacy/supabase_add_vendor_direct_settlement.sql`](../sql/legacy/supabase_add_vendor_direct_settlement.sql)
- [`legacy/supabase_allow_multiple_visits_per_day.sql`](../sql/legacy/supabase_allow_multiple_visits_per_day.sql)
- [`legacy/supabase_annual_leave_days.sql`](../sql/legacy/supabase_annual_leave_days.sql)
- [`legacy/supabase_apply_dedup_and_unique.sql`](../sql/legacy/supabase_apply_dedup_and_unique.sql)
- [`legacy/supabase_attendance_logs_ot_early_min.sql`](../sql/legacy/supabase_attendance_logs_ot_early_min.sql)
- [`legacy/supabase_chicken_remove_s_순살_options.sql`](../sql/legacy/supabase_chicken_remove_s_%EC%88%9C%EC%82%B4_options.sql)
- [`legacy/supabase_cleanup_accounting.sql`](../sql/legacy/supabase_cleanup_accounting.sql)
- [`legacy/supabase_cleanup_attendance_approval.sql`](../sql/legacy/supabase_cleanup_attendance_approval.sql)
- [`legacy/supabase_cleanup_leave_and_set_annual.sql`](../sql/legacy/supabase_cleanup_leave_and_set_annual.sql)
- [`legacy/supabase_cleanup_leave_non_office.sql`](../sql/legacy/supabase_cleanup_leave_non_office.sql)
- [`legacy/supabase_cleanup_notices_only.sql`](../sql/legacy/supabase_cleanup_notices_only.sql)
- [`legacy/supabase_cleanup_order_inbound_outbound.sql`](../sql/legacy/supabase_cleanup_order_inbound_outbound.sql)
- [`legacy/supabase_cleanup_test_data.sql`](../sql/legacy/supabase_cleanup_test_data.sql)
- [`legacy/supabase_dedup_once.sql`](../sql/legacy/supabase_dedup_once.sql)
- [`legacy/supabase_dedupe.sql`](../sql/legacy/supabase_dedupe.sql)
- [`legacy/supabase_enable_rls_all_tables.sql`](../sql/legacy/supabase_enable_rls_all_tables.sql)
- [`legacy/supabase_etax_tables.sql`](../sql/legacy/supabase_etax_tables.sql)
- [`legacy/supabase_fix_annual_leave_default.sql`](../sql/legacy/supabase_fix_annual_leave_default.sql)
- [`legacy/supabase_fix_partial_delivery_status.sql`](../sql/legacy/supabase_fix_partial_delivery_status.sql)
- [`legacy/supabase_fix_pos_orders_snippet.sql`](../sql/legacy/supabase_fix_pos_orders_snippet.sql)
- [`legacy/supabase_fix_rls_deny_anon.sql`](../sql/legacy/supabase_fix_rls_deny_anon.sql)
- [`legacy/supabase_fix_schedule_dates.sql`](../sql/legacy/supabase_fix_schedule_dates.sql)
- [`legacy/supabase_fix_store_visits_unique.sql`](../sql/legacy/supabase_fix_store_visits_unique.sql)
- [`legacy/supabase_fix_true_attendance_date_confusion.sql`](../sql/legacy/supabase_fix_true_attendance_date_confusion.sql)
- [`legacy/supabase_interior.sql`](../sql/legacy/supabase_interior.sql)
- [`legacy/supabase_interior_bank_ref.sql`](../sql/legacy/supabase_interior_bank_ref.sql)
- [`legacy/supabase_invoice_settings.sql`](../sql/legacy/supabase_invoice_settings.sql)
- [`legacy/supabase_item_categories.sql`](../sql/legacy/supabase_item_categories.sql)
- [`legacy/supabase_items_category_store_only.sql`](../sql/legacy/supabase_items_category_store_only.sql)
- [`legacy/supabase_items_dedup_first.sql`](../sql/legacy/supabase_items_dedup_first.sql)
- [`legacy/supabase_items_order_disabled.sql`](../sql/legacy/supabase_items_order_disabled.sql)
- [`legacy/supabase_items_outbound_location.sql`](../sql/legacy/supabase_items_outbound_location.sql)
- [`legacy/supabase_items_purchase_source.sql`](../sql/legacy/supabase_items_purchase_source.sql)
- [`legacy/supabase_items_sort_order.sql`](../sql/legacy/supabase_items_sort_order.sql)
- [`legacy/supabase_items_tax_면세_to_과세.sql`](../sql/legacy/supabase_items_tax_%EB%A9%B4%EC%84%B8_to_%EA%B3%BC%EC%84%B8.sql)
- [`legacy/supabase_items_total_quantity.sql`](../sql/legacy/supabase_items_total_quantity.sql)
- [`legacy/supabase_leave_certificate.sql`](../sql/legacy/supabase_leave_certificate.sql)
- [`legacy/supabase_marketing.sql`](../sql/legacy/supabase_marketing.sql)
- [`legacy/supabase_marketing_campaign_id_pos.sql`](../sql/legacy/supabase_marketing_campaign_id_pos.sql)
- [`legacy/supabase_migrate_purchase_orders.sql`](../sql/legacy/supabase_migrate_purchase_orders.sql)
- [`legacy/supabase_migrate_store_name_add_cm_prefix.sql`](../sql/legacy/supabase_migrate_store_name_add_cm_prefix.sql)
- [`legacy/supabase_migration_consolidated.sql`](../sql/legacy/supabase_migration_consolidated.sql)
- [`legacy/supabase_migration_consolidated_v2_clean.sql`](../sql/legacy/supabase_migration_consolidated_v2_clean.sql)
- [`legacy/supabase_migration_employee_salary_history.sql`](../sql/legacy/supabase_migration_employee_salary_history.sql)
- [`legacy/supabase_migration_employee_tax_sso.sql`](../sql/legacy/supabase_migration_employee_tax_sso.sql)
- [`legacy/supabase_migration_item_vendors.sql`](../sql/legacy/supabase_migration_item_vendors.sql)
- [`legacy/supabase_migration_vendors_sales_outlet.sql`](../sql/legacy/supabase_migration_vendors_sales_outlet.sql)
- [`legacy/supabase_migrations/add_plan_in_prev_day.sql`](../sql/legacy/supabase_migrations/add_plan_in_prev_day.sql)
- [`legacy/supabase_performance_indexes.sql`](../sql/legacy/supabase_performance_indexes.sql)
- [`legacy/supabase_petty_cash.sql`](../sql/legacy/supabase_petty_cash.sql)
- [`legacy/supabase_petty_cash_receipt.sql`](../sql/legacy/supabase_petty_cash_receipt.sql)
- [`legacy/supabase_pos_coupons.sql`](../sql/legacy/supabase_pos_coupons.sql)
- [`legacy/supabase_pos_fees.sql`](../sql/legacy/supabase_pos_fees.sql)
- [`legacy/supabase_pos_menu_cost_and_options.sql`](../sql/legacy/supabase_pos_menu_cost_and_options.sql)
- [`legacy/supabase_pos_menu_ingredient_type.sql`](../sql/legacy/supabase_pos_menu_ingredient_type.sql)
- [`legacy/supabase_pos_menu_options_full.sql`](../sql/legacy/supabase_pos_menu_options_full.sql)
- [`legacy/supabase_pos_menus.sql`](../sql/legacy/supabase_pos_menus.sql)
- [`legacy/supabase_pos_menus_add_sold_out.sql`](../sql/legacy/supabase_pos_menus_add_sold_out.sql)
- [`legacy/supabase_pos_menus_apply_category_presets_now.sql`](../sql/legacy/supabase_pos_menus_apply_category_presets_now.sql)
- [`legacy/supabase_pos_menus_category_main.sql`](../sql/legacy/supabase_pos_menus_category_main.sql)
- [`legacy/supabase_pos_menus_category_main_ko_to_en.sql`](../sql/legacy/supabase_pos_menus_category_main_ko_to_en.sql)
- [`legacy/supabase_pos_menus_category_presets.sql`](../sql/legacy/supabase_pos_menus_category_presets.sql)
- [`legacy/supabase_pos_menus_code_prefix.sql`](../sql/legacy/supabase_pos_menus_code_prefix.sql)
- [`legacy/supabase_pos_menus_dual_price.sql`](../sql/legacy/supabase_pos_menus_dual_price.sql)
- [`legacy/supabase_pos_menus_fix_null_code.sql`](../sql/legacy/supabase_pos_menus_fix_null_code.sql)
- [`legacy/supabase_pos_menus_kitchen_printer.sql`](../sql/legacy/supabase_pos_menus_kitchen_printer.sql)
- [`legacy/supabase_pos_option_groups.sql`](../sql/legacy/supabase_pos_option_groups.sql)
- [`legacy/supabase_pos_options_sell_channels.sql`](../sql/legacy/supabase_pos_options_sell_channels.sql)
- [`legacy/supabase_pos_orders.sql`](../sql/legacy/supabase_pos_orders.sql)
- [`legacy/supabase_pos_orders_add_created_by.sql`](../sql/legacy/supabase_pos_orders_add_created_by.sql)
- [`legacy/supabase_pos_orders_add_discount.sql`](../sql/legacy/supabase_pos_orders_add_discount.sql)
- [`legacy/supabase_pos_orders_add_memo.sql`](../sql/legacy/supabase_pos_orders_add_memo.sql)
- [`legacy/supabase_pos_orders_add_stock_deducted.sql`](../sql/legacy/supabase_pos_orders_add_stock_deducted.sql)
- [`legacy/supabase_pos_orders_allow_update_only.sql`](../sql/legacy/supabase_pos_orders_allow_update_only.sql)
- [`legacy/supabase_pos_orders_index_store_created.sql`](../sql/legacy/supabase_pos_orders_index_store_created.sql)
- [`legacy/supabase_pos_orders_rls_anon_fix.sql`](../sql/legacy/supabase_pos_orders_rls_anon_fix.sql)
- [`legacy/supabase_pos_orders_rls_insert_update.sql`](../sql/legacy/supabase_pos_orders_rls_insert_update.sql)
- [`legacy/supabase_pos_orders_rls_reset.sql`](../sql/legacy/supabase_pos_orders_rls_reset.sql)
- [`legacy/supabase_pos_orders_table_layouts_rls_policies.sql`](../sql/legacy/supabase_pos_orders_table_layouts_rls_policies.sql)
- [`legacy/supabase_pos_printer_settings.sql`](../sql/legacy/supabase_pos_printer_settings.sql)
- [`legacy/supabase_pos_printer_settings_add_auto_stock.sql`](../sql/legacy/supabase_pos_printer_settings_add_auto_stock.sql)
- [`legacy/supabase_pos_printer_settings_cooking_rules.sql`](../sql/legacy/supabase_pos_printer_settings_cooking_rules.sql)
- [`legacy/supabase_pos_promos.sql`](../sql/legacy/supabase_pos_promos.sql)
- [`legacy/supabase_pos_settlements.sql`](../sql/legacy/supabase_pos_settlements.sql)
- [`legacy/supabase_pos_settlements_cash_and_breakdowns.sql`](../sql/legacy/supabase_pos_settlements_cash_and_breakdowns.sql)
- [`legacy/supabase_pos_split_payment.sql`](../sql/legacy/supabase_pos_split_payment.sql)
- [`legacy/supabase_pos_table_layouts.sql`](../sql/legacy/supabase_pos_table_layouts.sql)
- [`legacy/supabase_pos_till_transactions.sql`](../sql/legacy/supabase_pos_till_transactions.sql)
- [`legacy/supabase_price_history.sql`](../sql/legacy/supabase_price_history.sql)
- [`legacy/supabase_price_history_enable_rls.sql`](../sql/legacy/supabase_price_history_enable_rls.sql)
- [`legacy/supabase_push_tokens.sql`](../sql/legacy/supabase_push_tokens.sql)
- [`legacy/supabase_push_tokens_lang.sql`](../sql/legacy/supabase_push_tokens_lang.sql)
- [`legacy/supabase_receivable_payable.sql`](../sql/legacy/supabase_receivable_payable.sql)
- [`legacy/supabase_replace_store_seacon_srinakarin.sql`](../sql/legacy/supabase_replace_store_seacon_srinakarin.sql)
- [`legacy/supabase_revert_rls_to_previous.sql`](../sql/legacy/supabase_revert_rls_to_previous.sql)
- [`legacy/supabase_rpc_get_store_stock.sql`](../sql/legacy/supabase_rpc_get_store_stock.sql)
- [`legacy/supabase_sauces.sql`](../sql/legacy/supabase_sauces.sql)
- [`legacy/supabase_schema.sql`](../sql/legacy/supabase_schema.sql)
- [`legacy/supabase_store_items_category.sql`](../sql/legacy/supabase_store_items_category.sql)
- [`legacy/supabase_store_job_headcount.sql`](../sql/legacy/supabase_store_job_headcount.sql)
- [`legacy/supabase_system_settings.sql`](../sql/legacy/supabase_system_settings.sql)
- [`legacy/supabase_system_settings_rls_policy.sql`](../sql/legacy/supabase_system_settings_rls_policy.sql)
- [`legacy/supabase_update_bank_category.sql`](../sql/legacy/supabase_update_bank_category.sql)
- [`legacy/supabase_update_card_to_thai_brands.sql`](../sql/legacy/supabase_update_card_to_thai_brands.sql)
- [`legacy/supabase_update_vendor_548_office_gps.sql`](../sql/legacy/supabase_update_vendor_548_office_gps.sql)

</details>

<details><summary><code>archive/</code> (49)</summary>

- [`archive/diagnose/diagnose_abc_company_login_pos_menus.sql`](../sql/archive/diagnose/diagnose_abc_company_login_pos_menus.sql)
- [`archive/diagnose/diagnose_bank_expense_link_empty_candidates.sql`](../sql/archive/diagnose/diagnose_bank_expense_link_empty_candidates.sql)
- [`archive/diagnose/diagnose_barbq_chicken_option_bom.sql`](../sql/archive/diagnose/diagnose_barbq_chicken_option_bom.sql)
- [`archive/diagnose/diagnose_bbq_two_phase_fields.sql`](../sql/archive/diagnose/diagnose_bbq_two_phase_fields.sql)
- [`archive/diagnose/diagnose_cm006_july_outbound_vs_inbound.sql`](../sql/archive/diagnose/diagnose_cm006_july_outbound_vs_inbound.sql)
- [`archive/diagnose/diagnose_cm027_sep_stock_01_asof.sql`](../sql/archive/diagnose/diagnose_cm027_sep_stock_01_asof.sql)
- [`archive/diagnose/diagnose_cm027_sep_stock_02_summary.sql`](../sql/archive/diagnose/diagnose_cm027_sep_stock_02_summary.sql)
- [`archive/diagnose/diagnose_cm027_sep_stock_03_lines.sql`](../sql/archive/diagnose/diagnose_cm027_sep_stock_03_lines.sql)
- [`archive/diagnose/diagnose_cm027_sep_stock_04_orphan_preview.sql`](../sql/archive/diagnose/diagnose_cm027_sep_stock_04_orphan_preview.sql)
- [`archive/diagnose/diagnose_cm027_sep_stock_05_orphan_apply.sql`](../sql/archive/diagnose/diagnose_cm027_sep_stock_05_orphan_apply.sql)
- [`archive/diagnose/diagnose_employee_phone_dup_0953845476.sql`](../sql/archive/diagnose/diagnose_employee_phone_dup_0953845476.sql)
- [`archive/diagnose/diagnose_force_outbound_reference_no_ivf72075.sql`](../sql/archive/diagnose/diagnose_force_outbound_reference_no_ivf72075.sql)
- [`archive/diagnose/diagnose_hq_accounting_po_receivable.sql`](../sql/archive/diagnose/diagnose_hq_accounting_po_receivable.sql)
- [`archive/diagnose/diagnose_hq_like_receivable_pepsi_office_01_apo89.sql`](../sql/archive/diagnose/diagnose_hq_like_receivable_pepsi_office_01_apo89.sql)
- [`archive/diagnose/diagnose_hq_like_receivable_pepsi_office_02_cm_office.sql`](../sql/archive/diagnose/diagnose_hq_like_receivable_pepsi_office_02_cm_office.sql)
- [`archive/diagnose/diagnose_hq_like_receivable_pepsi_office_03_bank_2824.sql`](../sql/archive/diagnose/diagnose_hq_like_receivable_pepsi_office_03_bank_2824.sql)
- [`archive/diagnose/diagnose_hq_like_receivable_pepsi_office_04_erp_stores.sql`](../sql/archive/diagnose/diagnose_hq_like_receivable_pepsi_office_04_erp_stores.sql)
- [`archive/diagnose/diagnose_hq_like_receivable_pepsi_office_05_po89_lines.sql`](../sql/archive/diagnose/diagnose_hq_like_receivable_pepsi_office_05_po89_lines.sql)
- [`archive/diagnose/diagnose_kimchi_soup_with_rice_cost.sql`](../sql/archive/diagnose/diagnose_kimchi_soup_with_rice_cost.sql)
- [`archive/diagnose/diagnose_loan_deposit_posted_as_revenue.sql`](../sql/archive/diagnose/diagnose_loan_deposit_posted_as_revenue.sql)
- [`archive/diagnose/diagnose_m007359_stamp_no_coupon.sql`](../sql/archive/diagnose/diagnose_m007359_stamp_no_coupon.sql)
- [`archive/diagnose/diagnose_member_notifications_m007359.sql`](../sql/archive/diagnose/diagnose_member_notifications_m007359.sql)
- [`archive/diagnose/diagnose_member_notifications_m007359_followup.sql`](../sql/archive/diagnose/diagnose_member_notifications_m007359_followup.sql)
- [`archive/diagnose/diagnose_member_notifications_m007359_path.sql`](../sql/archive/diagnose/diagnose_member_notifications_m007359_path.sql)
- [`archive/diagnose/diagnose_menu_29_kimchi_soup_with_rice.sql`](../sql/archive/diagnose/diagnose_menu_29_kimchi_soup_with_rice.sql)
- [`archive/diagnose/diagnose_office_payroll_expense_aggregate.sql`](../sql/archive/diagnose/diagnose_office_payroll_expense_aggregate.sql)
- [`archive/diagnose/diagnose_omni_pos_print_jobs_exists.sql`](../sql/archive/diagnose/diagnose_omni_pos_print_jobs_exists.sql)
- [`archive/diagnose/diagnose_orphan_force_push_01_summary.sql`](../sql/archive/diagnose/diagnose_orphan_force_push_01_summary.sql)
- [`archive/diagnose/diagnose_orphan_force_push_02_lines.sql`](../sql/archive/diagnose/diagnose_orphan_force_push_02_lines.sql)
- [`archive/diagnose/diagnose_orphan_force_push_03_reverse.sql`](../sql/archive/diagnose/diagnose_orphan_force_push_03_reverse.sql)
- [`archive/diagnose/diagnose_orphan_force_push_04_vs_adjust.sql`](../sql/archive/diagnose/diagnose_orphan_force_push_04_vs_adjust.sql)
- [`archive/diagnose/diagnose_orphan_force_push_05_adjust_lines.sql`](../sql/archive/diagnose/diagnose_orphan_force_push_05_adjust_lines.sql)
- [`archive/diagnose/diagnose_orphan_force_push_06_delete_preview.sql`](../sql/archive/diagnose/diagnose_orphan_force_push_06_delete_preview.sql)
- [`archive/diagnose/diagnose_orphan_force_push_07_delete_apply.sql`](../sql/archive/diagnose/diagnose_orphan_force_push_07_delete_apply.sql)
- [`archive/diagnose/diagnose_pos_1001_tenant_and_category.sql`](../sql/archive/diagnose/diagnose_pos_1001_tenant_and_category.sql)
- [`archive/diagnose/diagnose_pos_menus_hidden_but_code_exists.sql`](../sql/archive/diagnose/diagnose_pos_menus_hidden_but_code_exists.sql)
- [`archive/diagnose/diagnose_pos_menus_store_1001_scope.sql`](../sql/archive/diagnose/diagnose_pos_menus_store_1001_scope.sql)
- [`archive/diagnose/diagnose_rpkm2026_promo_code.sql`](../sql/archive/diagnose/diagnose_rpkm2026_promo_code.sql)
- [`archive/diagnose/diagnose_silom_delivery_sales_01_status.sql`](../sql/archive/diagnose/diagnose_silom_delivery_sales_01_status.sql)
- [`archive/diagnose/diagnose_silom_delivery_sales_02_grab_webhook.sql`](../sql/archive/diagnose/diagnose_silom_delivery_sales_02_grab_webhook.sql)
- [`archive/diagnose/diagnose_silom_delivery_sales_03_paid_at.sql`](../sql/archive/diagnose/diagnose_silom_delivery_sales_03_paid_at.sql)
- [`archive/diagnose/diagnose_silom_tax_wh_195_dup_01_accruals.sql`](../sql/archive/diagnose/diagnose_silom_tax_wh_195_dup_01_accruals.sql)
- [`archive/diagnose/diagnose_silom_tax_wh_195_dup_02_payables.sql`](../sql/archive/diagnose/diagnose_silom_tax_wh_195_dup_02_payables.sql)
- [`archive/diagnose/diagnose_silom_tax_wh_195_dup_03_linked.sql`](../sql/archive/diagnose/diagnose_silom_tax_wh_195_dup_03_linked.sql)
- [`archive/diagnose/diagnose_silom_tax_wh_195_dup_04_journals.sql`](../sql/archive/diagnose/diagnose_silom_tax_wh_195_dup_04_journals.sql)
- [`archive/diagnose/diagnose_silom_tax_wh_195_dup_05_verify.sql`](../sql/archive/diagnose/diagnose_silom_tax_wh_195_dup_05_verify.sql)
- [`archive/diagnose/diagnose_stamp10_m007359.sql`](../sql/archive/diagnose/diagnose_stamp10_m007359.sql)
- [`archive/diagnose/diagnose_stamp_and_promo_systemic.sql`](../sql/archive/diagnose/diagnose_stamp_and_promo_systemic.sql)
- [`archive/diagnose/diagnose_tax_entity_mapping_live.sql`](../sql/archive/diagnose/diagnose_tax_entity_mapping_live.sql)

</details>

<!-- sql-index:auto:end -->
