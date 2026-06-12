import type { BillingCycle, FeatureFlags, TenantItem, TenantLimits, TenantPolicy, TenantUsage } from "./saas-admin-control-plane"
import { resolveCurrentChargeAmount } from "./saas-admin-control-plane"
import type { PosDeviceBillingBasis } from "./saas-tenant-pos-licensed"
import { resolvePosDeviceBillingBasis } from "./saas-tenant-pos-licensed"
import {
  applyCatalogPricesToModules,
  cloneDefaultModulePrices,
  normalizeModulePrices,
  resolveModuleChargeAmount,
  syncModuleEnabledFromFeatures,
  SAAS_MODULE_KEYS,
  SAAS_MODULE_LABEL_KEY,
  type ModuleChargeResult,
  type SaasModuleKey,
  type SaasModulePriceRow,
} from "./saas-module-pricing"

export type ModuleBillingLimits = {
  maxPosDevices: number
  allowOverage: boolean
  licensedFromAdmin?: number
  posDeviceBillingBasis?: PosDeviceBillingBasis
  tenantId?: string
  pricingMode?: "stage" | "module"
}

export type BillablePosDevices = {
  reported: number
  billable: number
  capped: boolean
  basis: PosDeviceBillingBasis
}

export function resolveBillablePosDevices(
  usage: Pick<TenantUsage, "posDevices" | "licensedPosDevices">,
  limits?: Partial<ModuleBillingLimits>
): BillablePosDevices {
  const reported = Math.max(0, Math.floor(Number(usage.posDevices || 0)))
  const basis = resolvePosDeviceBillingBasis(
    String(limits?.tenantId || ""),
    limits?.pricingMode ?? "module",
    limits?.posDeviceBillingBasis
  )
  const licensedAdmin = Math.max(0, Math.floor(Number(usage.licensedPosDevices ?? limits?.licensedFromAdmin ?? 0)))

  if (basis === "saas_limit") {
    const billable = Math.max(0, Math.floor(Number(limits?.maxPosDevices ?? 0)))
    return { reported, billable, capped: false, basis }
  }

  if (basis === "erp_admin") {
    const fromErp = licensedAdmin > 0 ? licensedAdmin : Math.max(0, Math.floor(Number(limits?.maxPosDevices ?? 0)))
    if (limits?.allowOverage === true) {
      return { reported, billable: fromErp, capped: false, basis }
    }
    return {
      reported,
      billable: fromErp,
      capped: reported > fromErp,
      basis,
    }
  }

  // usage: 실등록 대수, 한도 초과 시 캡(allowOverage 아닐 때)
  if (limits?.allowOverage === true) {
    return { reported, billable: reported, capped: false, basis }
  }
  const max = Math.max(0, Math.floor(Number(limits?.maxPosDevices ?? reported)))
  const billable = Math.min(reported, max)
  return { reported, billable, capped: billable < reported, basis }
}

export function resolveModuleChargeWithLimits(
  modules: Record<SaasModuleKey, SaasModulePriceRow>,
  cycle: BillingCycle,
  usage: Pick<TenantUsage, "posDevices" | "licensedPosDevices">,
  limits?: Partial<ModuleBillingLimits>
): ModuleChargeResult & BillablePosDevices {
  const pos = resolveBillablePosDevices(usage, limits)
  const result = resolveModuleChargeAmount(modules, cycle, { posDevices: pos.billable })
  return { ...result, ...pos }
}

export function resolveEffectiveChargeWithLimits(params: {
  pricingMode: "stage" | "module"
  billingCycle: BillingCycle
  stageAmount: number
  modulePrices: Record<SaasModuleKey, SaasModulePriceRow>
  posDeviceBillingBasis?: PosDeviceBillingBasis
  usage: Pick<TenantUsage, "posDevices" | "licensedPosDevices">
  limits?: Partial<ModuleBillingLimits>
}): number {
  if (params.pricingMode === "module") {
    return resolveModuleChargeWithLimits(
      params.modulePrices,
      params.billingCycle,
      params.usage,
      params.limits
    ).total
  }
  return params.stageAmount
}

