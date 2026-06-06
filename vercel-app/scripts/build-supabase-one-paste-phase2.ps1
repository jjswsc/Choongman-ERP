# Generates sql/supabase_one_paste_phase2.sql from section sources.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sqlDir = Join-Path $root "sql"
$out = Join-Path $sqlDir "supabase_one_paste_phase2.sql"

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
-- supabase_one_paste_phase2.sql  (auto-generated)
-- Supabase SQL Editor: paste entire file and Run (UTF-8)
--
-- 선행: supabase_one_paste_all_in_one.sql (또는 §2 기본 스키마) 실행 후
-- Regenerate: vercel-app/scripts/build-supabase-one-paste-phase2.ps1
-- Guide: vercel-app/sql/SUPABASE_EDITOR_RUNBOOK.md
--
-- Includes: paid_at, HR, member tiers, CRM coupons, petty cash VAT, compliance RPCs
-- Excludes: diagnostic SELECTs, erp_stores alias seed (별도), K/T menu recovery
-- ============================================================

'@

$parts = @($header.TrimEnd())

Add-Section "23 pos_orders paid_at" (Join-Path $sqlDir "pos_orders_paid_at.sql")
Add-Section "24 menu ingredients quantity_unit_key" (Join-Path $sqlDir "pos_menu_ingredients_quantity_unit_key.sql")
Add-Section "25 hr policies reads" (Join-Path $sqlDir "hr_policies_hr_policy_reads.sql")
Add-Section "26 member tiers portal" (Join-Path $sqlDir "member_tiers_portal_benefits.sql")
Add-Section "27 member tier upgrade basis" (Join-Path $sqlDir "member_tier_upgrade_basis.sql")
Add-Section "28 crm coupon campaigns" (Join-Path $sqlDir "crm_coupon_campaigns_phase1.sql")
Add-Section "29 pos_coupons marketing_campaign_id" (Join-Path $sqlDir "pos_coupons_marketing_campaign_id.sql")
Add-Section "30 pos_promos grab campaign time" (Join-Path $sqlDir "pos_promos_grab_campaign_time_bkk.sql")
Add-Section "31 expense accruals invoice" (Join-Path $sqlDir "expense_accruals_invoice_received.sql")
Add-Section "32 petty cash invoice vat" (Join-Path $sqlDir "petty_cash_invoice_vat.sql")
Add-Section "33 get_petty_cash_summary RPC" (Join-Path $sqlDir "get_petty_cash_summary.sql")
Add-Section "34 pos vat compliance RPCs" (Join-Path $sqlDir "accounting_pos_compliance_reconciliation_rpc.sql")

$parts += ""
$parts += "-- ============================================================"
$parts += "-- END supabase_one_paste_phase2.sql"
$parts += "-- ============================================================"

[System.IO.File]::WriteAllText($out, ($parts -join [Environment]::NewLine) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
$size = (Get-Item $out).Length
Write-Host "Wrote $out ($size bytes)"
