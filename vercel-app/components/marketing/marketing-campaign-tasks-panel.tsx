"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2, Plus, Package, GripVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { appAlert } from "@/lib/app-message"
import {
  getMarketingCampaigns,
  getMarketingInfluencers,
  getMarketingMaterials,
  getMarketingMaterialStoreChecks,
  saveMarketingInfluencer,
  saveMarketingMaterial,
  saveMarketingMaterialStoreCheck,
  useStoreList,
  type MarketingCampaign,
  type MarketingInfluencer,
  type MarketingMaterial,
  type MarketingMaterialStoreCheck,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import {
  influencerTaskColumn,
  materialTaskColumn,
  type MarketingTaskColumn,
} from "@/lib/marketing-ops-board"
import { findStoreCheckForBranch, materialTargetStores, resolveStoreMaterialTaskPhase } from "@/lib/marketing-material-checklist-utils"
import { influencerStatusForColumn, materialStatusForColumn } from "@/lib/marketing-meta-match"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { splitStoreQuantities, storeDispatchQuantity } from "@/lib/marketing-store-qty"
import {
  defaultMarketingMaterialTypeOptions,
  loadMarketingMaterialTypeOptions,
  materialTypeSelectOptions,
  resolveMaterialTypeLabel,
} from "@/lib/marketing-material-type-options"
type Card =
  | { kind: "material"; column: MarketingTaskColumn; material: MarketingMaterial }
  | { kind: "influencer"; column: MarketingTaskColumn; influencer: MarketingInfluencer }

export function MarketingCampaignTasksPanel({ campaignId }: { campaignId: string }) {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const { stores, formatStoreLabel } = useStoreList()
  const tr = React.useCallback(
    (ko: string, en: string, th: string) => {
      if (lang === "en") return en
      if (lang === "th") return th
      if (lang === "ko") return ko
      return en
    },
    [lang]
  )
  const hqLabel = tr("본사공용", "HQ-wide", "ส่วนกลางสำนักงานใหญ่")
  const cid = campaignId.trim()
  const [loading, setLoading] = React.useState(true)
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [materials, setMaterials] = React.useState<MarketingMaterial[]>([])
  const [checks, setChecks] = React.useState<MarketingMaterialStoreCheck[]>([])
  const [influencers, setInfluencers] = React.useState<MarketingInfluencer[]>([])
  const [addKind, setAddKind] = React.useState<"material" | "influencer" | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [matName, setMatName] = React.useState("")
  const [matType, setMatType] = React.useState("standee")
  const [matBranches, setMatBranches] = React.useState<string[]>([])
  const [matQty, setMatQty] = React.useState("1")
  const [infName, setInfName] = React.useState("")
  const [infNote, setInfNote] = React.useState("")
  const [infDate, setInfDate] = React.useState("")
  const [infBudget, setInfBudget] = React.useState("")

  const typeOptions = React.useMemo(() => {
    if (typeof window === "undefined") return defaultMarketingMaterialTypeOptions()
    return loadMarketingMaterialTypeOptions()
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [camps, mats, chk, inf] = await Promise.all([
        getMarketingCampaigns(),
        getMarketingMaterials({ campaignId: cid }),
        getMarketingMaterialStoreChecks({ campaignId: cid }),
        getMarketingInfluencers({ campaignId: cid }),
      ])
      setCampaigns(Array.isArray(camps) ? camps : [])
      setMaterials(Array.isArray(mats) ? mats : [])
      setChecks(Array.isArray(chk) ? chk : [])
      setInfluencers(Array.isArray(inf) ? inf : [])
    } finally {
      setLoading(false)
    }
  }, [cid])

  React.useEffect(() => {
    void load()
  }, [load])

  const cards: Card[] = React.useMemo(() => {
    const out: Card[] = []
    for (const m of materials) {
      out.push({ kind: "material", column: materialTaskColumn(m, checks, hqLabel), material: m })
    }
    for (const inf of influencers) {
      out.push({ kind: "influencer", column: influencerTaskColumn(inf), influencer: inf })
    }
    return out
  }, [materials, influencers, checks, hqLabel])

  const byCol = (col: MarketingTaskColumn) => cards.filter((c) => c.column === col)

  const moveCard = async (card: Card, col: MarketingTaskColumn) => {
    setSaving(true)
    try {
      if (card.kind === "material") {
        const res = await saveMarketingMaterial({
          id: card.material.id,
          campaignId: cid,
          name: card.material.name,
          type: card.material.type,
          quantity: card.material.quantity,
          branches: card.material.branches,
          isHqWide: card.material.isHqWide,
          status: materialStatusForColumn(col),
          producedOn: col === "todo" ? card.material.producedOn : card.material.producedOn || getBangkokTodayDateString(),
          userRole: auth?.role,
          userName: auth?.user,
          userStore: auth?.store,
        })
        if (!res.success) await appAlert(res.message || t("marketingWsSaveFail"))
      } else {
        const res = await saveMarketingInfluencer({
          id: card.influencer.id,
          campaignId: cid,
          name: card.influencer.name,
          status: influencerStatusForColumn(col),
          note: card.influencer.note,
          publishDate: card.influencer.publishDate,
          budget: card.influencer.budget,
          userRole: auth?.role,
          userName: auth?.user,
          userStore: auth?.store,
        })
        if (!res.success) await appAlert(res.message || t("marketingWsSaveFail"))
      }
      await load()
    } finally {
      setSaving(false)
    }
  }

  const markStore = async (material: MarketingMaterial, store: string, phase: "receive" | "install") => {
    const existing = findStoreCheckForBranch(checks, material.id, store)
    const today = getBangkokTodayDateString()
    setSaving(true)
    try {
      const res = await saveMarketingMaterialStoreCheck({
        id: existing?.id,
        materialId: material.id,
        campaignId: cid,
        storeName: store,
        receivedOn: phase === "receive" ? today : existing?.receivedOn || today,
        installedOn: phase === "install" ? today : existing?.installedOn || null,
        materialType: material.type,
      })
      if (!res.success) await appAlert(res.message || t("marketingWsSaveFail"))
      await load()
    } finally {
      setSaving(false)
    }
  }

  const addMaterial = async () => {
    if (!matName.trim()) {
      await appAlert(t("marketingWsNeedTitle"))
      return
    }
    setSaving(true)
    try {
      const res = await saveMarketingMaterial({
        campaignId: cid,
        name: matName.trim(),
        type: matType,
        quantity: Number(matQty) || 1,
        branches: matBranches,
        status: "planning",
        userRole: auth?.role,
        userName: auth?.user,
        userStore: auth?.store,
      })
      if (!res.success) {
        await appAlert(res.message || t("marketingWsSaveFail"))
        return
      }
      if (res.id && matBranches.length > 0) {
        const splits = splitStoreQuantities(Number(matQty) || 1, matBranches.length)
        await Promise.all(
          matBranches.map((store, i) =>
            saveMarketingMaterialStoreCheck({
              materialId: res.id as string,
              campaignId: cid,
              storeName: store,
              quantity: splits[i] ?? 0,
              materialType: matType,
            })
          )
        )
      }
      setAddKind(null)
      setMatName("")
      setMatBranches([])
      setMatQty("1")
      await load()
    } finally {
      setSaving(false)
    }
  }

  const addInfluencer = async () => {
    if (!infName.trim()) {
      await appAlert(t("marketingWsNeedTitle"))
      return
    }
    setSaving(true)
    try {
      const res = await saveMarketingInfluencer({
        campaignId: cid,
        name: infName.trim(),
        status: "draft",
        note: infNote,
        publishDate: infDate || null,
        budget: Number(infBudget) || 0,
        userRole: auth?.role,
        userName: auth?.user,
        userStore: auth?.store,
      })
      if (!res.success) {
        await appAlert(res.message || t("marketingWsSaveFail"))
        return
      }
      setAddKind(null)
      setInfName("")
      setInfNote("")
      setInfDate("")
      setInfBudget("")
      await load()
    } finally {
      setSaving(false)
    }
  }

  const saveStoreQty = async (material: MarketingMaterial, store: string, raw: string) => {
    const existing = findStoreCheckForBranch(checks, material.id, store)
    const n = Math.max(0, Math.round(Number(raw) || 0))
    if (existing?.quantity != null && existing.quantity === n) return
    setSaving(true)
    try {
      const res = await saveMarketingMaterialStoreCheck({
        id: existing?.id,
        materialId: material.id,
        campaignId: cid,
        storeName: store,
        quantity: n,
        materialType: material.type,
      })
      if (!res.success) await appAlert(res.message || t("marketingWsSaveFail"))
      await load()
    } finally {
      setSaving(false)
    }
  }

  const colTitle = (col: MarketingTaskColumn) =>
    col === "todo" ? t("marketingTaskTodo") : col === "doing" ? t("marketingTaskDoing") : t("marketingTaskDone")

  const campaign = campaigns.find((c) => c.id === cid)

  const moveButtons = (card: Card, column: MarketingTaskColumn) => (
    <div className="mt-2 flex flex-wrap gap-1">
      {(["todo", "doing", "done"] as const).map((col) => (
        <Button
          key={col}
          type="button"
          variant={col === column ? "secondary" : "outline"}
          size="sm"
          className="h-7 px-2 text-[10px]"
          disabled={saving || col === column}
          onClick={() => void moveCard(card, col)}
        >
          {colTitle(col)}
        </Button>
      ))}
    </div>
  )

  const renderCard = (card: Card) => {
    if (card.kind === "material") {
      const m = card.material
      const storesForMat = materialTargetStores(m, hqLabel)
      return (
        <div key={`m-${m.id}`} className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex items-start gap-2">
            <button
              type="button"
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "material", id: m.id }))}
              className="mt-0.5 hidden cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted md:block active:cursor-grabbing"
              aria-label={t("marketingTaskMoveTo")}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
            {resolveMaterialTypeLabel(m.type, typeOptions, tr)}
          </span>
          <p className="mt-2 text-sm font-semibold">{m.name}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("marketingWsQty")}: {m.quantity || 1}
            {m.displayStartDate ? ` · ${m.displayStartDate}` : ""}
          </p>
          <div className="mt-2 space-y-1">
            {storesForMat.slice(0, 8).map((store, storeIndex) => {
              const check = findStoreCheckForBranch(checks, m.id, store)
              const phase = resolveStoreMaterialTaskPhase(m, check)
              const qty = storeDispatchQuantity({
                checkQuantity: check?.quantity,
                materialQuantity: m.quantity,
                storeCount: storesForMat.length,
                storeIndex,
              })
              return (
                <div key={store} className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {formatStoreLabel(store)} · {phase === "receive" ? t("marketingHomePhaseReceive") : phase === "install" ? t("marketingHomePhaseInstall") : phase === "done" ? t("marketingTaskDone") : t("marketingMaterialChecklistWaitingProduction")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Input
                      key={`${m.id}-${store}-${check?.quantity ?? "e"}`}
                      className="h-6 w-14 px-1 text-[11px]"
                      inputMode="numeric"
                      defaultValue={String(qty.qty)}
                      disabled={saving}
                      onBlur={(e) => void saveStoreQty(m, store, e.target.value)}
                      aria-label={t("marketingWsQty")}
                    />
                    {phase === "receive" ? (
                      <Button type="button" variant="outline" size="sm" className="h-6 px-1.5 text-[10px]" disabled={saving} onClick={() => void markStore(m, store, "receive")}>
                        {t("marketingMaterialChecklistConfirmReceived")}
                      </Button>
                    ) : null}
                    {phase === "install" ? (
                      <Button type="button" variant="outline" size="sm" className="h-6 px-1.5 text-[10px]" disabled={saving} onClick={() => void markStore(m, store, "install")}>
                        {t("marketingMaterialChecklistConfirmInstalled")}
                      </Button>
                    ) : null}
                  </span>
                </div>
              )
            })}
          </div>
          {moveButtons(card, card.column)}
            </div>
          </div>
        </div>
      )
    }
    const inf = card.influencer
    return (
      <div key={`i-${inf.id}`} className="rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex items-start gap-2">
          <button
            type="button"
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "influencer", id: inf.id }))}
            className="mt-0.5 hidden cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted md:block active:cursor-grabbing"
            aria-label={t("marketingTaskMoveTo")}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-900 dark:bg-violet-900/40 dark:text-violet-100">
          {t("marketingTaskKindInfluencer")}
        </span>
        <p className="mt-2 text-sm font-semibold">{inf.name}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {inf.branchReview || campaign?.topic || ""}
          {inf.publishDate ? ` · ${inf.publishDate}` : ""}
        </p>
        {inf.note ? <p className="mt-1 text-[11px] text-muted-foreground">{inf.note}</p> : null}
        {inf.budget ? <p className="mt-1 text-[11px] tabular-nums">฿{inf.budget.toLocaleString()}</p> : null}
        {moveButtons(card, card.column)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("marketingWsTabTasks")}</h3>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" className="h-8 text-xs" asChild>
            <Link href={`/admin/marketing/materials?campaignId=${encodeURIComponent(cid)}&tab=checklist`}>
              {t("marketingMaterialChecklistTab")}
            </Link>
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setAddKind("material")}>
            <Package className="h-3.5 w-3.5" />
            {t("marketingTaskAddMaterial")}
          </Button>
          <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setAddKind("influencer")}>
            <Plus className="h-3.5 w-3.5" />
            {t("marketingTaskAddInfluencer")}
          </Button>
        </div>
      </div>

      {addKind ? (
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="mb-3 text-sm font-medium">
            {addKind === "material" ? t("marketingTaskAddMaterial") : t("marketingTaskAddInfluencer")}
          </p>
          {addKind === "material" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("marketingWsTitle")}</Label>
                <Input className="mt-1" value={matName} onChange={(e) => setMatName(e.target.value)} />
              </div>
              <div>
                <Label>{t("marketingTaskKindMaterial")}</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={matType}
                  onChange={(e) => setMatType(e.target.value)}
                >
                  {materialTypeSelectOptions(typeOptions, matType, tr).map((o) => (
                    <option key={o.value} value={o.value}>
                      {resolveMaterialTypeLabel(o.value, typeOptions, tr)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t("marketingWsQty")}</Label>
                <Input className="mt-1" inputMode="numeric" value={matQty} onChange={(e) => setMatQty(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>{t("marketingWsBranches")}</Label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {stores.map((s) => {
                    const on = matBranches.includes(s)
                    return (
                      <button
                        key={s}
                        type="button"
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] ring-1",
                          on ? "bg-primary/10 text-primary ring-primary/30" : "bg-background text-muted-foreground ring-border"
                        )}
                        onClick={() =>
                          setMatBranches((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
                        }
                      >
                        {formatStoreLabel(s)}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("marketingWsTitle")}</Label>
                <Input className="mt-1" value={infName} onChange={(e) => setInfName(e.target.value)} />
              </div>
              <div>
                <Label>{t("marketingTaskPublishDate")}</Label>
                <Input className="mt-1" type="date" value={infDate} onChange={(e) => setInfDate(e.target.value)} />
              </div>
              <div>
                <Label>{t("marketingWsBudget")}</Label>
                <Input className="mt-1" inputMode="decimal" value={infBudget} onChange={(e) => setInfBudget(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>{t("marketingWsDetail")}</Label>
                <Textarea className="mt-1" rows={2} value={infNote} onChange={(e) => setInfNote(e.target.value)} />
              </div>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={saving} onClick={() => void (addKind === "material" ? addMaterial() : addInfluencer())}>
              {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
              {t("marketingWsSave")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAddKind(null)}>
              {t("marketingWsCancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {(["todo", "doing", "done"] as const).map((col) => (
            <div
              key={col}
              className="rounded-xl border bg-muted/15 p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                try {
                  const raw = JSON.parse(e.dataTransfer.getData("text/plain") || "{}") as { kind?: string; id?: string }
                  const card = cards.find((c) =>
                    raw.kind === "material" && c.kind === "material"
                      ? c.material.id === raw.id
                      : raw.kind === "influencer" && c.kind === "influencer"
                        ? c.influencer.id === raw.id
                        : false
                  )
                  if (card) void moveCard(card, col)
                } catch {
                  /* ignore */
                }
              }}
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {colTitle(col)} · {byCol(col).length}
              </p>
              <div className="space-y-2">
                {byCol(col).length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">{t("marketingTaskEmptyColumn")}</p>
                ) : (
                  byCol(col).map(renderCard)
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">{t("marketingTaskHint")}</p>
    </div>
  )
}