export function moduleBillingLimitsFromTenant(tenant: Pick<TenantItem, "id" | "limits" | "policy" | "usage">): ModuleBillingLimits {
  return {
    maxPosDevices: tenant.limits.maxPosDevices,
    allowOverage: tenant.policy.allowOverage,
    licensedFromAdmin: tenant.usage.licensedPosDevices,
    posDeviceBillingBasis: tenant.policy.posDeviceBillingBasis,
    tenantId: tenant.id,
    pricingMode: tenant.policy.pricingMode ?? "module",
  }
}

export type ModulePricingChange = {
  moduleKey: SaasModuleKey
  before: Partial<SaasModulePriceRow> | null
  after: SaasModulePriceRow
}

export function diffModulePricing(
  before: Record<SaasModuleKey, SaasModulePriceRow> | null | undefined,
  after: Record<SaasModuleKey, SaasModulePriceRow>
): ModulePricingChange[] {
  const changes: ModulePricingChange[] = []
  for (const moduleKey of SAAS_MODULE_KEYS) {
    const prev = before?.[moduleKey]
    const next = after[moduleKey]
    const enabledChanged = (prev?.isEnabled ?? false) !== (next.isEnabled === true)
    const monthlyChanged = Number(prev?.monthly ?? -1) !== Number(next.monthly)
    const yearlyChanged = Number(prev?.yearly ?? -1) !== Number(next.yearly)
    if (!prev || enabledChanged || monthlyChanged || yearlyChanged) {
      changes.push({ moduleKey, before: prev ?? null, after: next })
    }
  }
  return changes
}

export function summarizeModulePricingChanges(changes: ModulePricingChange[]): string {
  if (changes.length === 0) return "no module pricing changes"
  return changes
    .slice(0, 8)
    .map((c) => {
      const on = c.after.isEnabled ? "on" : "off"
      const prevOn = c.before?.isEnabled ? "on" : "off"
      if (c.before && c.before.isEnabled !== c.after.isEnabled) {
        return `${c.moduleKey}:${prevOn}->${on}`
      }
      return `${c.moduleKey}:${on}@${c.after.monthly}/${c.after.yearly}`
    })
    .join(", ")
}

export function buildModuleBillingMemo(params: {
  pricingMode: "stage" | "module"
  salesStage: string
  billingCycle: BillingCycle
  amount: number
  currency: string
  breakdown?: ModuleChargeResult
  pos?: BillablePosDevices
}): string {
  const parts = [
    `mode=${params.pricingMode}`,
    `stage=${params.salesStage}`,
    `cycle=${params.billingCycle}`,
    `amount=${params.amount} ${params.currency}`,
  ]
  if (params.pos?.capped) {
    parts.push(`pos=${params.pos.billable}/${params.pos.reported}(capped)`)
  }
  if (params.pricingMode === "module" && params.breakdown) {
    const lines = params.breakdown.lines
      .filter((x) => x.isCustomQuote || x.lineTotal > 0)
      .slice(0, 10)
      .map((x) => (x.isCustomQuote ? `${x.key}:quote` : `${x.key}:${x.quantity}x${x.unitAmount}=${x.lineTotal}`))
    if (lines.length > 0) parts.push(`modules=[${lines.join("; ")}]`)
  }
  const text = parts.join(", ")
  return text.length > 900 ? `${text.slice(0, 897)}...` : text
}

export type SaasRevenueStats = {
  activeTenants: number
  moduleMrr: number
  stageMrr: number
  totalMrr: number
  moduleAdoption: Array<{ moduleKey: SaasModuleKey; labelKey: string; tenantCount: number }>
  topModuleTenants: Array<{ tenantId: string; companyName: string; amount: number; pricingMode: "stage" | "module" }>
}

