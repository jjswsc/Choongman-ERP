"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import Link from "next/link"
import { Handshake, RotateCw, Search, ExternalLink, Tag, Megaphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell"
import {
  getMarketingCampaigns,
  getMarketingCampaign,
  saveMarketingCampaignCollabDetail,
  type MarketingCampaign,
  type MarketingCampaignDetail,
} from "@/lib/api-client"
import {
  collabDetailToJson,
  emptyMarketingCollabDetail,
  normalizeMarketingCollabDetail,
  type MarketingCollabDetail,
} from "@/lib/marketing-collab-detail"
import { CollabManagementDetailForm } from "@/components/marketing/collab-management-detail-form"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useSearchParams } from "next/navigation"

type StatusFilter = "all" | "draft" | "ongoing" | "finish"

function statusBadgeClass(status: string) {
  switch (status) {
    case "ongoing":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/35 dark:text-emerald-200"
    case "finish":
      return "bg-muted text-muted-foreground"
    case "draft":
      return "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100"
    default:
      return "bg-border text-foreground"
  }
}

export default function MarketingCollabMenusPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const searchParams = useSearchParams()
  const urlCampaignId = searchParams.get("campaignId")?.trim() ?? ""
  const [list, setList] = React.useState<MarketingCampaign[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string>("")
  const [loadedDetail, setLoadedDetail] = React.useState<MarketingCampaignDetail | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [detailSaving, setDetailSaving] = React.useState(false)
  const [draftCollab, setDraftCollab] = React.useState<MarketingCollabDetail>(emptyMarketingCollabDetail())

  const load = React.useCallback(() => {
    setLoading(true)
    getMarketingCampaigns()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    if (urlCampaignId) setSelectedCampaignId(urlCampaignId)
  }, [urlCampaignId])

  React.useEffect(() => {
    if (!selectedCampaignId) {
      setLoadedDetail(null)
      setDraftCollab(emptyMarketingCollabDetail())
      setDetailLoading(false)
      return
    }
    let cancelled = false
    setLoadedDetail(null)
    setDetailLoading(true)
    getMarketingCampaign(selectedCampaignId)
      .then((d) => {
        if (cancelled || !d) return
        setLoadedDetail(d)
        setDraftCollab(normalizeMarketingCollabDetail(d.collabDetail ?? {}))
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedDetail(null)
          setDraftCollab(emptyMarketingCollabDetail())
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedCampaignId])

  const saveCollabDetail = React.useCallback(async () => {
    if (!selectedCampaignId) return
    setDetailSaving(true)
    try {
      const res = await saveMarketingCampaignCollabDetail({
        campaignId: selectedCampaignId,
        collabDetail: collabDetailToJson(draftCollab),
      })
      if (res.success) {
        await appAlert(t("marketingCollabDetailSaved"))
        const d = await getMarketingCampaign(selectedCampaignId)
        if (d) {
          setLoadedDetail(d)
          setDraftCollab(normalizeMarketingCollabDetail(d.collabDetail ?? {}))
        }
        load()
      } else {
        await appAlert(res.message || t("marketingCollabDetailSaveError"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setDetailSaving(false)
    }
  }, [draftCollab, load, selectedCampaignId, t])

  const statusLabel = React.useCallback(
    (s: string) => {
      switch (s) {
        case "draft":
          return t("marketingAdsStatusDraft")
        case "ongoing":
          return t("marketingAdsStatusOngoing")
        case "finish":
          return t("marketingAdsStatusFinish")
        default:
          return s
      }
    },
    [t]
  )

  const collabOnly = React.useMemo(
    () => list.filter((c) => c.collabManagement === true),
    [list]
  )

  const campaignPickerOptions = React.useMemo(() => {
    return [...collabOnly].sort((a, b) =>
      (a.topic ?? "").localeCompare(b.topic ?? "", lang === "ko" ? "ko" : "en")
    )
  }, [collabOnly, lang])

  const filtered = React.useMemo(() => {
    let rows = collabOnly
    if (selectedCampaignId) {
      rows = rows.filter((c) => c.id === selectedCampaignId)
    }
    if (statusFilter !== "all") {
      rows = rows.filter((c) => c.status === statusFilter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter((c) => {
        const blob = [
          c.topic,
          c.campaignNo,
          c.format,
          ...(c.branches ?? []),
          c.discountTargetAudience,
          c.discountPricePromotion,
          c.campaignType,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        const disc =
          c.discountType === "percent"
            ? `${c.discountValue ?? 0}%`
            : `฿${Number(c.discountValue ?? 0)}`
        return blob.includes(q) || disc.toLowerCase().includes(q)
      })
    }
    const rank = (s: string) => (s === "ongoing" ? 0 : s === "draft" ? 1 : 2)
    return [...rows].sort((a, b) => {
      const r = rank(a.status) - rank(b.status)
      if (r !== 0) return r
      const ad = a.startDate ?? ""
      const bd = b.startDate ?? ""
      return bd.localeCompare(ad)
    })
  }, [collabOnly, search, selectedCampaignId, statusFilter])

  return (
    <MarketingPageShell>
      <MarketingPageHero
        icon={Handshake}
        title={t("adminMarketingCollabMenus")}
        description={t("marketingCollabMenusPageDesc")}
        actions={
          <Button size="sm" className="gap-1.5 shadow-sm" asChild>
            <Link href="/admin/marketing/campaigns">
              <Megaphone className="h-3.5 w-3.5" />
              {t("adminMarketingCampaigns")}
            </Link>
          </Button>
        }
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[200px] flex-[2] space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("marketingCollabMenusCampaignPickerLabel")}</Label>
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="">{t("marketingCollabMenusCampaignPickerAll")}</option>
            {campaignPickerOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.campaignNo ? `${c.campaignNo} · ` : "") + (c.topic || c.id)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px] flex-1 space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("marketingCollabMenusFilterStatus")}</Label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="all">{t("all")}</option>
            <option value="ongoing">{t("marketingAdsStatusOngoing")}</option>
            <option value="draft">{t("marketingAdsStatusDraft")}</option>
            <option value="finish">{t("marketingAdsStatusFinish")}</option>
          </select>
        </div>
        <div className="min-w-[200px] flex-[2] space-y-1.5">
          <Label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            {t("search")}
          </Label>
          <Input
            className="h-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("marketingCollabMenusSearchPlaceholder")}
          />
        </div>
        <Button variant="outline" className="h-10 gap-1.5 sm:shrink-0" onClick={load} disabled={loading}>
          <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
          {t("posRefresh")}
        </Button>
      </div>

      {!loading && collabOnly.length > 0 && (
        <Card className="mb-6 border-primary/20 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <h2 className="mb-1 text-sm font-semibold text-foreground">
              {t("marketingCollabDetailEditorTitle")}
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">{t("marketingCollabDetailEditorDesc")}</p>
            {!selectedCampaignId ? (
              <p className="text-sm text-muted-foreground">{t("marketingCollabDetailPickCampaignHint")}</p>
            ) : loadedDetail ? (
              <CollabManagementDetailForm
                t={t}
                allStoresLabel={t("marketingCollabMenusAllStoresPlan")}
                basics={{
                  topic: loadedDetail.topic,
                  campaignNo: loadedDetail.campaignNo,
                  startDate: loadedDetail.startDate,
                  endDate: loadedDetail.endDate,
                  branches: loadedDetail.branches ?? [],
                  discountType: loadedDetail.discountType,
                  discountValue: loadedDetail.discountValue,
                  discountTargetAudience: loadedDetail.discountTargetAudience,
                  discountPricePromotion: loadedDetail.discountPricePromotion,
                }}
                draft={draftCollab}
                onChange={setDraftCollab}
                onSave={saveCollabDetail}
                saving={detailSaving}
                loading={detailLoading}
              />
            ) : detailLoading ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("marketingCollabDetailLoadError")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {loading && (
        <p className="mb-4 text-sm text-muted-foreground">{t("loading")}</p>
      )}

      {!loading && collabOnly.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("marketingCollabMenusEmptyNoCollabFlag")}
          </CardContent>
        </Card>
      )}

      {!loading && collabOnly.length > 0 && filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("marketingCollabMenusEmptyFilter")}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {!loading && collabOnly.length > 0 && filtered.map((c) => (
          <Card key={c.id} className="overflow-hidden shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.campaignNo && (
                      <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {c.campaignNo}
                      </span>
                    )}
                    <h2 className="text-base font-semibold leading-tight">{c.topic}</h2>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", statusBadgeClass(c.status))}>
                      {statusLabel(c.status)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {(c.startDate || c.endDate) && (
                      <span>
                        {c.startDate || "—"} ~ {c.endDate || "—"}
                      </span>
                    )}
                    {c.branches && c.branches.length > 0 ? (
                      <span>{c.branches.join(", ")}</span>
                    ) : (
                      <span className="text-amber-800/90 dark:text-amber-200/90">{t("marketingCollabMenusAllStoresPlan")}</span>
                    )}
                  </div>
                  {(c.discountValue ?? 0) > 0 && (
                    <p className="text-sm font-medium text-foreground">
                      {c.discountType === "amount" || c.discountType === "fixed"
                        ? `${t("marketingCollabMenusPlanDiscount")}: ฿${Number(c.discountValue).toLocaleString()}`
                        : `${t("marketingCollabMenusPlanDiscount")}: ${c.discountValue}%`}
                    </p>
                  )}
                  {(c.discountTargetAudience ?? "").trim() && (
                    <p className="text-sm text-foreground">
                      <span className="text-muted-foreground">{t("marketingCollabMenusAudience")}: </span>
                      {c.discountTargetAudience}
                    </p>
                  )}
                  {(c.discountPricePromotion ?? "").trim() && (
                    <p className="text-sm text-foreground">
                      <span className="text-muted-foreground">{t("marketingCollabMenusMenuSummary")}: </span>
                      {c.discountPricePromotion}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 border-t border-border/60 pt-3 sm:border-0 sm:pt-0">
                  <Button variant="secondary" size="sm" className="gap-1" asChild>
                    <Link href={`/admin/marketing/campaigns?openCampaign=${encodeURIComponent(c.id)}`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t("marketingCollabMenusEditCampaign")}
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" asChild>
                    <Link href={`/admin/marketing/promos?campaignId=${encodeURIComponent(c.id)}`}>
                      <Tag className="h-3.5 w-3.5" />
                      {t("marketingCollabMenusOpenPromos")}
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </MarketingPageShell>
  )
}
