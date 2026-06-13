import type { TenantItem } from "./saas-admin-control-plane"
import {
  moduleBillingLimitsFromTenant,
  resolveModuleChargeWithLimits,
} from "./saas-module-billing"
import { normalizeModulePrices, SAAS_MODULE_KEYS, type SaasModuleKey, type SaasModulePriceRow } from "./saas-module-pricing"

export type PartnerSettlementLine = {
  tenantId: string
  companyName: string
  billingCycle: TenantItem["billingCycle"]
  wholesale: number
  margin: number
  retail: number
  currency: string
}

export type PartnerSettlementSummary = {
  partnerId: string
  periodYm: string
  currency: string
  wholesaleTotal: number
  marginTotal: number
  retailTotal: number
  tenantCount: number
  lines: PartnerSettlementLine[]
}

function wholesaleModules(modules: Record<SaasModuleKey, SaasModulePriceRow>): Record<SaasModuleKey, SaasModulePriceRow> {
  const out = {} as Record<SaasModuleKey, SaasModulePriceRow>
  for (const key of SAAS_MODULE_KEYS) {
    const row = modules[key]
    out[key] = {
      ...row,
      monthly: Number(row.wholesaleMonthly ?? row.monthly ?? 0),
      yearly: Number(row.wholesaleYearly ?? row.yearly ?? 0),
    }
  }
  return out
}

export function computeTenantPricingTotals(tenant: TenantItem): { wholesale: number; margin: number; retail: number } {
  if (tenant.status === "suspended") {
    return { wholesale: 0, margin: 0, retail: 0 }
  }
  const pricingMode = tenant.policy.pricingMode ?? tenant.pricing.pricingMode ?? "stage"
  const limits = moduleBillingLimitsFromTenant(tenant)
  const modulePrices = normalizeModulePrices(tenant.pricing.modulePrices)

  if (pricingMode !== "module") {
    const retail = tenant.pricing.currentChargeAmount
    return { wholesale: retail, margin: 0, retail }
  }

  const retailBreakdown = resolveModuleChargeWithLimits(modulePrices, tenant.billingCycle, tenant.usage, limits)
  const wholesaleBreakdown = resolveModuleChargeWithLimits(
    wholesaleModules(modulePrices),
    tenant.billingCycle,
    tenant.usage,
    limits
  )
  const retail = retailBreakdown.total
  const wholesale = wholesaleBreakdown.total
  return { wholesale, margin: Math.max(0, retail - wholesale), retail }
}

export function buildPartnerSettlement(params: {
  partnerId: string
  periodYm: string
  tenants: TenantItem[]
}): PartnerSettlementSummary {
  const lines: PartnerSettlementLine[] = []
  let wholesaleTotal = 0
  let marginTotal = 0
  let retailTotal = 0
  const currency = params.tenants[0]?.pricing.currency || "THB"

  for (const tenant of params.tenants) {
    if (tenant.partnerId !== params.partnerId) continue
    const totals = computeTenantPricingTotals(tenant)
    wholesaleTotal += totals.wholesale
    marginTotal += totals.margin
    retailTotal += totals.retail
    lines.push({
      tenantId: tenant.id,
      companyName: tenant.companyName,
      billingCycle: tenant.billingCycle,
      wholesale: totals.wholesale,
      margin: totals.margin,
      retail: totals.retail,
      currency: tenant.pricing.currency || currency,
    })
  }

  lines.sort((a, b) => b.retail - a.retail)

  return {
    partnerId: params.partnerId,
    periodYm: params.periodYm,
    currency,
    wholesaleTotal,
    marginTotal,
    retailTotal,
    tenantCount: lines.length,
    lines,
  }
}

export function bangkokPeriodYm(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 7)
}

function escapeCsvCell(value: unknown): string {
  const s = String(value ?? "")
  if (!/[",\n]/.test(s)) return s
  return `"${s.replace(/"/g, '""')}"`
}

export function buildPartnerSettlementCsv(summary: PartnerSettlementSummary): string {
  const header = ["partner_id", "period", "tenant_id", "company", "cycle", "wholesale", "margin", "retail", "currency"]
  const rows = summary.lines.map((line) =>
    [
      summary.partnerId,
      summary.periodYm,
      line.tenantId,
      line.companyName,
      line.billingCycle,
      line.wholesale,
      line.margin,
      line.retail,
      line.currency,
    ]
      .map(escapeCsvCell)
      .join(",")
  )
  const footer = [
    "",
    summary.periodYm,
    "TOTAL",
    "",
    "",
    summary.wholesaleTotal,
    summary.marginTotal,
    summary.retailTotal,
    summary.currency,
  ]
    .map(escapeCsvCell)
    .join(",")
  return [header.join(","), ...rows, footer].join("\n")
}

export function buildPartnerSettlementHtml(
  summary: PartnerSettlementSummary,
  labels: { title: string; partner: string; period: string; wholesale: string; margin: string; retail: string; total: string }
): string {
  const lineRows = summary.lines
    .map(
      (line) =>
        `<tr><td>${line.companyName}<br><small>${line.tenantId}</small></td><td>${line.billingCycle}</td><td style="text-align:right">${line.wholesale.toLocaleString()}</td><td style="text-align:right">${line.margin.toLocaleString()}</td><td style="text-align:right">${line.retail.toLocaleString()}</td></tr>`
    )
    .join("")
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${labels.title}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px}th{background:#f5f5f5}</style></head>
<body><h1>${labels.title}</h1>
<p>${labels.partner}: <strong>${summary.partnerId}</strong> · ${labels.period}: <strong>${summary.periodYm}</strong></p>
<table><thead><tr><th>Customer</th><th>Cycle</th><th style="text-align:right">${labels.wholesale}</th><th style="text-align:right">${labels.margin}</th><th style="text-align:right">${labels.retail}</th></tr></thead>
<tbody>${lineRows}</tbody>
<tfoot><tr><th colspan="2">${labels.total}</th><th style="text-align:right">${summary.wholesaleTotal.toLocaleString()}</th><th style="text-align:right">${summary.marginTotal.toLocaleString()}</th><th style="text-align:right">${summary.retailTotal.toLocaleString()}</th></tr></tfoot>
</table>
<p style="font-size:12px;color:#666">${summary.currency} · ${summary.tenantCount} tenants</p>
</body></html>`
}

export function buildPartnerWholesaleInvoiceHtml(
  summary: PartnerSettlementSummary,
  partnerName: string,
  labels: { title: string; subtitle: string; amountDue: string }
): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${labels.title}</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px">
<h1>${labels.title}</h1>
<p>${labels.subtitle}</p>
<p><strong>${partnerName}</strong> (${summary.partnerId}) · ${summary.periodYm}</p>
<p style="font-size:24px">${labels.amountDue}: <strong>${summary.wholesaleTotal.toLocaleString()} ${summary.currency}</strong></p>
<p style="font-size:12px;color:#666">Platform wholesale charges for ${summary.tenantCount} customer(s).</p>
</body></html>`
}
