"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, BarChart2, Handshake, Loader2, Save, Tag, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { appAlert, appConfirm } from "@/lib/app-message"
import {
  deleteMarketingCampaign,
  getMarketingCampaign,
  saveMarketingCampaign,
  useStoreList,
  type MarketingCampaignDetail,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  CAMPAIGN_TYPE_OPTIONS,
  KPI_UNIT_OPTIONS,
  getCampaignTypeLabel,
  getKpiUnitLabel,
  toCampaignTypeFormState,
  toCampaignTypeStorageValue,
} from "@/lib/marketing-campaign-type-utils"
import { STATUS_OPTIONS, DEFAULT_DELIVERY_APPS, parseCampaignFormat, serializeCampaignFormat, type ChannelState } from "@/app/admin/marketing/campaigns/campaigns-utils"
import { marketingCampaignWorkspaceHref } from "@/lib/marketing-campaign-create-ui"
import { getMetaConnectionStatus } from "@/lib/api-client/marketing-meta"
import { uniqueMetaAdsCampaigns } from "@/lib/marketing-meta-match"

export function MarketingCampaignOverviewPanel({
  campaignId,
  onDeleted,
}: {
  campaignId: string
  onDeleted?: () => void
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const { stores, loading: storesLoading, formatStoreLabel, resolveStoreKey } = useStoreList()
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [detail, setDetail] = React.useState<MarketingCampaignDetail | null>(null)
  const [topic, setTopic] = React.useState("")
  const [status, setStatus] = React.useState("draft")
  const [campaignType, setCampaignType] = React.useState("menu_discount")
  const [campaignTypeCustom, setCampaignTypeCustom] = React.useState("")
  const [startDate, setStartDate] = React.useState("")
  const [endDate, setEndDate] = React.useState("")
  const [detailText, setDetailText] = React.useState("")
  const [budgetTotal, setBudgetTotal] = React.useState("")
  const [kpiTarget, setKpiTarget] = React.useState("")
  const [kpiUnit, setKpiUnit] = React.useState("order")
  const [branches, setBranches] = React.useState<string[]>([])
  const [channel, setChannel] = React.useState<ChannelState>({ online: false, hall: false, takeout: false, apps: [] })
  const [costAdsOnline, setCostAdsOnline] = React.useState("")
  const [costAdsOffline, setCostAdsOffline] = React.useState("")
  const [costProduction, setCostProduction] = React.useState("")
  const [costFood, setCostFood] = React.useState("")
  const [costInfluencer, setCostInfluencer] = React.useState("")
  const [costOther, setCostOther] = React.useState("")
  const [metaCampaignName, setMetaCampaignName] = React.useState("")
  const [metaCampaignId, setMetaCampaignId] = React.useState("")
  const [metaAdsOptions, setMetaAdsOptions] = React.useState<{ id: string; name: string }[]>([])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await getMarketingCampaign(campaignId)
      setDetail(d)
      if (d) {
        setTopic(d.topic || "")
        setStatus(d.status || "draft")
        const parsedType = toCampaignTypeFormState(d.campaignType)
        setCampaignType(parsedType.type)
        setCampaignTypeCustom(parsedType.custom)
        setStartDate(d.startDate || "")
        setEndDate(d.endDate || "")
        setDetailText(d.detail || "")
        setBudgetTotal(String(d.budgetTotal ?? ""))
        setKpiTarget(String(d.kpiTarget ?? ""))
        setKpiUnit(d.kpiUnit || "order")
        setChannel(parseCampaignFormat(d.format || ""))
        setCostAdsOnline(String(d.costAdsOnline ?? ""))
        setCostAdsOffline(String(d.costAdsOffline ?? ""))
        setCostProduction(String(d.costProduction ?? ""))
        setCostFood(String(d.costFood ?? ""))
        setCostInfluencer(String(d.costInfluencer ?? ""))
        setCostOther(String(d.costOther ?? ""))
        setMetaCampaignName(d.metaCampaignName || "")
        setMetaCampaignId(d.metaCampaignId || "")
        const seen = new Set<string>()
        const next: string[] = []
        for (const b of d.branches || []) {
          const n = resolveStoreKey(String(b || "").trim())
          if (!n || seen.has(n)) continue
          seen.add(n)
          next.push(n)
        }
        setBranches(next)
      }
    } finally {
      setLoading(false)
    }
  }, [campaignId, resolveStoreKey])

  React.useEffect(() => {
    void getMetaConnectionStatus()
      .then((st) => setMetaAdsOptions(uniqueMetaAdsCampaigns(st.lastSync?.ads || [])))
      .catch(() => setMetaAdsOptions([]))
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!topic.trim()) {
      await appAlert(t("marketingWsNeedTitle"))
      return
    }
    setSaving(true)
    try {
      const res = await saveMarketingCampaign({
        id: campaignId,
        campaignNo: detail?.campaignNo,
        topic: topic.trim(),
        format: serializeCampaignFormat(channel),
        campaignType: toCampaignTypeStorageValue(campaignType, campaignTypeCustom),
        status,
        detail: detailText,
        startDate: startDate || null,
        endDate: endDate || null,
        designStartDate: detail?.designStartDate,
        designEndDate: detail?.designEndDate,
        designNote: detail?.designNote,
        branches,
        discountType: detail?.discountType,
        discountValue: detail?.discountValue,
        discountPricePromotion: detail?.discountPricePromotion,
        discountTargetAudience: detail?.discountTargetAudience,
        costAdsOnline: Number(costAdsOnline) || 0,
        costAdsOffline: Number(costAdsOffline) || 0,
        costProduction: Number(costProduction) || 0,
        costFood: Number(costFood) || 0,
        costInfluencer: Number(costInfluencer) || 0,
        costOther: Number(costOther) || 0,
        costOtherLabel: detail?.costOtherLabel,
        budgetTotal: Number(budgetTotal) || 0,
        kpiTarget: Number(kpiTarget) || 0,
        kpiUnit,
        metaCampaignId,
        metaCampaignName,
        collabManagement: detail?.collabManagement,
        userRole: auth?.role,
        userStore: auth?.store,
      })
      if (!res.success) {
        await appAlert(res.message || t("marketingWsSaveFail"))
        return
      }
      await load()
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    const ok = await appConfirm(t("marketingWsDeleteConfirm"))
    if (!ok) return
    const res = await deleteMarketingCampaign({ id: campaignId })
    if (!res.success) {
      await appAlert(res.message || t("marketingWsSaveFail"))
      return
    }
    onDeleted?.()
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("loading")}
      </p>
    )
  }
  if (!detail) {
    return <p className="text-sm text-muted-foreground">{t("marketingWsNotFound")}</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-primary">{detail.campaignNo || campaignId}</p>
          <h2 className="text-lg font-semibold">{topic || detail.topic}</h2>
          <p className="text-xs text-muted-foreground">{getCampaignTypeLabel(campaignType, lang)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("marketingWsTabHint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/marketing/campaigns">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              {t("marketingHomeViewAll")}
            </Link>
          </Button>
          <Button variant="destructive" size="sm" onClick={() => void remove()}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {t("marketingWsDelete")}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
          <div className="text-muted-foreground">{t("marketingWsPeriod")}</div>
          <div className="font-medium">{(startDate || "—") + " – " + (endDate || "—")}</div>
        </div>
        <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
          <div className="text-muted-foreground">{t("marketingWsBudget")}</div>
          <div className="font-medium tabular-nums">฿{(Number(budgetTotal) || 0).toLocaleString()}</div>
        </div>
        <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
          <div className="text-muted-foreground">{t("marketingWsTabPromos")}</div>
          <Link className="font-medium text-primary" href={marketingCampaignWorkspaceHref(campaignId, "promos")}>
            {t("marketingCampaignOpenWorkspace")}
          </Link>
        </div>
        <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
          <div className="text-muted-foreground">{t("marketingWsTabCollab")}</div>
          <Link className="font-medium text-primary" href={marketingCampaignWorkspaceHref(campaignId, "collab")}>
            {t("marketingCampaignOpenWorkspace")}
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>{t("marketingWsTitle")}</Label>
          <Input className="mt-1" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>{t("marketingWsStatus")}</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {lang === "en" ? (o.value === "draft" ? "Planned" : o.value === "ongoing" ? "In progress" : "Done") : lang === "th" ? (o.value === "draft" ? "วางแผน" : o.value === "ongoing" ? "กำลังทำ" : "เสร็จแล้ว") : o.label}
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
            {campaignType === "other" ? (
              <Input
                className="mt-2"
                value={campaignTypeCustom}
                onChange={(e) => setCampaignTypeCustom(e.target.value)}
              />
            ) : null}
          </div>
        </div>
        <div>
          <Label>{t("marketingWsPeriod")}</Label>
          <div className="mt-1 flex gap-2">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>{t("marketingWsBudget")}</Label>
            <Input className="mt-1" inputMode="decimal" value={budgetTotal} onChange={(e) => setBudgetTotal(e.target.value)} />
          </div>
          <div>
            <Label>{t("marketingWsKpi")}</Label>
            <Input className="mt-1" inputMode="decimal" value={kpiTarget} onChange={(e) => setKpiTarget(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>{t("marketingWsKpiUnit")}</Label>
          <select
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={kpiUnit}
            onChange={(e) => setKpiUnit(e.target.value)}
          >
            {KPI_UNIT_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {getKpiUnitLabel(u.value, lang)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>{t("marketingMetaMapLabel")}</Label>
          {metaAdsOptions.length > 0 ? (
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={
                metaAdsOptions.some((o) => o.id === metaCampaignId)
                  ? metaCampaignId
                  : metaCampaignName || metaCampaignId
                    ? "__custom__"
                    : ""
              }
              onChange={(e) => {
                const v = e.target.value
                if (!v) {
                  setMetaCampaignId("")
                  setMetaCampaignName("")
                  return
                }
                if (v === "__custom__") {
                  setMetaCampaignId("")
                  return
                }
                const hit = metaAdsOptions.find((o) => o.id === v)
                setMetaCampaignId(v)
                setMetaCampaignName(hit?.name || "")
              }}
            >
              <option value="">{t("marketingMetaMapNone")}</option>
              {metaAdsOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.id && o.id !== o.name ? ` (${o.id})` : ""}
                </option>
              ))}
              <option value="__custom__">{t("marketingMetaMapCustom")}</option>
            </select>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">{t("marketingMetaMapSyncFirst")}</p>
          )}
          {metaAdsOptions.length === 0 ||
          (!metaAdsOptions.some((o) => o.id === metaCampaignId) && (metaCampaignName || metaCampaignId)) ? (
            <Input
              className="mt-2"
              value={metaCampaignName}
              onChange={(e) => {
                setMetaCampaignName(e.target.value)
                if (metaAdsOptions.some((o) => o.id === metaCampaignId)) setMetaCampaignId("")
              }}
              placeholder={t("marketingMetaMapPh")}
            />
          ) : null}
        </div>
      </div>

      <div>
        <Label>{t("marketingWsChannel")}</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              { key: "hall" as const, label: t("marketingWsDineIn") },
              { key: "takeout" as const, label: t("marketingWsTakeout") },
              { key: "online" as const, label: t("marketingWsDelivery") },
            ] as const
          ).map((ch) => (
            <button
              key={ch.key}
              type="button"
              className={`rounded-full px-2.5 py-1 text-[11px] ring-1 ${channel[ch.key] ? "bg-primary/10 text-primary ring-primary/30" : "bg-muted/40 text-muted-foreground ring-border"}`}
              onClick={() => setChannel((prev) => ({ ...prev, [ch.key]: !prev[ch.key] }))}
            >
              {ch.label}
            </button>
          ))}
        </div>
        {channel.online ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DEFAULT_DELIVERY_APPS.map((app) => {
              const on = channel.apps.includes(app)
              return (
                <button
                  key={app}
                  type="button"
                  className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${on ? "bg-primary/10 text-primary ring-primary/30" : "bg-muted/40 text-muted-foreground ring-border"}`}
                  onClick={() =>
                    setChannel((prev) => ({
                      ...prev,
                      apps: prev.apps.includes(app) ? prev.apps.filter((x) => x !== app) : [...prev.apps, app],
                    }))
                  }
                >
                  {app}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <div>
        <Label>{t("marketingWsCostSummary")}</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(
            [
              { label: t("marketingWsCostOnline"), value: costAdsOnline, set: setCostAdsOnline },
              { label: t("marketingWsCostOffline"), value: costAdsOffline, set: setCostAdsOffline },
              { label: t("marketingWsCostProd"), value: costProduction, set: setCostProduction },
              { label: t("marketingWsCostFood"), value: costFood, set: setCostFood },
              { label: t("marketingWsCostInflu"), value: costInfluencer, set: setCostInfluencer },
              { label: t("marketingWsCostOther"), value: costOther, set: setCostOther },
            ] as const
          ).map((row) => (
            <div key={row.label}>
              <Label className="text-[11px] text-muted-foreground">{row.label}</Label>
              <Input className="mt-1" inputMode="decimal" value={row.value} onChange={(e) => row.set(e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>{t("marketingWsBranches")}</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {storesLoading ? (
            <span className="text-xs text-muted-foreground">{t("loading")}</span>
          ) : (
            stores.map((s) => {
              const on = branches.includes(s)
              return (
                <button
                  key={s}
                  type="button"
                  className={`rounded-full px-2.5 py-1 text-[11px] ring-1 ${on ? "bg-primary/10 text-primary ring-primary/30" : "bg-muted/40 text-muted-foreground ring-border"}`}
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

      <div>
        <Label>{t("marketingWsDetail")}</Label>
        <Textarea className="mt-1" rows={4} value={detailText} onChange={(e) => setDetailText(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
          {t("marketingWsSave")}
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={marketingCampaignWorkspaceHref(campaignId, "promos")}>
            <Tag className="mr-1 h-3.5 w-3.5" />
            {t("marketingWsTabPromos")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={marketingCampaignWorkspaceHref(campaignId, "collab")}>
            <Handshake className="mr-1 h-3.5 w-3.5" />
            {t("marketingWsTabCollab")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={marketingCampaignWorkspaceHref(campaignId, "results")}>
            <BarChart2 className="mr-1 h-3.5 w-3.5" />
            {t("marketingWsTabResults")}
          </Link>
        </Button>
      </div>
    </div>
  )
}
