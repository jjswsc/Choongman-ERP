"use client"

import * as React from "react"
import Link from "next/link"
import {
  Gift,
  Loader2,
  Plus,
  RotateCw,
  Trash2,
  Download,
  ExternalLink,
  AlertTriangle,
} from "lucide-react"
import { appAlert, appConfirm } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getMarketingCampaigns,
  getMarketingMaterialGifts,
  getMarketingMaterials,
  getMarketingMaterialLookup,
  saveMarketingMaterialGift,
  deleteMarketingMaterialGift,
  useStoreList,
  type MarketingCampaign,
  type MarketingMaterial,
  type MarketingMaterialGift,
} from "@/lib/api-client"
import {
  aggregateGiftInventoryGroups,
  computedGiftRemaining,
  giftRowQtyMismatch,
  sumInventoryTotals,
} from "@/lib/marketing-material-gift-inventory"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { MarketingCampaignFinderPanel } from "@/components/marketing/marketing-campaign-finder-panel"

type MatMeta = { name: string; campaignId: string | null }

const defaultAdd = {
  materialId: "",
  storeName: "",
  giftName: "",
  allocatedQty: "",
  distributedQty: "",
  ruleNote: "",
}

const defaultEditRow = {
  storeName: "",
  giftName: "",
  allocatedQty: "",
  distributedQty: "",
  ruleNote: "",
}

export type MarketingMaterialGiftsPanelProps = {
  /** 홍보물 페이지 상단 캠페인 필터와 동기화 */
  syncCampaignId?: string
  /** true면 독립 페이지용 헤더(아이콘·제목) 표시 */
  showPageHeader?: boolean
}

