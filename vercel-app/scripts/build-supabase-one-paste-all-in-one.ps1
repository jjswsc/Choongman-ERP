# Generates sql/supabase_one_paste_all_in_one.sql from section sources.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sqlDir = Join-Path $root "sql"
$scriptsDir = Join-Path $root "scripts"
$out = Join-Path $sqlDir "supabase_one_paste_all_in_one.sql"

function Add-Section([string]$Title, [string]$Path) {
  if (-not (Test-Path $Path)) { throw "Missing: $Path" }
  $rel = $Path.Substring($root.Length + 1).Replace("\", "/")
  $script:parts += ""
  $script:parts += "-- ============================================================"
  $script:parts += "-- $Title"
  $script:parts += "-- source: $rel"
  $script:parts += "-- ============================================================"
  $script:parts += ""
  $script:parts += (Get-Content -Path $Path -Raw -Encoding UTF8).TrimEnd()
  $script:parts += ""
}

$header = @'
-- ============================================================
-- supabase_one_paste_all_in_one.sql  (auto-generated)
-- Supabase SQL Editor: paste entire file and Run (UTF-8)
--
-- Regenerate: vercel-app/scripts/build-supabase-one-paste-all-in-one.ps1
-- Guide: vercel-app/sql/SUPABASE_EDITOR_RUNBOOK.md
--
-- Includes: accounting, tax, POS, settlements, CRM, member portal, RPCs
-- Excludes: diagnostic SELECTs, K/T menu code recovery (run separately)
-- ============================================================

'@

$parts = @($header.TrimEnd())

Add-Section "1 accounting pos core" (Join-Path $sqlDir "supabase_one_paste_accounting_and_pos_printer_cut_clean.sql")
Add-Section "8 pos_settlements" (Join-Path $sqlDir "pos_settlements_bootstrap.sql")
Add-Section "9 pos_orders RLS" (Join-Path $sqlDir "pos_orders_rls_bootstrap.sql")
Add-Section "10 account_subjects 5528 5529" (Join-Path $sqlDir "account_subjects_delivery_card_fee.sql")
Add-Section "11 channel settlement" (Join-Path $sqlDir "pos_channel_settlement_deploy_one_paste.sql")
Add-Section "12 sell_hall delivery packaging" (Join-Path $sqlDir "pos_menus_sell_channels.sql")
Add-Section "13 drawer pin" (Join-Path $sqlDir "pos_printer_settings_drawer_pin.sql")
Add-Section "13b customer display lang" (Join-Path $sqlDir "pos_dual_monitor_language_override.sql")
Add-Section "14 banban flavor links" (Join-Path $sqlDir "pos_banban_flavor_links.sql")
Add-Section "15 payment method items" (Join-Path $scriptsDir "pos_payment_method_items.sql")
Add-Section "16 wechat alipay unionpay" (Join-Path $sqlDir "pos_payment_method_items_wechat_alipay_unionpay.sql")
Add-Section "17 delivery apps payment settings" (Join-Path $scriptsDir "pos_delivery_apps_schema.sql")
Add-Section "18 menu screen config" (Join-Path $scriptsDir "pos_menu_screen_config_schema.sql")
Add-Section "19 stock receivable RPCs" (Join-Path $sqlDir "supabase_rpc_egress_helpers_deploy.sql")
Add-Section "20 pos sales summary RPC" (Join-Path $sqlDir "get_pos_sales_period_summary_deploy.sql")
Add-Section "21 members CRM" (Join-Path $sqlDir "members_crm_scale_phase1_to_4.sql")
Add-Section "22 member portal CMS" (Join-Path $sqlDir "member_portal_content_cms.sql")

$parts += ""
$parts += "-- ============================================================"
$parts += "-- END supabase_one_paste_all_in_one.sql"
$parts += "-- ============================================================"

[System.IO.File]::WriteAllText($out, ($parts -join [Environment]::NewLine) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
$size = (Get-Item $out).Length
Write-Host "Wrote $out ($size bytes)"
