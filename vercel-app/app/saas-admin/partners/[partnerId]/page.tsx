"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { appAlert } from "@/lib/app-message"
import { apiFetch } from "@/lib/api/fetch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSaasScope } from "@/components/saas/saas-scope-context"
import { type TenantItem } from "@/lib/saas-admin-control-plane"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  bangkokPeriodYm,
  buildPartnerSettlement,
  buildPartnerSettlementCsv,
  buildPartnerSettlementHtml,
  buildPartnerWholesaleInvoiceHtml,
} from "@/lib/saas-partner-settlement"
import {
  billingPartyFromPartner,
  emptySaasBillingCompanyInfo,
  type SaasBillingCompanyInfo,
} from "@/lib/saas-billing-company-profile"
import { SaasBillingCompanyFields } from "@/components/saas/saas-billing-company-fields"
import type { CatalogRepricePolicy } from "@/lib/saas-partner-pricing-policy"
import { SAAS_MODULE_KEYS, SAAS_MODULE_LABEL_KEY, type SaasModuleKey } from "@/lib/saas-module-pricing"
import { SaasPricingBreakdownVisual, SaasPricingColumnHead } from "@/components/saas/saas-pricing-breakdown-visual"
import { SAAS_PRICING_TONE } from "@/components/saas/saas-pricing-visual"
import { SaasStatCard } from "@/components/saas/saas-stat-card"

type PartnerDetail = {
  id: string
  name: string
  defaultMarginPct: number
  catalogRepricePolicy: CatalogRepricePolicy
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  billingCompany: SaasBillingCompanyInfo
  isActive: boolean
  tenantCount?: number
  userCount?: number
}

type PartnerUser = {
  id: number
  employeeId: number
  role: string
  isActive: boolean
  employee: { company: string; store: string; name: string; role: string } | null
}

type EmployeeHit = {
  id: number
  company: string
  store: string
  name: string
  role: string
}

