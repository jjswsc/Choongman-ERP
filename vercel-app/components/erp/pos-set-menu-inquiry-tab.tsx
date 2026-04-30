"use client"

import * as React from "react"
import Link from "next/link"
import { ExternalLink, RefreshCw, ClipboardCopy, Pencil, Play, Ban, Trash2, Link2 } from "lucide-react"
import { appAlert, appConfirm } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import {
  deletePosPromo,
  getPosMenus,
  getMarketingCampaigns,
  getNextPosPromoCode,
  getPosMenuCostAnalysis,
  getPosPromoItems,
  getPosPromosWithItems,
  savePosPromo,
  savePosPromoItem,
  type MarketingCampaign,
  type PosPromo,
} from "@/lib/api-client"
import { buildInquiryEconomicsByPromoId, type InquiryPromoEconomics } from "@/lib/pos-promo-inquiry-economics"
import { PROMOTION_DEFAULT_SUBCATEGORIES } from "@/lib/pos-promo-constants"
import { PROMOTION_MAIN_CATEGORY } from "@/lib/pos-promo-constants"
import { cn } from "@/lib/utils"

export type PosSetMenuInquiryTabProps = {
  promos: PosPromo[]
  promosLoading: boolean
  onRefresh: () => void
  /** 세트 메뉴 탭으로 전환 후 해당 프로모 편집 모드로 포커스 */
  onOpenInSetTab: (promoId: string) => void
  /** 설정 시 해당 캠페인 ID와 일치하는 프로모만 표시 */
  filterCampaignId?: string | null
  /** 마케팅 페이지 등: 「캠페인 프로모션 세트」로 가는 링크 숨김 */
  hideOpenMarketingLink?: boolean
  /** 캠페인 맥락에서 이미 연결됨 → 캠페인 연결 버튼 숨김 */
  hideLinkCampaign?: boolean
  /** 마케팅(캠페인 고정) 조회: 제목·설명·캠페인 열 숨김 등 */
  inquiryMode?: "bundle" | "campaign"
}

function posPromoValidityOverlapsRange(p: PosPromo, from: string, to: string): boolean {
  const fs = from.trim().slice(0, 10)
  const te = to.trim().slice(0, 10)
  if (!fs && !te) return true
  const vf = (p.validFrom ?? "").trim().slice(0, 10)
  const vt = (p.validTo ?? "").trim().slice(0, 10)
  if (!vf && !vt) return true
  const ps = vf || "1970-01-01"
  const pe = vt || vf || "2999-12-31"
  if (fs && te) {
    const [a, b] = fs <= te ? [fs, te] : [te, fs]
    return ps <= b && pe >= a
  }
  const d = fs || te
  return ps <= d && pe >= d
}

function buildSavePayload(p: PosPromo, overrides: { isActive?: boolean } = {}) {
  const isActive = overrides.isActive ?? p.isActive
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    category: (p.category ?? "").trim() || PROMOTION_DEFAULT_SUBCATEGORIES[0],
    categoryMain: (p.categoryMain ?? "").trim() || PROMOTION_MAIN_CATEGORY,
    price: p.price,
    priceDelivery: p.priceDelivery,
    vatIncluded: p.vatIncluded,
    isActive,
    marketingCampaignId: p.marketingCampaignId?.trim() || null,
    channelHall: p.channelHall !== false,
    channelTakeout: p.channelTakeout !== false,
    channelDelivery: p.channelDelivery !== false,
    deliveryAppCodes:
      p.channelDelivery !== false && p.deliveryAppCodes && p.deliveryAppCodes.length > 0
        ? p.deliveryAppCodes
        : null,
    discountPercent: p.discountPercent ?? null,
    validFrom: p.validFrom?.trim() || null,
    validTo: p.validTo?.trim() || null,
    marketingActualCost: p.marketingActualCost ?? 0,
    standaloneSetMenu: !p.marketingCampaignId?.trim(),
  }
}

