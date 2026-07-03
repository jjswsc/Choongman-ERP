"use client"

import { Badge } from "@/components/ui/badge"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export function ExpensePlanStatusBadge({
  status,
}: {
  status: "planned" | "approved" | "partial" | "paid" | "rejected" | string
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const tt = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }
  const s = String(status || "").toLowerCase()
  if (s === "approved") {
    return <Badge className="bg-primary/15 text-primary border-primary/30">{tt("att_approved", "Approved")}</Badge>
  }
  if (s === "rejected") {
    return <Badge variant="destructive">{tt("att_rejected", "Rejected")}</Badge>
  }
  if (s === "paid" || s === "partial") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
        {tt("expensePlanStatusPaid", "Paid")}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
      {tt("expensePlanStatusPlanned", "Planned")}
    </Badge>
  )
}