export function MarketingMaterialGiftsPanel({
  syncCampaignId = "",
  showPageHeader = false,
}: MarketingMaterialGiftsPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const { stores, loading: storesLoading } = useStoreList()

  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [gifts, setGifts] = React.useState<MarketingMaterialGift[]>([])
  const [matLookup, setMatLookup] = React.useState<Record<string, MatMeta>>({})
  const [materialsForAdd, setMaterialsForAdd] = React.useState<
    { id: string; name: string; campaignId: string | null }[]
  >([])
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [storeFilter, setStoreFilter] = React.useState("")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [giftSubTab, setGiftSubTab] = React.useState<"detail" | "inventory">("detail")
  const [materialsForCampaign, setMaterialsForCampaign] = React.useState<MarketingMaterial[]>([])
  const [invMaterialKey, setInvMaterialKey] = React.useState("")
  const [invGiftKey, setInvGiftKey] = React.useState("")
  const [invMismatchOnly, setInvMismatchOnly] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [exporting, setExporting] = React.useState(false)
  const [addDraft, setAddDraft] = React.useState({ ...defaultAdd })
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editDraft, setEditDraft] = React.useState({ ...defaultEditRow })
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (syncCampaignId) setCampaignFilter(syncCampaignId)
  }, [syncCampaignId])

  const effectiveCampaignId = React.useMemo(
    () => (syncCampaignId || campaignFilter || "").trim(),
    [syncCampaignId, campaignFilter]
  )

  const campaignMap = React.useMemo(() => {
    const m: Record<string, MarketingCampaign> = {}
    campaigns.forEach((c) => {
      m[c.id] = c
    })
    return m
  }, [campaigns])

  const loadData = React.useCallback(async () => {
    setLoading(true)
    const campaignParam = (syncCampaignId || campaignFilter || "").trim()
    try {
      const camps = await getMarketingCampaigns()
      setCampaigns(camps)
      if (!campaignParam) {
        setGifts([])
        setMatLookup({})
        setMaterialsForCampaign([])
        return
      }
      const [g, mats] = await Promise.all([
        getMarketingMaterialGifts({ campaignId: campaignParam }),
        getMarketingMaterials({ campaignId: campaignParam }),
      ])
      setGifts(Array.isArray(g) ? g : [])
      setMaterialsForCampaign(Array.isArray(mats) ? mats : [])
      const mids = [...new Set((Array.isArray(g) ? g : []).map((x) => x.materialId))]
      const meta = await getMarketingMaterialLookup(mids)
      const map: Record<string, MatMeta> = {}
      meta.forEach((row) => {
        map[row.id] = { name: row.name, campaignId: row.campaignId }
      })
      setMatLookup(map)
    } catch {
      setGifts([])
      setMatLookup({})
      setMaterialsForCampaign([])
    } finally {
      setLoading(false)
    }
  }, [campaignFilter, syncCampaignId])

  React.useEffect(() => {
    void loadData()
  }, [loadData])

  React.useEffect(() => {
    if (!campaignFilter) {
      setMaterialsForAdd([])
      return
    }
    getMarketingMaterials({ campaignId: campaignFilter })
      .then((mats) =>
        setMaterialsForAdd(
          mats.map((m) => ({
            id: m.id,
            name: m.name,
            campaignId: m.campaignId,
          }))
        )
      )
      .catch(() => setMaterialsForAdd([]))
  }, [campaignFilter, syncCampaignId])

  const filteredGifts = React.useMemo(() => {
    let list = gifts
    if (storeFilter) {
      list = list.filter((g) => g.storeName === storeFilter)
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((g) => {
        const mn = (matLookup[g.materialId]?.name ?? "").toLowerCase()
        return (
          g.giftName.toLowerCase().includes(q) ||
          mn.includes(q) ||
          g.storeName.toLowerCase().includes(q)
        )
      })
    }
    return list
  }, [gifts, storeFilter, searchQuery, matLookup])

  const materialMetaById = React.useMemo(() => {
    const m: Record<string, { name: string; quantity: number }> = {}
    for (const mat of materialsForCampaign) {
      m[mat.id] = { name: mat.name, quantity: Math.max(0, Math.floor(Number(mat.quantity) || 0)) }
    }
    for (const g of gifts) {
      if (!m[g.materialId] && matLookup[g.materialId]) {
        m[g.materialId] = { name: matLookup[g.materialId].name, quantity: 0 }
      }
    }
    return m
  }, [materialsForCampaign, gifts, matLookup])

  const inventoryGroups = React.useMemo(
    () => aggregateGiftInventoryGroups(gifts, materialMetaById),
    [gifts, materialMetaById]
  )

  const inventoryTotals = React.useMemo(() => sumInventoryTotals(inventoryGroups), [inventoryGroups])

  const filteredInventoryGroups = React.useMemo(() => {
    let list = inventoryGroups
    if (invMaterialKey) list = list.filter((r) => r.materialId === invMaterialKey)
    if (invGiftKey) list = list.filter((r) => r.giftName === invGiftKey)
    if (invMismatchOnly) list = list.filter((r) => r.mismatchRowCount > 0)
    return list
  }, [inventoryGroups, invMaterialKey, invGiftKey, invMismatchOnly])

  const invGiftNameOptions = React.useMemo(() => {
    const s = new Set<string>()
    inventoryGroups.forEach((r) => s.add(r.giftName))
    return Array.from(s).sort()
  }, [inventoryGroups])

  const campaignLabelForGift = React.useCallback(
    (g: MarketingMaterialGift) => {
      const cid = g.campaignId ?? matLookup[g.materialId]?.campaignId
      if (!cid) return "—"
      const c = campaignMap[cid]
      return c ? `${c.campaignNo ? `[${c.campaignNo}] ` : ""}${c.topic}` : `ID ${cid}`
    },
    [campaignMap, matLookup]
  )

  const handleExport = async () => {
    setExporting(true)
    try {
      const q = effectiveCampaignId
        ? `?campaignId=${encodeURIComponent(effectiveCampaignId)}`
        : ""
      const res = await fetch(`/api/exportMarketingMaterialGifts${q}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        await appAlert(
          String((err as { message?: string }).message || t("marketingMaterialGiftDownloadFail"))
        )
        return
      }
      const blob = await res.blob()
      const dispo = res.headers.get("Content-Disposition")
      let fname = "marketing-material-gifts.xlsx"
      const m = dispo?.match(/filename="([^"]+)"/)
      if (m?.[1]) fname = decodeURIComponent(m[1])
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = fname
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setExporting(false)
    }
  }

  const handleAdd = async () => {
    if (!campaignFilter) {
      await appAlert(t("marketingMaterialGiftSelectCampaignFirst"))
      return
    }
    if (!addDraft.materialId.trim()) {
      await appAlert(t("marketingMaterialGiftSelectMaterial"))
      return
    }
    const storeName = addDraft.storeName.trim()
    const giftName = addDraft.giftName.trim()
    if (!storeName || !giftName) {
      await appAlert(t("marketingMaterialGiftEnterStoreAndGift"))
      return
    }
    const allocatedQty = Math.max(0, Math.floor(Number(addDraft.allocatedQty) || 0))
    const distributedQty = Math.max(0, Math.floor(Number(addDraft.distributedQty) || 0))
    setSaving(true)
    try {
      const res = await saveMarketingMaterialGift({
        materialId: addDraft.materialId.trim(),
        campaignId: effectiveCampaignId,
        storeName,
        giftName,
        allocatedQty,
        distributedQty,
        ruleNote: addDraft.ruleNote.trim(),
      })
      if (res.success) {
        setAddDraft({ ...defaultAdd, materialId: addDraft.materialId })
        await loadData()
      } else {
        await appAlert(res.message || t("msg_save_fail"))
      }
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (g: MarketingMaterialGift) => {
    setEditingId(g.id)
    setEditDraft({
      storeName: g.storeName,
      giftName: g.giftName,
      allocatedQty: String(g.allocatedQty),
      distributedQty: String(g.distributedQty),
      ruleNote: g.ruleNote,
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    const base = gifts.find((x) => x.id === editingId)
    if (!base) return
    const storeName = editDraft.storeName.trim()
    const giftName = editDraft.giftName.trim()
    if (!storeName || !giftName) {
      await appAlert(t("marketingMaterialGiftEnterStoreAndGift"))
      return
    }
    const allocatedQty = Math.max(0, Math.floor(Number(editDraft.allocatedQty) || 0))
    const distributedQty = Math.max(0, Math.floor(Number(editDraft.distributedQty) || 0))
    const cid =
      base.campaignId ??
      (campaignFilter || matLookup[base.materialId]?.campaignId || null)
    setSaving(true)
    try {
      const res = await saveMarketingMaterialGift({
        id: editingId,
        materialId: base.materialId,
        campaignId: cid ?? null,
        storeName,
        giftName,
        allocatedQty,
        distributedQty,
        ruleNote: editDraft.ruleNote.trim(),
      })
      if (res.success) {
        setEditingId(null)
        await loadData()
      } else {
        await appAlert(res.message || t("msg_save_fail"))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (g: MarketingMaterialGift) => {
    if (!await appConfirm(`"${g.giftName}" ${t("marketingMaterialGiftDeleteConfirmSuffix")}`)) return
    const res = await deleteMarketingMaterialGift({ id: g.id })
    if (res.success) {
      if (editingId === g.id) setEditingId(null)
      await loadData()
    } else {
      await appAlert(res.message || t("msg_delete_fail"))
    }
  }

  return (
    <div className="space-y-4">
      {showPageHeader && (
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Gift className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight">{t("adminMarketingMaterialGifts")}</h1>
            <p className="text-xs text-muted-foreground">{t("adminMarketingMaterialGiftsDesc")}</p>
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" asChild>
            <Link href="/admin/marketing/materials">
              <ExternalLink className="h-3.5 w-3.5" />
              {t("marketingMaterialGiftMaterialsOverviewLink")}
            </Link>
          </Button>
        </div>
      )}

      {!showPageHeader && (
        <p className="text-xs text-muted-foreground">{t("marketingMaterialGiftDescInline")}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-10 gap-1.5"
          onClick={() => void loadData()}
          disabled={loading}
        >
          <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
          {t("posRefresh")}
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-10 gap-1.5"
          onClick={() => void handleExport()}
          disabled={exporting || loading}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {t("adminMarketingMaterialGiftsExport")}
        </Button>
      </div>

      <div className="space-y-3">
        <MarketingCampaignFinderPanel
          value={campaignFilter}
          onChange={setCampaignFilter}
          campaigns={campaigns}
          allowEmpty
          emptyOptionLabel={t("marketingMaterialGiftSelectCampaignPlaceholder")}
          onRefresh={loadData}
          maxListHeightClass="max-h-48"
          disabled={loading || Boolean(syncCampaignId?.trim())}
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            disabled={giftSubTab === "inventory"}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t("marketingMaterialGiftAllStores")}</option>
            {stores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Input
            className="h-10 w-52"
            placeholder={t("marketingMaterialGiftSearchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={giftSubTab === "inventory"}
          />
        </div>
        {effectiveCampaignId && (
          <div className="flex flex-wrap gap-1 rounded-lg border border-input bg-muted/20 p-1">
            <Button
              type="button"
              variant={giftSubTab === "detail" ? "default" : "ghost"}
              size="sm"
              className="h-8 flex-1 text-xs sm:flex-none"
              onClick={() => setGiftSubTab("detail")}
            >
              {t("marketingMaterialGiftTabDetail")}
            </Button>
            <Button
              type="button"
              variant={giftSubTab === "inventory" ? "default" : "ghost"}
              size="sm"
              className="h-8 flex-1 text-xs sm:flex-none"
              onClick={() => setGiftSubTab("inventory")}
            >
              {t("marketingMaterialGiftTabInventory")}
            </Button>
          </div>
        )}
      </div>

      {giftSubTab === "inventory" && effectiveCampaignId && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">{t("marketingMaterialGiftInventoryDesc")}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingMaterialGiftAllocPh")}</div>
              <div className="text-lg font-semibold tabular-nums">{inventoryTotals.totalAllocated}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingMaterialGiftDistPh")}</div>
              <div className="text-lg font-semibold tabular-nums">{inventoryTotals.totalDistributed}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingMaterialGiftRemainingComputed")}</div>
              <div className="text-lg font-semibold tabular-nums">{inventoryTotals.totalRemainingComputed}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("marketingMaterialGiftCampaignTotals")}</div>
              <div className="text-[11px] text-muted-foreground">
                {t("marketingMaterialGiftColStoreRows")}: {inventoryTotals.storeRowCount} ·{" "}
                {t("marketingMaterialGiftSkuKinds")}: {inventoryTotals.uniqueSkus}
              </div>
              {inventoryTotals.mismatchRows > 0 && (
                <div className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {t("marketingMaterialGiftMismatchRows")}: {inventoryTotals.mismatchRows}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={invMaterialKey}
              onChange={(e) => setInvMaterialKey(e.target.value)}
              className="h-9 max-w-[220px] rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">{t("marketingMaterialGiftFilterAllMaterials")}</option>
              {materialsForCampaign.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              value={invGiftKey}
              onChange={(e) => setInvGiftKey(e.target.value)}
              className="h-9 max-w-[200px] rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">{t("marketingMaterialGiftFilterAllGifts")}</option>
              {invGiftNameOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={invMismatchOnly}
                onChange={(e) => setInvMismatchOnly(e.target.checked)}
                className="rounded border-input"
              />
              {t("marketingMaterialGiftMismatchOnly")}
            </label>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[880px] text-left text-xs">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("marketingMaterialGiftColMaterial")}</th>
                  <th className="px-3 py-2 font-medium">{t("marketingMaterialGiftColGift")}</th>
                  <th className="px-3 py-2 font-medium text-right">{t("marketingMaterialGiftColStoreRows")}</th>
                  <th className="px-3 py-2 font-medium text-right">{t("marketingMaterialGiftColStores")}</th>
                  <th className="px-3 py-2 font-medium text-right">{t("marketingMaterialGiftAllocPh")}</th>
                  <th className="px-3 py-2 font-medium text-right">{t("marketingMaterialGiftDistPh")}</th>
                  <th className="px-3 py-2 font-medium text-right">{t("marketingMaterialGiftColLeft")}</th>
                  <th className="px-3 py-2 font-medium text-right">{t("marketingMaterialGiftMatQtyHint")}</th>
                  <th className="px-3 py-2 font-medium text-right">{t("marketingMaterialGiftPoolVsAllocated")}</th>
                  <th className="px-3 py-2 font-medium text-center">{t("marketingMaterialGiftColQtyStatus")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredInventoryGroups.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                      {t("marketingMaterialGiftTableEmpty")}
                    </td>
                  </tr>
                )}
                {filteredInventoryGroups.map((row) => (
                  <tr key={`${row.materialId}-${row.giftName}`}>
                    <td className="px-3 py-2 align-top font-medium">{row.materialName}</td>
                    <td className="px-3 py-2 align-top">{row.giftName}</td>
                    <td className="px-3 py-2 align-top text-right tabular-nums">{row.storeRowCount}</td>
                    <td className="px-3 py-2 align-top text-right tabular-nums">{row.uniqueStoreCount}</td>
                    <td className="px-3 py-2 align-top text-right tabular-nums">{row.totalAllocated}</td>
                    <td className="px-3 py-2 align-top text-right tabular-nums">{row.totalDistributed}</td>
                    <td className="px-3 py-2 align-top text-right tabular-nums font-medium">
                      {row.totalRemainingComputed}
                    </td>
                    <td className="px-3 py-2 align-top text-right tabular-nums text-muted-foreground">
                      {row.materialQuantity || "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 align-top text-right tabular-nums",
                        row.poolVsAllocated < 0 ? "text-destructive font-medium" : "text-muted-foreground"
                      )}
                    >
                      {row.materialQuantity > 0 ? row.poolVsAllocated : "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-center">
                      {row.mismatchRowCount > 0 ? (
                        <span
                          className="inline-flex items-center justify-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900"
                          title={t("marketingMaterialGiftMismatchBadgeHint")}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {row.mismatchRowCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {giftSubTab === "detail" && (
        <>
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">{t("marketingMaterialGiftAddRowTitle")}</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">{t("marketingMaterialGiftAddRowHint")}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <select
            value={addDraft.materialId}
            onChange={(e) => setAddDraft((d) => ({ ...d, materialId: e.target.value }))}
            disabled={!campaignFilter || materialsForAdd.length === 0}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs sm:col-span-2 lg:col-span-1"
          >
            <option value="">
              {!effectiveCampaignId
                ? t("marketingMaterialGiftNeedCampaign")
                : t("marketingMaterialGiftSelectMaterialShort")}
            </option>
            {materialsForAdd.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={addDraft.storeName}
            onChange={(e) => setAddDraft((d) => ({ ...d, storeName: e.target.value }))}
            disabled={storesLoading}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">{t("marketingMaterialGiftStoreOption")}</option>
            {stores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Input
            className="h-9 text-xs"
            value={addDraft.giftName}
            onChange={(e) => setAddDraft((d) => ({ ...d, giftName: e.target.value }))}
            placeholder={t("marketingMaterialGiftGiftNamePh")}
          />
          <Input
            type="number"
            min={0}
            className="h-9 text-xs"
            value={addDraft.allocatedQty}
            onChange={(e) => setAddDraft((d) => ({ ...d, allocatedQty: e.target.value }))}
            placeholder={t("marketingMaterialGiftAllocPh")}
          />
          <Input
            type="number"
            min={0}
            className="h-9 text-xs"
            value={addDraft.distributedQty}
            onChange={(e) => setAddDraft((d) => ({ ...d, distributedQty: e.target.value }))}
            placeholder={t("marketingMaterialGiftDistPh")}
          />
          <div className="flex h-9 items-center rounded-md border border-dashed border-input bg-muted/30 px-2 text-xs tabular-nums text-muted-foreground">
            {t("marketingMaterialGiftRemainingComputed")}:{" "}
            <span className="ml-1 font-medium text-foreground">
              {computedGiftRemaining(
                Math.max(0, Math.floor(Number(addDraft.allocatedQty) || 0)),
                Math.max(0, Math.floor(Number(addDraft.distributedQty) || 0))
              )}
            </span>
          </div>
          <Input
            className="h-9 text-xs sm:col-span-2 lg:col-span-3"
            value={addDraft.ruleNote}
            onChange={(e) => setAddDraft((d) => ({ ...d, ruleNote: e.target.value }))}
            placeholder={t("marketingMaterialGiftRuleNotePh")}
          />
        </div>
        <Button
          type="button"
          size="sm"
          className="mt-3 h-8 gap-1 text-xs"
          disabled={saving || storesLoading}
          onClick={() => void handleAdd()}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {t("add")}
        </Button>
      </div>

      {loading && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {t("loading")}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t("marketingPerformanceFilterCampaign")}</th>
              <th className="px-3 py-2 font-medium">{t("marketingMaterialGiftColMaterial")}</th>
              <th className="px-3 py-2 font-medium">{t("marketingPerformanceStore")}</th>
              <th className="px-3 py-2 font-medium">{t("marketingMaterialGiftColGift")}</th>
              <th className="px-3 py-2 font-medium text-right">{t("marketingMaterialGiftAllocPh")}</th>
              <th className="px-3 py-2 font-medium text-right">{t("marketingMaterialGiftDistPh")}</th>
              <th className="px-3 py-2 font-medium text-right">{t("marketingMaterialGiftColLeft")}</th>
              <th className="px-3 py-2 w-10 text-center font-medium" title={t("marketingMaterialGiftColQtyStatus")}>
                <AlertTriangle className="mx-auto h-3.5 w-3.5 opacity-60" />
              </th>
              <th className="px-3 py-2 font-medium">{t("marketingMaterialGiftColNote")}</th>
              <th className="px-3 py-2 font-medium w-[140px]">{t("marketingMaterialGiftColActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredGifts.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground text-xs">
                  {!effectiveCampaignId
                    ? t("marketingMaterialGiftTablePickCampaign")
                    : t("marketingMaterialGiftTableEmpty")}
                </td>
              </tr>
            )}
            {filteredGifts.map((g) =>
              editingId === g.id ? (
                <tr key={g.id} className="bg-muted/20">
                  <td colSpan={10} className="p-3">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <select
                        value={editDraft.storeName}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, storeName: e.target.value }))
                        }
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        {stores.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <Input
                        className="h-8 text-xs sm:col-span-2"
                        value={editDraft.giftName}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, giftName: e.target.value }))
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        className="h-8 text-xs"
                        value={editDraft.allocatedQty}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, allocatedQty: e.target.value }))
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        className="h-8 text-xs"
                        value={editDraft.distributedQty}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, distributedQty: e.target.value }))
                        }
                      />
                      <div className="flex h-8 items-center rounded-md border border-dashed px-2 text-[11px] tabular-nums text-muted-foreground">
                        {t("marketingMaterialGiftRemainingComputed")}:{" "}
                        <span className="ml-1 font-medium text-foreground">
                          {computedGiftRemaining(
                            Math.max(0, Math.floor(Number(editDraft.allocatedQty) || 0)),
                            Math.max(0, Math.floor(Number(editDraft.distributedQty) || 0))
                          )}
                        </span>
                      </div>
                      <Input
                        className="h-8 text-xs sm:col-span-2 lg:col-span-4"
                        value={editDraft.ruleNote}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, ruleNote: e.target.value }))
                        }
                      />
                      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={saving}
                          onClick={() => void handleSaveEdit()}
                        >
                          {t("save")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setEditingId(null)}
                        >
                          {t("cancel")}
                        </Button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={g.id} className="text-xs">
                  <td className="px-3 py-2 align-top max-w-[180px] truncate" title={campaignLabelForGift(g)}>
                    {campaignLabelForGift(g)}
                  </td>
                  <td className="px-3 py-2 align-top max-w-[160px]">
                    <span className="line-clamp-2">{matLookup[g.materialId]?.name || `#${g.materialId}`}</span>
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">{g.storeName}</td>
                  <td className="px-3 py-2 align-top max-w-[140px] line-clamp-2">{g.giftName}</td>
                  <td className="px-3 py-2 align-top text-right tabular-nums">{g.allocatedQty}</td>
                  <td className="px-3 py-2 align-top text-right tabular-nums">{g.distributedQty}</td>
                  <td className="px-3 py-2 align-top text-right tabular-nums">
                    {computedGiftRemaining(g.allocatedQty, g.distributedQty)}
                    {giftRowQtyMismatch(g) && (
                      <span className="ml-1 text-[10px] text-amber-700" title={t("marketingMaterialGiftMismatchStoredHint")}>
                        (DB {g.remainingQty})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-center">
                    {giftRowQtyMismatch(g) ? (
                      <span
                        className="mx-auto inline-flex"
                        title={t("marketingMaterialGiftMismatchBadgeHint")}
                      >
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top max-w-[160px] line-clamp-2 text-muted-foreground">
                    {g.ruleNote || "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => startEdit(g)}
                      >
                        {t("edit")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => void handleDelete(g)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      {(g.campaignId ?? matLookup[g.materialId]?.campaignId) && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                          <Link
                            href={`/admin/marketing/campaigns?openCampaign=${g.campaignId ?? matLookup[g.materialId]?.campaignId}&tab=materials`}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  )
}