export function PosSetMenuInquiryTab({
  promos,
  promosLoading,
  onRefresh,
  onOpenInSetTab,
  filterCampaignId,
  hideOpenMarketingLink: _hideOpenMarketingLink,
  hideLinkCampaign,
  inquiryMode = "bundle",
}: PosSetMenuInquiryTabProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const [search, setSearch] = React.useState("")
  const [promoCategoryFilter, setPromoCategoryFilter] = React.useState("")
  const [promoValidFrom, setPromoValidFrom] = React.useState("")
  const [promoValidTo, setPromoValidTo] = React.useState("")
  const [showInactive, setShowInactive] = React.useState(true)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [linkTarget, setLinkTarget] = React.useState<PosPromo | null>(null)
  const [linkCampaignId, setLinkCampaignId] = React.useState("")
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [campaignsLoading, setCampaignsLoading] = React.useState(false)
  const [economicsByPromoId, setEconomicsByPromoId] = React.useState<Record<string, InquiryPromoEconomics>>({})
  const [economicsLoading, setEconomicsLoading] = React.useState(false)
  const [menuNameById, setMenuNameById] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (!linkTarget) {
      setLinkCampaignId("")
      return
    }
    let cancelled = false
    setCampaignsLoading(true)
    getMarketingCampaigns()
      .then((list) => {
        if (!cancelled) setCampaigns(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setCampaigns([])
      })
      .finally(() => {
        if (!cancelled) setCampaignsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [linkTarget])

  React.useEffect(() => {
    let cancelled = false
    getPosMenus()
      .then((list) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        for (const row of list || []) {
          const id = String(row.id ?? "").trim()
          if (!id) continue
          map[id] = String(row.name ?? "").trim() || `#${id}`
        }
        setMenuNameById(map)
      })
      .catch(() => {
        if (!cancelled) setMenuNameById({})
      })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!promos.length) {
      setEconomicsByPromoId({})
      return
    }
    let cancelled = false
    setEconomicsLoading(true)
    const cid = (filterCampaignId ?? "").trim() || undefined
    void (async () => {
      try {
        const [rows, withItems] = await Promise.all([
          getPosMenuCostAnalysis({ summary: true }),
          getPosPromosWithItems({ campaignId: cid, includeInactive: true }),
        ])
        if (cancelled) return
        setEconomicsByPromoId(buildInquiryEconomicsByPromoId(Array.isArray(withItems) ? withItems : [], rows))
      } catch {
        if (!cancelled) setEconomicsByPromoId({})
      } finally {
        if (!cancelled) setEconomicsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [promos, filterCampaignId])

  const filterCid = (filterCampaignId ?? "").trim()

  const promoCategoryOptions = React.useMemo(() => {
    const set = new Set<string>()
    for (const p of promos) {
      const c = (p.category ?? "").trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, lang === "ko" ? "ko" : "en"))
  }, [promos, lang])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    const cat = promoCategoryFilter.trim()
    return promos.filter((p) => {
      if (filterCid && (p.marketingCampaignId ?? "").trim() !== filterCid) return false
      if (!showInactive && !p.isActive) return false
      if (cat && (p.category ?? "").trim() !== cat) return false
      if (inquiryMode === "campaign" && !posPromoValidityOverlapsRange(p, promoValidFrom, promoValidTo)) {
        return false
      }
      if (!q) return true
      return (
        (p.code ?? "").toLowerCase().includes(q) ||
        (p.name ?? "").toLowerCase().includes(q) ||
        (p.marketingCampaignNo ?? "").toLowerCase().includes(q)
      )
    })
  }, [
    promos,
    search,
    showInactive,
    filterCid,
    promoCategoryFilter,
    promoValidFrom,
    promoValidTo,
    inquiryMode,
  ])

  const showCampaignCol = inquiryMode !== "campaign"

  const runBusy = async (id: string, fn: () => Promise<void>) => {
    if (busyId) return
    setBusyId(id)
    try {
      await fn()
    } finally {
      setBusyId(null)
    }
  }

  const handleActivate = (p: PosPromo) =>
    runBusy(p.id, async () => {
      const res = await savePosPromo({
        ...buildSavePayload(p, { isActive: true }),
        userRole: auth?.role,
        userName: auth?.user,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
        return
      }
      await appAlert(t("posSetInquiryActivated"))
      onRefresh()
    })

  const handleDeactivate = (p: PosPromo) =>
    runBusy(p.id, async () => {
      if (!(await appConfirm(t("posSetInquiryDeactivateConfirm").replace("{{name}}", p.name || p.code)))) return
      const res = await savePosPromo({
        ...buildSavePayload(p, { isActive: false }),
        userRole: auth?.role,
        userName: auth?.user,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
        return
      }
      await appAlert(t("posSetInquiryDeactivated"))
      onRefresh()
    })

  const handleDelete = (p: PosPromo) =>
    runBusy(p.id, async () => {
      if (!(await appConfirm(t("posSetInquiryDeleteConfirm").replace("{{name}}", p.name || p.code)))) return
      const res = await deletePosPromo({ id: p.id })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("msg_save_fail_detail"))
        return
      }
      await appAlert(t("posSetInquiryDeleted"))
      onRefresh()
    })

  const handleCopy = (p: PosPromo) =>
    runBusy(p.id, async () => {
      const items = await getPosPromoItems({ promoId: p.id }).catch(() => [])
      const standalone = !p.marketingCampaignId?.trim()
      const res = await savePosPromo({
        name: p.name,
        category: (p.category ?? "").trim() || PROMOTION_DEFAULT_SUBCATEGORIES[0],
        categoryMain: (p.categoryMain ?? "").trim() || PROMOTION_MAIN_CATEGORY,
        price: p.price,
        priceDelivery: p.priceDelivery,
        vatIncluded: p.vatIncluded,
        isActive: true,
        marketingCampaignId: p.marketingCampaignId?.trim() || null,
        channelHall: p.channelHall !== false,
        channelTakeout: p.channelTakeout !== false,
        channelDelivery: p.channelDelivery !== false,
        deliveryAppCodes:
          p.channelDelivery !== false && p.deliveryAppCodes && p.deliveryAppCodes.length > 0
            ? p.deliveryAppCodes
            : null,
        discountPercent: p.discountPercent ?? null,
        validFrom: p.validFrom?.trim() || null,
        validTo: p.validTo?.trim() || null,
        marketingActualCost: 0,
        standaloneSetMenu: standalone,
        userRole: auth?.role,
        userName: auth?.user,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
        return
      }
      const newId = res.id ? String(res.id) : ""
      if (!newId) {
        await appAlert(t("msg_save_fail_detail"))
        onRefresh()
        return
      }
      for (let i = 0; i < (items || []).length; i++) {
        const it = items[i]
        const ir = await savePosPromoItem({
          promoId: Number(newId),
          menuId: Number(it.menuId),
          optionId: it.optionId ? Number(it.optionId) : null,
          quantity: Number(it.quantity) || 1,
          sortOrder: i,
        })
        if (!ir.success) {
          await appAlert(translateApiMessage(ir.message, t) || ir.message || t("msg_save_fail_detail"))
          onRefresh()
          return
        }
      }
      await appAlert(t("posSetInquiryCopied"))
      onRefresh()
    })

  const handleConfirmLinkCampaign = async () => {
    if (!linkTarget) return
    await runBusy(linkTarget.id, async () => {
      const cid = linkCampaignId.trim()
      if (!cid) {
        await appAlert(t("posSetLinkCampaignNeedSelection"))
        return
      }
      if (!(await appConfirm(t("posSetLinkCampaignConfirm")))) return
      let nextCode: string | null = null
      try {
        const r = await getNextPosPromoCode({ campaignId: cid })
        nextCode = r?.code?.trim() || null
      } catch {
        nextCode = null
      }
      if (!nextCode) {
        await appAlert(t("posSetLinkCampaignNoNextCode"))
        return
      }
      const res = await savePosPromo({
        ...buildSavePayload(linkTarget),
        marketingCampaignId: cid,
        code: nextCode,
        standaloneSetMenu: false,
        userRole: auth?.role,
        userName: auth?.user,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
        return
      }
      setLinkTarget(null)
      await appAlert(t("posSetLinkCampaignSuccess"))
      onRefresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-bold tracking-tight">{t("posSetInquiryTitle")}</h3>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground leading-relaxed">{t("posSetInquiryDesc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 text-xs" asChild>
            <Link href="/admin/marketing/promos">
              <ExternalLink className="h-3.5 w-3.5" />
              {t("posMenuSetOpenMarketing")}
            </Link>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 gap-1 text-xs"
            disabled={promosLoading}
            onClick={() => onRefresh()}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", promosLoading && "animate-spin")} />
            {t("posSetInquiryRefresh")}
          </Button>
        </div>
      </div>

      <Dialog open={!!linkTarget} onOpenChange={(o) => !o && setLinkTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("posSetLinkCampaignTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground leading-relaxed">{t("posSetLinkCampaignHint")}</p>
          {linkTarget ? (
            <p className="text-sm font-medium">
              {linkTarget.name} <span className="font-mono text-xs text-muted-foreground">({linkTarget.code})</span>
            </p>
          ) : null}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("posSetLinkCampaignSelect")}</label>
            <Select
              value={linkCampaignId || "_none"}
              onValueChange={(v) => setLinkCampaignId(v === "_none" ? "" : v)}
              disabled={campaignsLoading}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder={t("posPromoCampaignSelectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">{t("marketingPromoCampaignSelectRequiredOption")}</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.campaignNo ? `[${c.campaignNo}] ` : ""}
                    {c.topic}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setLinkTarget(null)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              disabled={!linkTarget || busyId === linkTarget?.id || campaignsLoading}
              onClick={() => void handleConfirmLinkCampaign()}
            >
              {t("posSetLinkCampaign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            className="h-9 max-w-md text-sm"
            placeholder={t("posSetInquirySearchPh")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={showInactive} onCheckedChange={(c) => setShowInactive(c === true)} />
            {t("posSetInquiryShowInactive")}
          </label>
        </div>

        {inquiryMode === "campaign" ? (
          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 px-3 py-3 sm:px-4">
            <p className="text-[11px] font-medium text-muted-foreground">{t("posPromoListFilterTitle")}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("marketingPromoFilterPromoCategory")}</Label>
                <Select
                  value={promoCategoryFilter || "_all"}
                  onValueChange={(v) => setPromoCategoryFilter(v === "_all" ? "" : v)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={t("all")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">{t("all")}</SelectItem>
                    {promoCategoryOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("posPromoListFilterFrom")}</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={promoValidFrom}
                  onChange={(e) => setPromoValidFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("posPromoListFilterTo")}</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={promoValidTo}
                  onChange={(e) => setPromoValidTo(e.target.value)}
                />
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t("posPromoListFilterOverlapHint")}</p>
          </div>
        ) : null}
      </div>

      {promosLoading && promos.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t("loading")}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/80">
          <table className="w-full min-w-[1040px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <th className="whitespace-nowrap px-3 py-2.5 align-bottom">{t("itemsColCode")}</th>
                <th className="min-w-[140px] px-3 py-2.5 align-bottom">{t("posPromoName")}</th>
                {showCampaignCol ? (
                  <th className="whitespace-nowrap px-3 py-2.5 align-bottom">{t("posSetInquiryColCampaign")}</th>
                ) : null}
                <th className="whitespace-nowrap px-3 py-2.5 text-right align-bottom">{t("posMenuPriceHall")}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right align-bottom">{t("posMenuPriceDelivery")}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right align-bottom">{t("posSetInquiryColCostHall")}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right align-bottom">{t("posSetInquiryColCostRateHall")}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right align-bottom">{t("posSetInquiryColCostRateDel")}</th>
                <th className="min-w-[220px] px-3 py-2.5 align-bottom">{t("posSetTabSavedSetBundleLines")}</th>
                <th className="whitespace-nowrap px-3 py-2.5 align-bottom">{t("posSetInquiryColStatus")}</th>
                <th className="min-w-[200px] px-3 py-2.5 text-right align-bottom">{t("posSetInquiryColActions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={showCampaignCol ? 11 : 10}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    {t("posSetInquiryEmpty")}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const b = busyId === p.id
                  const promoItems = (p as PosPromo & {
                    items?: { menuId: string; optionId: string | null; quantity: number }[]
                  }).items || []
                  const lines = promoItems.slice(0, 2).map((it: { menuId: string; optionId: string | null; quantity: number }) => {
                    const menuName = menuNameById[String(it.menuId)] || `#${String(it.menuId)}`
                    const optPart = it.optionId ? ` + ${String(it.optionId)}` : ""
                    return `${menuName}${optPart} ×${Math.max(1, Number(it.quantity) || 1)}`
                  })
                  const ec = economicsByPromoId[p.id]
                  const costCell =
                    ec == null || ec.lineCount === 0
                      ? "—"
                      : `฿${ec.costHall.toFixed(1)}${ec.incomplete ? "*" : ""}`
                  const rateHallCell = ec == null || ec.lineCount === 0 ? "—" : `${ec.costRateHall.toFixed(1)}%`
                  const rateDelCell = ec == null || ec.lineCount === 0 ? "—" : `${ec.costRateDel.toFixed(1)}%`
                  return (
                    <tr key={p.id} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2.5 align-middle font-mono text-xs">{p.code}</td>
                      <td className="px-3 py-2.5 align-middle font-medium break-words">{p.name}</td>
                      {showCampaignCol ? (
                        <td className="px-3 py-2.5 align-middle text-xs">
                          {p.marketingCampaignNo?.trim() ? (
                            <span className="font-mono text-muted-foreground">{p.marketingCampaignNo}</span>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {t("posSetBundleNoCampaignBadge")}
                            </Badge>
                          )}
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5 align-middle text-right tabular-nums">
                        ฿{Math.round(p.price ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-right tabular-nums text-muted-foreground">
                        {p.priceDelivery != null && Number(p.priceDelivery) > 0
                          ? `฿${Math.round(Number(p.priceDelivery)).toLocaleString()}`
                          : "—"}
                      </td>
                      <td
                        className="px-3 py-2.5 align-middle text-right font-mono tabular-nums text-muted-foreground"
                        title={ec?.incomplete ? t("posSetInquiryEconomicsHint") : undefined}
                      >
                        {economicsLoading && ec == null ? "…" : costCell}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-right font-mono tabular-nums text-muted-foreground">
                        {economicsLoading && ec == null ? "…" : rateHallCell}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-right font-mono tabular-nums text-muted-foreground">
                        {economicsLoading && ec == null ? "…" : rateDelCell}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-xs text-muted-foreground">
                        {lines.length > 0 ? (
                          <div className="space-y-0.5">
                            {lines.map((line, idx) => (
                              <p key={`${p.id}-${idx}`} className="line-clamp-1">
                                · {line}
                              </p>
                            ))}
                            {promoItems.length > lines.length ? (
                              <p className="text-[10px] text-muted-foreground/90">
                                +{String(promoItems.length - lines.length)}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                        {p.isActive ? (
                          <Badge className="bg-emerald-600/90 text-[10px]">{t("posSetInquiryActive")}</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            {t("posSetInquiryInactive")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {!hideLinkCampaign && !p.marketingCampaignId?.trim() ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-8 gap-1 px-2 text-[11px]"
                              disabled={b}
                              onClick={() => {
                                setLinkCampaignId("")
                                setLinkTarget(p)
                              }}
                            >
                              <Link2 className="h-3 w-3" />
                              {t("posSetLinkCampaign")}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2 text-[11px]"
                            disabled={b}
                            onClick={() => onOpenInSetTab(p.id)}
                          >
                            <Pencil className="h-3 w-3" />
                            {t("posSetInquiryOpenInSetTab")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2 text-[11px]"
                            disabled={b}
                            onClick={() => void handleCopy(p)}
                          >
                            <ClipboardCopy className="h-3 w-3" />
                            {t("posSetInquiryCopy")}
                          </Button>
                          {p.isActive ? (
                            <>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-8 gap-1 px-2 text-[11px]"
                                disabled={b}
                                onClick={() => void handleDeactivate(p)}
                              >
                                <Ban className="h-3 w-3" />
                                {t("posSetInquirySuspend")}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1 px-2 text-[11px] text-destructive hover:text-destructive"
                                disabled={b}
                                onClick={() => void handleDelete(p)}
                              >
                                <Trash2 className="h-3 w-3" />
                                {t("posSetInquiryDelete")}
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              className="h-8 gap-1 bg-emerald-600 px-2 text-[11px] hover:bg-emerald-700"
                              disabled={b}
                              onClick={() => void handleActivate(p)}
                            >
                              <Play className="h-3 w-3" />
                              {t("posSetInquiryActivate")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > 0 ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {economicsLoading ? `${t("loading")} · ${t("posSetInquiryEconomicsHint")}` : t("posSetInquiryEconomicsHint")}
        </p>
      ) : null}
    </div>
  )
}
