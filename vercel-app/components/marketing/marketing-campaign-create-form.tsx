"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { appAlert } from "@/lib/app-message"
import { saveMarketingCampaign, useStoreList } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  CAMPAIGN_TYPE_OPTIONS,
  toCampaignTypeStorageValue,
} from "@/lib/marketing-campaign-type-utils"
import { STATUS_OPTIONS } from "@/app/admin/marketing/campaigns/campaigns-utils"
import { marketingCampaignWorkspaceHref } from "@/lib/marketing-campaign-create-ui"

export function MarketingCampaignCreateForm({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const router = useRouter()
  const { auth } = useAuth()
  const { stores, loading: storesLoading, formatStoreLabel } = useStoreList()
  const [saving, setSaving] = React.useState(false)
  const [topic, setTopic] = React.useState("")
  const [status, setStatus] = React.useState("draft")
  const [campaignType, setCampaignType] = React.useState("menu_discount")
  const [startDate, setStartDate] = React.useState("")
  const [endDate, setEndDate] = React.useState("")
  const [branches, setBranches] = React.useState<string[]>([])

  React.useEffect(() => {
    if (!open) return
    setTopic("")
    setStatus("draft")
    setCampaignType("menu_discount")
    setStartDate("")
    setEndDate("")
    setBranches([])
  }, [open])

  if (!open) return null

  const save = async () => {
    if (!topic.trim()) {
      await appAlert(t("marketingWsNeedTitle"))
      return
    }
    setSaving(true)
    try {
      const res = await saveMarketingCampaign({
        topic: topic.trim(),
        campaignType: toCampaignTypeStorageValue(campaignType, ""),
        status,
        startDate: startDate || null,
        endDate: endDate || null,
        branches,
        userRole: auth?.role,
        userStore: auth?.store,
      })
      if (!res.success || !res.id) {
        await appAlert(res.message || t("marketingWsSaveFail"))
        return
      }
      onClose()
      router.push(marketingCampaignWorkspaceHref(res.id))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-4 rounded-xl border bg-muted/20 p-4">
      <p className="mb-3 text-sm font-medium">{t("marketingBrowseCreate")}</p>
      <p className="mb-3 text-xs text-muted-foreground">{t("marketingBrowseCreateHint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>{t("marketingWsTitle")}</Label>
          <Input className="mt-1" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        <div>
          <Label>{t("marketingWsStatus")}</Label>
          <select
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {lang === "en"
                  ? o.value === "draft"
                    ? "Planned"
                    : o.value === "ongoing"
                      ? "In progress"
                      : "Done"
                  : lang === "th"
                    ? o.value === "draft"
                      ? "วางแผน"
                      : o.value === "ongoing"
                        ? "กำลังทำ"
                        : "เสร็จแล้ว"
                    : o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>{t("marketingWsType")}</Label>
          <select
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={campaignType}
            onChange={(e) => setCampaignType(e.target.value)}
          >
            {CAMPAIGN_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {lang === "en" ? o.en : lang === "th" ? o.th : o.ko}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label>{t("marketingWsPeriod")}</Label>
          <div className="mt-1 flex gap-2">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="sm:col-span-2">
          <Label>{t("marketingWsBranches")}</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {storesLoading ? (
              <span className="text-xs text-muted-foreground">{t("loading")}</span>
            ) : (
              stores.map((s) => {
                const on = branches.includes(s)
                return (
                  <button
                    key={s}
                    type="button"
                    className={`rounded-full px-2.5 py-1 text-[11px] ring-1 ${on ? "bg-primary/10 text-primary ring-primary/30" : "bg-background text-muted-foreground ring-border"}`}
                    onClick={() =>
                      setBranches((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
                    }
                  >
                    {formatStoreLabel(s)}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
          {t("marketingWsSave")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t("marketingWsCancel")}
        </Button>
      </div>
    </div>
  )
}
