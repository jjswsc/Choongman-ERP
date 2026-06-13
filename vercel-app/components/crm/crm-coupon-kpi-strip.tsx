"use client"

import * as React from "react"
import { apiFetch } from "@/lib/api/fetch"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { CrmKpiCard } from "@/components/crm/crm-shared-ui"

type Stats = { issued: number; used: number; expired: number; active: number }

export function CrmCouponKpiStrip() {
  const { lang } = useLang()
  const t = useT(lang)
  const [stats, setStats] = React.useState<Stats>({ issued: 0, used: 0, expired: 0, active: 0 })

  React.useEffect(() => {
    apiFetch("/api/crm/coupon-stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { stats?: Stats }) => setStats(d.stats || { issued: 0, used: 0, expired: 0, active: 0 }))
      .catch(() => {})
  }, [])

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <CrmKpiCard label={t("crmCouponKpiIssued")} value={stats.issued.toLocaleString()} tone="primary" />
      <CrmKpiCard label={t("crmCouponKpiActive")} value={stats.active.toLocaleString()} tone="success" />
      <CrmKpiCard label={t("crmCouponKpiUsed")} value={stats.used.toLocaleString()} />
      <CrmKpiCard label={t("crmCouponKpiExpired")} value={stats.expired.toLocaleString()} tone="warning" />
    </div>
  )
}