export function aggregateSaasRevenueStats(tenants: TenantItem[]): SaasRevenueStats {
  const adoption = new Map<SaasModuleKey, number>()
  const top: SaasRevenueStats["topModuleTenants"] = []
  let moduleMrr = 0
  let stageMrr = 0
  let activeTenants = 0

  for (const tenant of tenants) {
    if (tenant.status === "suspended") continue
    activeTenants += 1
    const pricingMode = tenant.policy.pricingMode ?? tenant.pricing.pricingMode ?? "stage"
    const limits = moduleBillingLimitsFromTenant(tenant)
    const modulePrices = normalizeModulePrices(tenant.pricing.modulePrices)
    let amount = 0

    if (pricingMode === "module") {
      const breakdown = resolveModuleChargeWithLimits(
        modulePrices,
        tenant.billingCycle,
        tenant.usage,
        limits
      )
      amount = breakdown.total
      moduleMrr += amount
      for (const line of breakdown.lines) {
        if (line.isCustomQuote || line.lineTotal <= 0) continue
        adoption.set(line.key, (adoption.get(line.key) || 0) + 1)
      }
    } else {
      amount = tenant.pricing.currentChargeAmount
      stageMrr += amount
    }

    top.push({ tenantId: tenant.id, companyName: tenant.companyName, amount, pricingMode })
  }

  top.sort((a, b) => b.amount - a.amount)

  const moduleAdoption = SAAS_MODULE_KEYS.map((moduleKey) => ({
    moduleKey,
    labelKey: SAAS_MODULE_LABEL_KEY[moduleKey],
    tenantCount: adoption.get(moduleKey) || 0,
  }))
    .filter((x) => x.tenantCount > 0)
    .sort((a, b) => b.tenantCount - a.tenantCount)

  return {
    activeTenants,
    moduleMrr,
    stageMrr,
    totalMrr: moduleMrr + stageMrr,
    moduleAdoption,
    topModuleTenants: top.slice(0, 10),
  }
}

export function buildInitialTenantModulePrices(
  catalog: Record<SaasModuleKey, SaasModulePriceRow>,
  features: FeatureFlags
): Record<SaasModuleKey, SaasModulePriceRow> {
  return syncModuleEnabledFromFeatures(
    applyCatalogPricesToModules(cloneDefaultModulePrices(), catalog),
    features
  )
}

export function buildNewTenantPricing(params: {
  catalog: Record<SaasModuleKey, SaasModulePriceRow>
  features: FeatureFlags
  salesStage: TenantItem["policy"]["salesStage"]
  billingCycle: BillingCycle
  stagePrices: TenantItem["pricing"]["stagePrices"]
  posDeviceBillingBasis?: PosDeviceBillingBasis
  usage: Pick<TenantUsage, "posDevices" | "licensedPosDevices">
  limits: TenantLimits
  policy: TenantPolicy
}): TenantItem["pricing"] {
  const modulePrices = buildInitialTenantModulePrices(params.catalog, params.features)
  const pricingMode = params.policy.pricingMode ?? "module"
  const stageAmount = resolveCurrentChargeAmount(params.salesStage, params.billingCycle, params.stagePrices)
  const currentChargeAmount = resolveEffectiveChargeWithLimits({
    pricingMode,
    billingCycle: params.billingCycle,
    stageAmount,
    modulePrices,
    usage: params.usage,
    limits: { maxPosDevices: params.limits.maxPosDevices, allowOverage: params.policy.allowOverage },
  })
  return {
    currency: "THB",
    pricingMode,
    stagePrices: params.stagePrices,
    modulePrices,
    currentChargeAmount,
  }
}

export type ModuleInvoiceLine = {
  moduleKey: SaasModuleKey
  labelKey: string
  quantity: number
  unitAmount: number
  lineTotal: number
  isCustomQuote?: boolean
}

export function buildModuleInvoiceLines(
  tenant: TenantItem,
  moduleLabels?: Record<string, string>
): { lines: ModuleInvoiceLine[]; total: number; currency: string; pos: BillablePosDevices } {
  const pricingMode = tenant.policy.pricingMode ?? tenant.pricing.pricingMode ?? "stage"
  const modulePrices = normalizeModulePrices(tenant.pricing.modulePrices)
  const limits = moduleBillingLimitsFromTenant(tenant)
  if (pricingMode !== "module") {
    return {
      lines: [],
      total: tenant.pricing.currentChargeAmount,
      currency: tenant.pricing.currency,
      pos: resolveBillablePosDevices(tenant.usage, limits),
    }
  }
  const breakdown = resolveModuleChargeWithLimits(
    modulePrices,
    tenant.billingCycle,
    tenant.usage,
    limits
  )
  const lines: ModuleInvoiceLine[] = breakdown.lines.map((line) => ({
    moduleKey: line.key,
    labelKey: moduleLabels?.[line.labelKey] || line.labelKey,
    quantity: line.quantity,
    unitAmount: line.unitAmount,
    lineTotal: line.lineTotal,
    isCustomQuote: line.isCustomQuote,
  }))
  return {
    lines,
    total: breakdown.total,
    currency: tenant.pricing.currency,
    pos: { reported: breakdown.reported, billable: breakdown.billable, capped: breakdown.capped, basis: breakdown.basis },
  }
}