export default function SaasPartnerDetailPage() {
  const partnerId = String(useParams()?.partnerId || "")
  const { lang } = useLang()
  const t = useT(lang)
  const scope = useSaasScope()
  const [partner, setPartner] = useState<PartnerDetail | null>(null)
  const [partnerUsers, setPartnerUsers] = useState<PartnerUser[]>([])
  const [marginRules, setMarginRules] = useState<Partial<Record<SaasModuleKey, string>>>({})
  const [tenants, setTenants] = useState<TenantItem[]>([])
  const [periodYm, setPeriodYm] = useState(bangkokPeriodYm())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [employeeQuery, setEmployeeQuery] = useState("")
  const [employeeHits, setEmployeeHits] = useState<EmployeeHit[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [detailRes, tenantRes] = await Promise.all([
        apiFetch(`/api/saasAdminPartners?partnerId=${encodeURIComponent(partnerId)}`),
        apiFetch("/api/getSaasTenantSettings"),
      ])
      const detailJson = (await detailRes.json()) as {
        success?: boolean
        partner?: PartnerDetail
        partnerUsers?: PartnerUser[]
        marginRules?: Array<{ moduleKey: SaasModuleKey; marginPct: number }>
        message?: string
      }
      if (!detailRes.ok || detailJson.success !== true || !detailJson.partner) {
        await appAlert(detailJson.message || t("saasAdminPartners_errLoad"))
        return
      }
      setPartner({
        ...detailJson.partner,
        billingCompany: detailJson.partner.billingCompany ?? emptySaasBillingCompanyInfo(),
      })
      setPartnerUsers(detailJson.partnerUsers || [])
      const rules: Partial<Record<SaasModuleKey, string>> = {}
      for (const key of SAAS_MODULE_KEYS) {
        const hit = detailJson.marginRules?.find((r) => r.moduleKey === key)
        rules[key] = hit != null ? String(hit.marginPct) : String(detailJson.partner.defaultMarginPct ?? 0)
      }
      setMarginRules(rules)

      const tenantJson = (await tenantRes.json()) as { success?: boolean; tenants?: TenantItem[] }
      if (tenantRes.ok && tenantJson.success === true && Array.isArray(tenantJson.tenants)) {
        setTenants(tenantJson.tenants.filter((x) => x.partnerId === partnerId))
      } else {
        setTenants([])
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setLoading(false)
    }
  }, [partnerId, t])

  useEffect(() => {
    void load()
  }, [load])

  const settlement = useMemo(
    () => buildPartnerSettlement({ partnerId, periodYm, tenants }),
    [partnerId, periodYm, tenants]
  )

  const searchEmployees = async () => {
    const q = employeeQuery.trim()
    if (!q) return
    try {
      const res = await apiFetch(`/api/saasAdminPartners?employeeSearch=${encodeURIComponent(q)}`)
      const json = (await res.json()) as { success?: boolean; employees?: EmployeeHit[] }
      if (!res.ok || json.success !== true) return
      setEmployeeHits(json.employees || [])
    } catch {
      setEmployeeHits([])
    }
  }

  const linkEmployee = async (employeeId: number) => {
    setSaving(true)
    try {
      const res = await apiFetch("/api/saasAdminPartners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkUser: { partnerId, employeeId } }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminPartners_errSave"))
        return
      }
      setEmployeeHits([])
      setEmployeeQuery("")
      await load()
      await appAlert(t("saasAdminPartners_linked"))
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const saveMarginRules = async () => {
    setSaving(true)
    try {
      const rules = SAAS_MODULE_KEYS.map((moduleKey) => ({
        moduleKey,
        marginPct: Math.max(0, Number(marginRules[moduleKey] || 0)),
      }))
      const res = await apiFetch("/api/saasAdminPartners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marginRules: { partnerId, rules } }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminPartners_errSave"))
        return
      }
      await appAlert(t("saasAdminPartnerDetail_rulesSaved"))
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const saveRepricePolicy = async (policy: CatalogRepricePolicy) => {
    setSaving(true)
    try {
      const res = await apiFetch("/api/saasAdminPartners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogRepricePolicy: { partnerId, policy } }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminPartners_errSave"))
        return
      }
      setPartner((prev) => (prev ? { ...prev, catalogRepricePolicy: policy } : prev))
      await appAlert(t("saasAdminPartnerDetail_policySaved"))
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const savePartnerCompany = async () => {
    if (!partner) return
    setSaving(true)
    try {
      const res = await apiFetch("/api/saasAdminPartners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner: {
            id: partner.id,
            name: partner.name,
            defaultMarginPct: partner.defaultMarginPct,
            catalogRepricePolicy: partner.catalogRepricePolicy,
            contactName: partner.contactName,
            contactPhone: partner.contactPhone,
            contactEmail: partner.contactEmail,
            billingCompany: partner.billingCompany,
            isActive: partner.isActive,
          },
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminPartners_errSave"))
        return
      }
      await appAlert(t("saasAdminPartnerDetail_companySaved"))
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const saveSettlementSnapshot = async (status: "draft" | "confirmed" | "paid") => {
    setSaving(true)
    try {
      const res = await apiFetch("/api/saasAdminPartnerSettlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId,
          periodYm,
          status,
          summary: {
            wholesaleTotal: settlement.wholesaleTotal,
            marginTotal: settlement.marginTotal,
            retailTotal: settlement.retailTotal,
            tenantCount: settlement.tenantCount,
            currency: settlement.currency,
          },
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminPartners_errSave"))
        return
      }
      await appAlert(t("saasAdminPartnerDetail_settlementSaved"))
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const exportCsv = () => {
    const blob = new Blob([buildPartnerSettlementCsv(settlement)], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `partner_settlement_${partnerId}_${periodYm}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const printHtml = (kind: "settlement" | "wholesale") => {
    const partnerParty = billingPartyFromPartner({
      name: partner?.name || partnerId,
      contactName: partner?.contactName,
      contactPhone: partner?.contactPhone,
      contactEmail: partner?.contactEmail,
      billingCompany: partner?.billingCompany,
    })
    const html =
      kind === "wholesale"
        ? buildPartnerWholesaleInvoiceHtml(settlement, partnerParty, {
            title: t("saasAdminPartnerDetail_wholesaleInvoice"),
            subtitle: t("saasAdminPartnerDetail_wholesaleSubtitle"),
            amountDue: t("saasAdminPartnerDetail_amountDue"),
            billTo: t("saasAdminBillingCompany_billTo"),
            legalName: t("saasAdminBillingCompany_legalName"),
            taxId: t("saasAdminBillingCompany_taxId"),
            address: t("saasAdminBillingCompany_billingAddress"),
            contact: t("saasAdminBillingCompany_contactName"),
            email: t("saasAdminBillingCompany_billingEmail"),
          })
        : buildPartnerSettlementHtml(settlement, {
            title: t("saasAdminPartnerDetail_settlementTitle"),
            partner: t("saasAdminPartners_colName"),
            period: t("saasAdminPartnerDetail_period"),
            wholesale: t("saasAdminCust_wholesaleThb"),
            margin: t("saasAdminCust_marginThb"),
            retail: t("saasAdminCust_retailThb"),
            total: t("saasAdminPartnerDetail_total"),
          })
    const w = window.open("", "_blank", "noopener,noreferrer")
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }

  if (!scope.isPlatform && scope.partnerId !== partnerId) {
    return (
      <main className="p-6">
        <p className="text-sm text-muted-foreground">{t("saasAdminPartnerDetail_forbidden")}</p>
      </main>
    )
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Button type="button" variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href="/saas-admin/partners">{t("saasAdminPartnerDetail_back")}</Link>
          </Button>
          <h1 className="text-2xl font-semibold">{partner?.name || partnerId}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("saasAdminPartnerDetail_intro")}</p>
        </div>
        <Badge variant={partner?.isActive !== false ? "default" : "outline"}>
          {partner?.isActive !== false ? t("saasAdminPartners_active") : t("saasAdminPartners_inactive")}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <SaasStatCard
          tone="accent"
          label={t("saasAdminPartners_colMargin")}
          value={loading ? "…" : `${partner?.defaultMarginPct ?? 0}%`}
        />
        <SaasStatCard tone="tenants" label={t("saasAdminPartners_colTenants")} value={loading ? "…" : tenants.length} />
        <SaasStatCard
          tone="margin"
          label={t("saasAdminDash_mrrPartnerMargin")}
          value={loading ? "…" : `${settlement.marginTotal.toLocaleString()} THB`}
        />
        <SaasStatCard
          tone="retail"
          label={t("saasAdminDash_mrrRetail")}
          value={loading ? "…" : `${settlement.retailTotal.toLocaleString()} THB`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("saasAdminPartnerDetail_companyTitle")}</CardTitle>
            <CardDescription>{t("saasAdminPartnerDetail_companyDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {partner ? (
              <SaasBillingCompanyFields
                mode="partner"
                t={t}
                values={{
                  name: partner.name,
                  contactName: partner.contactName || "",
                  contactPhone: partner.contactPhone || "",
                  contactEmail: partner.contactEmail || "",
                  billingCompany: partner.billingCompany,
                }}
                onChange={(patch) => {
                  setPartner((prev) =>
                    prev
                      ? {
                          ...prev,
                          name: patch.name ?? prev.name,
                          contactName: patch.contactName ?? prev.contactName,
                          contactPhone: patch.contactPhone ?? prev.contactPhone,
                          contactEmail: patch.contactEmail ?? prev.contactEmail,
                          billingCompany: {
                            ...prev.billingCompany,
                            ...patch.billingCompany,
                          },
                        }
                      : prev
                  )
                }}
              />
            ) : null}
            <Button type="button" disabled={saving || !partner} onClick={() => void savePartnerCompany()}>
              {t("saasAdminPartnerDetail_saveCompany")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("saasAdminPartners_linkTitle")}</CardTitle>
            <CardDescription>{t("saasAdminPartners_linkDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={employeeQuery}
                onChange={(e) => setEmployeeQuery(e.target.value)}
                placeholder={t("saasAdminPartnerDetail_employeeSearchPh")}
              />
              <Button type="button" variant="outline" onClick={() => void searchEmployees()} disabled={saving}>
                {t("search")}
              </Button>
            </div>
            {employeeHits.length > 0 ? (
              <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                {employeeHits.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                    <div>
                      <span className="font-medium">{e.name || `#${e.id}`}</span>
                      <span className="text-muted-foreground ml-2">
                        {e.company} · {e.store} · id {e.id}
                      </span>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => void linkEmployee(e.id)} disabled={saving}>
                      {t("saasAdminPartners_linkBtn")}
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("saasAdminPartnerDetail_linkedUsers")}</TableHead>
                  <TableHead>employees.id</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partnerUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      {u.employee?.name || "—"}
                      <p className="text-xs text-muted-foreground">
                        {u.employee?.company} · {u.employee?.store}
                      </p>
                    </TableCell>
                    <TableCell>{u.employeeId}</TableCell>
                  </TableRow>
                ))}
                {partnerUsers.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      {t("saasAdmin_noData")}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("saasAdminPartnerDetail_repricePolicy")}</CardTitle>
            <CardDescription>{t("saasAdminPartnerDetail_repricePolicyDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select
              value={partner?.catalogRepricePolicy || "retain_margin_pct"}
              onValueChange={(v) => void saveRepricePolicy(v as CatalogRepricePolicy)}
              disabled={saving || !scope.isPlatform}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retain_margin_pct">{t("saasAdminPartnerDetail_policyMarginPct")}</SelectItem>
                <SelectItem value="retain_margin_amount">{t("saasAdminPartnerDetail_policyMarginAmount")}</SelectItem>
                <SelectItem value="retain_retail">{t("saasAdminPartnerDetail_policyRetail")}</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("saasAdminPartnerDetail_moduleMargins")}</CardTitle>
          <CardDescription>{t("saasAdminPartnerDetail_moduleMarginsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SAAS_MODULE_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <Label className="text-xs flex-1 truncate">{t(SAAS_MODULE_LABEL_KEY[key])}</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-8 w-20"
                  value={marginRules[key] ?? "0"}
                  onChange={(e) => setMarginRules((prev) => ({ ...prev, [key]: e.target.value }))}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            ))}
          </div>
          {scope.isPlatform ? (
            <Button type="button" size="sm" onClick={() => void saveMarginRules()} disabled={saving}>
              {t("saasAdminPartnerDetail_saveRules")}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-violet-200/60 shadow-sm dark:border-violet-900/50">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg font-semibold">{t("saasAdminPartnerDetail_settlementTitle")}</CardTitle>
              <CardDescription>{t("saasAdminPartnerDetail_settlementDesc")}</CardDescription>
            </div>
            <Input
              type="month"
              className="w-[160px] h-9 font-medium"
              value={periodYm}
              onChange={(e) => setPeriodYm(e.target.value || bangkokPeriodYm())}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={exportCsv}>
              {t("saasAdminCust_exportCsv")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => printHtml("settlement")}>
              {t("saasAdminPartnerDetail_printSettlement")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => printHtml("wholesale")}>
              {t("saasAdminPartnerDetail_printWholesale")}
            </Button>
            <Button type="button" size="sm" onClick={() => void saveSettlementSnapshot("draft")} disabled={saving}>
              {t("saasAdminPartnerDetail_saveDraft")}
            </Button>
            {scope.isPlatform ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => void saveSettlementSnapshot("confirmed")} disabled={saving}>
                {t("saasAdminPartnerDetail_confirmSettlement")}
              </Button>
            ) : null}
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>{t("saasAdminCust_colTenant")}</TableHead>
                <TableHead className="text-right">
                  <SaasPricingColumnHead tone="wholesale">{t("saasAdminCust_wholesaleThb")}</SaasPricingColumnHead>
                </TableHead>
                <TableHead className="text-right">
                  <SaasPricingColumnHead tone="margin">{t("saasAdminCust_marginThb")}</SaasPricingColumnHead>
                </TableHead>
                <TableHead className="text-right">
                  <SaasPricingColumnHead tone="retail">{t("saasAdminCust_retailThb")}</SaasPricingColumnHead>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlement.lines.map((line) => (
                <TableRow key={line.tenantId} className="hover:bg-muted/20">
                  <TableCell>
                    <div className="font-medium">{line.companyName}</div>
                    <p className="text-xs text-muted-foreground">{line.tenantId}</p>
                  </TableCell>
                  <TableCell className={SAAS_PRICING_TONE.wholesale.cell}>{line.wholesale.toLocaleString()}</TableCell>
                  <TableCell className={SAAS_PRICING_TONE.margin.cell}>{line.margin.toLocaleString()}</TableCell>
                  <TableCell className={SAAS_PRICING_TONE.retail.cell}>{line.retail.toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {settlement.lines.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t("saasAdmin_noData")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <SaasPricingBreakdownVisual
            wholesale={settlement.wholesaleTotal}
            margin={settlement.marginTotal}
            retail={settlement.retailTotal}
            currency={settlement.currency}
            labels={{
              wholesale: t("saasAdminCust_wholesaleThb"),
              margin: t("saasAdminCust_marginThb"),
              retail: t("saasAdminCust_retailThb"),
            }}
          />
        </CardContent>
      </Card>
    </main>
  )
}
