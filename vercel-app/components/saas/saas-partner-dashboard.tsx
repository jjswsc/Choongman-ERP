"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { TenantItem } from "@/lib/saas-admin-control-plane"
import { aggregateSaasRevenueStats } from "@/lib/saas-module-billing"
import { buildPartnerSettlement, bangkokPeriodYm } from "@/lib/saas-partner-settlement"
import { tr, useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { useSaasScope } from "@/components/saas/saas-scope-context"
import { SAAS_PRICING_TONE } from "@/components/saas/saas-pricing-visual"
import { SaasStatCard } from "@/components/saas/saas-stat-card"
import { useMemo } from "react"

type Props = {
  tenants: TenantItem[]
  loading?: boolean
}

export function SaasPartnerDashboard({ tenants, loading }: Props) {
  const t = useT(useLang().lang)
  const scope = useSaasScope()
  const periodYm = bangkokPeriodYm()

  const partnerTenants = useMemo(
    () => tenants.filter((x) => x.partnerId === scope.partnerId),
    [scope.partnerId, tenants]
  )

  const revenue = useMemo(() => aggregateSaasRevenueStats(partnerTenants), [partnerTenants])
  const settlement = useMemo(
    () =>
      scope.partnerId
        ? buildPartnerSettlement({ partnerId: scope.partnerId, periodYm, tenants: partnerTenants })
        : null,
    [partnerTenants, periodYm, scope.partnerId]
  )

  if (!scope.isPartner || !scope.partnerId) return null

  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-bold tracking-tight">
            {tr(t, "saasAdminPartnerDash_title", { name: scope.partnerName || scope.partnerId })}
          </CardTitle>
          <CardDescription className="text-sm">{t("saasAdminPartnerDash_intro")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/saas-admin/customers">{t("saasAdminNavCustomers")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/saas-admin/partners/${encodeURIComponent(scope.partnerId)}`}>
              {t("saasAdminPartnerDash_settlementLink")}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <SaasStatCard
          tone="tenants"
          label={t("saasAdminPartners_colTenants")}
          value={loading ? "…" : partnerTenants.length}
        />
        <SaasStatCard
          tone="wholesale"
          label={t("saasAdminDash_mrrWholesale")}
          value={loading ? "…" : `${revenue.wholesaleMrr.toLocaleString()} THB`}
        />
        <SaasStatCard
          tone="margin"
          label={t("saasAdminDash_mrrPartnerMargin")}
          value={loading ? "…" : `${revenue.partnerMarginMrr.toLocaleString()} THB`}
        />
        <SaasStatCard
          tone="retail"
          label={t("saasAdminDash_mrrRetail")}
          value={loading ? "…" : `${revenue.retailMrr.toLocaleString()} THB`}
        />
      </div>

      {settlement && settlement.lines.length > 0 ? (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t("saasAdminPartnerDash_topCustomers")}</CardTitle>
            <CardDescription>{tr(t, "saasAdminPartnerDash_period", { period: periodYm })}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{t("saasAdminCust_colTenant")}</TableHead>
                  <TableHead className={SAAS_PRICING_TONE.margin.head + " text-right"}>{t("saasAdminCust_marginThb")}</TableHead>
                  <TableHead className={SAAS_PRICING_TONE.retail.head + " text-right"}>{t("saasAdminCust_retailThb")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlement.lines.slice(0, 5).map((line) => (
                  <TableRow key={line.tenantId}>
                    <TableCell>
                      <div className="font-medium">{line.companyName}</div>
                      <Badge variant="outline" className="mt-1 text-[10px] font-normal">
                        {line.billingCycle}
                      </Badge>
                    </TableCell>
                    <TableCell className={SAAS_PRICING_TONE.margin.cell}>{line.margin.toLocaleString()}</TableCell>
                    <TableCell className={SAAS_PRICING_TONE.retail.cell}>{line.retail.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