function escapeCsvCell(value: unknown): string {
  const s = String(value ?? "")
  if (!/[",\n]/.test(s)) return s
  return `"${s.replace(/"/g, '""')}"`
}

export function buildModuleInvoiceCsv(tenant: TenantItem, labels: Record<string, string>): string {
  const { lines, total, currency, pos } = buildModuleInvoiceLines(tenant, labels)
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
  const header = ["tenant_id", "company", "invoice_date", "billing_cycle", "module", "qty", "unit_thb", "line_total_thb"]
  const rows = lines.map((line) => [
    tenant.id,
    tenant.companyName,
    ymd,
    tenant.billingCycle,
    labels[line.labelKey] || line.labelKey,
    line.isCustomQuote ? "quote" : String(line.quantity),
    line.isCustomQuote ? "" : String(line.unitAmount),
    line.isCustomQuote ? "" : String(line.lineTotal),
  ])
  const footer = ["", "", "", "", "TOTAL", "", "", String(total), currency]
  if (pos.capped) {
    rows.push(["", "", "", "", "POS_NOTE", `${pos.billable}/${pos.reported}`, "capped", ""])
  }
  return [header, ...rows, footer].map((row) => row.map(escapeCsvCell).join(",")).join("\n")
}

export function buildModuleInvoiceHtml(tenant: TenantItem, labels: Record<string, string>): string {
  const { lines, total, currency, pos } = buildModuleInvoiceLines(tenant, labels)
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
  const cycleLabel = tenant.billingCycle === "yearly" ? "Yearly" : "Monthly"
  const lineRows = lines
    .map((line) => {
      const name = labels[line.labelKey] || line.labelKey
      if (line.isCustomQuote) {
        return `<tr><td>${name}</td><td colspan="3" style="text-align:right;color:#666">Custom quote</td></tr>`
      }
      return `<tr><td>${name}</td><td style="text-align:right">${line.quantity}</td><td style="text-align:right">${line.unitAmount.toLocaleString()}</td><td style="text-align:right">${line.lineTotal.toLocaleString()}</td></tr>`
    })
    .join("")
  const capNote = pos.capped
    ? `<p style="color:#b45309;font-size:12px">POS terminals billed: ${pos.billable} (in use ${pos.reported}, capped by plan limit)</p>`
    : ""
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${tenant.companyName}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #ddd;padding:8px}th{background:#f5f5f5;text-align:left}.total{font-weight:700;font-size:18px;margin-top:16px}</style></head>
<body><h1>Module billing estimate</h1>
<p><strong>${tenant.companyName}</strong> (${tenant.id})<br>Date: ${ymd} · Cycle: ${cycleLabel} · Currency: ${currency}</p>
${capNote}
<table><thead><tr><th>Module</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit (THB)</th><th style="text-align:right">Subtotal</th></tr></thead>
<tbody>${lineRows || `<tr><td colspan="4">Package billing (non-module mode)</td></tr>`}</tbody></table>
<p class="total">Total: ${total.toLocaleString()} ${currency}</p>
<p style="font-size:12px;color:#666">OmniFoodTech SaaS — estimate for internal billing. Not a tax invoice.</p>
</body></html>`
}

export function buildModuleInvoiceEmailHtml(tenant: TenantItem, labels: Record<string, string>, note?: string): string {
  const inner = buildModuleInvoiceHtml(tenant, labels)
  const extra = note ? `<p>${note.replace(/</g, "&lt;")}</p>` : ""
  return inner.replace("</body>", `${extra}</body>`)
}
