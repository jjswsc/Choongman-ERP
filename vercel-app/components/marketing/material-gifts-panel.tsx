"use client"

import * as React from "react"
import Link from "next/link"
import { Gift, Loader2, Plus, RotateCw, Trash2, Download, ExternalLink } from "lucide-react"
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
  type MarketingMaterialGift,
} from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type MatMeta = { name: string; campaignId: string | null }

const defaultAdd = {
  materialId: "",
  storeName: "",
  giftName: "",
  allocatedQty: "",
  distributedQty: "",
  remainingQty: "",
  ruleNote: "",
}

const defaultEditRow = {
  storeName: "",
  giftName: "",
  allocatedQty: "",
  distributedQty: "",
  remainingQty: "",
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

  const tr = React.useCallback(
    (ko: string, en: string, th: string) => {
      if (lang === "en") return en
      if (lang === "th") return th
      return ko
    },
    [lang]
  )

  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [gifts, setGifts] = React.useState<MarketingMaterialGift[]>([])
  const [matLookup, setMatLookup] = React.useState<Record<string, MatMeta>>({})
  const [materialsForAdd, setMaterialsForAdd] = React.useState<
    { id: string; name: string; campaignId: string | null }[]
  >([])
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [storeFilter, setStoreFilter] = React.useState("")
  const [searchQuery, setSearchQuery] = React.useState("")
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
        return
      }
      const g = await getMarketingMaterialGifts({ campaignId: campaignParam })
      setGifts(Array.isArray(g) ? g : [])
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
          String((err as { message?: string }).message || tr("다운로드 실패", "Download failed", "ดาวน์โหลดไม่สำเร็จ"))
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
      await appAlert(tr("캠페인을 먼저 선택하세요.", "Select a campaign first.", "กรุณาเลือกแคมเปญก่อน"))
      return
    }
    if (!addDraft.materialId.trim()) {
      await appAlert(tr("홍보물을 선택하세요.", "Select a material.", "กรุณาเลือกสื่อโปรโมชัน"))
      return
    }
    const storeName = addDraft.storeName.trim()
    const giftName = addDraft.giftName.trim()
    if (!storeName || !giftName) {
      await appAlert(tr("매장과 사은품명을 입력하세요.", "Enter store and gift name.", "กรุณากรอกสาขาและชื่อของแถม"))
      return
    }
    const allocatedQty = Math.max(0, Math.floor(Number(addDraft.allocatedQty) || 0))
    const distributedQty = Math.max(0, Math.floor(Number(addDraft.distributedQty) || 0))
    const remainingRaw = addDraft.remainingQty.trim()
    setSaving(true)
    try {
      const res = await saveMarketingMaterialGift({
        materialId: addDraft.materialId.trim(),
        campaignId: effectiveCampaignId,
        storeName,
        giftName,
        allocatedQty,
        distributedQty,
        remainingQty:
          remainingRaw === "" ? undefined : Math.max(0, Math.floor(Number(remainingRaw) || 0)),
        ruleNote: addDraft.ruleNote.trim(),
      })
      if (res.success) {
        setAddDraft({ ...defaultAdd, materialId: addDraft.materialId })
        await loadData()
      } else {
        await appAlert(res.message || tr("저장 실패", "Save failed", "บันทึกไม่สำเร็จ"))
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
      remainingQty: String(g.remainingQty),
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
      await appAlert(tr("매장과 사은품명을 입력하세요.", "Enter store and gift name.", "กรุณากรอกสาขาและชื่อของแถม"))
      return
    }
    const allocatedQty = Math.max(0, Math.floor(Number(editDraft.allocatedQty) || 0))
    const distributedQty = Math.max(0, Math.floor(Number(editDraft.distributedQty) || 0))
    const remainingRaw = editDraft.remainingQty.trim()
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
        remainingQty:
          remainingRaw === "" ? undefined : Math.max(0, Math.floor(Number(remainingRaw) || 0)),
        ruleNote: editDraft.ruleNote.trim(),
      })
      if (res.success) {
        setEditingId(null)
        await loadData()
      } else {
        await appAlert(res.message || tr("저장 실패", "Save failed", "บันทึกไม่สำเร็จ"))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (g: MarketingMaterialGift) => {
    if (!await appConfirm(`"${g.giftName}" ${tr("삭제하시겠습니까?", "Delete?", "ต้องการลบหรือไม่?")}`)) return
    const res = await deleteMarketingMaterialGift({ id: g.id })
    if (res.success) {
      if (editingId === g.id) setEditingId(null)
      await loadData()
    } else {
      await appAlert(res.message || tr("삭제 실패", "Delete failed", "ลบไม่สำเร็จ"))
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
            <h1 className="text-xl font-bold tracking-tight">
              {t("adminMarketingMaterialGifts") || "사은품(홍보물)"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("adminMarketingMaterialGiftsDesc") ||
                tr(
                  "매장별 사은품 배정·배포·잔여를 한곳에서 관리합니다.",
                  "Manage gift allocation and distribution by store.",
                  "จัดการของแถมแยกตามสาขาในที่เดียว"
                )}
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" asChild>
            <Link href="/admin/marketing/materials">
              <ExternalLink className="h-3.5 w-3.5" />
              {tr("홍보물 현황", "Materials overview", "ภาพรวมสื่อ")}
            </Link>
          </Button>
        </div>
      )}

      {!showPageHeader && (
        <p className="text-xs text-muted-foreground">
          {t("adminMarketingMaterialGiftsDesc") ||
            tr(
              "매장별 사은품 배정·배포·잔여를 관리합니다.",
              "Manage gift allocation and distribution by store.",
              "จัดการของแถมแยกตามสาขา"
            )}
        </p>
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
          {t("posRefresh") || tr("새로고침", "Refresh", "รีเฟรช")}
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
          {t("adminMarketingMaterialGiftsExport") || tr("엑셀 다운로드", "Download Excel", "ดาวน์โหลด Excel")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={campaignFilter}
          onChange={(e) => setCampaignFilter(e.target.value)}
          className="h-10 min-w-[200px] rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">
            {tr("캠페인 선택…", "Select campaign…", "เลือกแคมเปญ…")}
          </option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.campaignNo ? `[${c.campaignNo}] ` : ""}
              {c.topic}
            </option>
          ))}
        </select>
        <select
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{tr("전체 매장", "All stores", "ทุกสาขา")}</option>
          {stores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Input
          className="h-10 w-52"
          placeholder={tr("사은품·홍보물명 검색", "Search gift / material", "ค้นหาของแถม/สื่อ")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">{tr("행 추가", "Add row", "เพิ่มแถว")}</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">
          {tr(
            "캠페인을 선택한 뒤 홍보물·매장·사은품 정보를 입력하세요.",
            "Select a campaign, then material, store and gift details.",
            "เลือกแคมเปญ แล้วระบุสื่อ สาขา และของแถม"
          )}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <select
            value={addDraft.materialId}
            onChange={(e) => setAddDraft((d) => ({ ...d, materialId: e.target.value }))}
            disabled={!campaignFilter || materialsForAdd.length === 0}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs sm:col-span-2 lg:col-span-1"
          >
            <option value="">
              {!effectiveCampaignId
                ? tr("캠페인 선택 필요", "Pick campaign first", "เลือกแคมเปญก่อน")
                : tr("홍보물 선택", "Select material", "เลือกสื่อ")}
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
            <option value="">{tr("매장", "Store", "สาขา")}</option>
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
            placeholder={tr("사은품명", "Gift name", "ชื่อของแถม")}
          />
          <Input
            type="number"
            min={0}
            className="h-9 text-xs"
            value={addDraft.allocatedQty}
            onChange={(e) => setAddDraft((d) => ({ ...d, allocatedQty: e.target.value }))}
            placeholder={tr("배정", "Alloc", "จัดสรร")}
          />
          <Input
            type="number"
            min={0}
            className="h-9 text-xs"
            value={addDraft.distributedQty}
            onChange={(e) => setAddDraft((d) => ({ ...d, distributedQty: e.target.value }))}
            placeholder={tr("배포", "Dist", "แจกจ่าย")}
          />
          <Input
            type="number"
            min={0}
            className="h-9 text-xs"
            value={addDraft.remainingQty}
            onChange={(e) => setAddDraft((d) => ({ ...d, remainingQty: e.target.value }))}
            placeholder={tr("잔여(공란=자동)", "Left (auto)", "คงเหลือ (เว้นว่าง=อัตโนมัติ)")}
          />
          <Input
            className="h-9 text-xs sm:col-span-2 lg:col-span-3"
            value={addDraft.ruleNote}
            onChange={(e) => setAddDraft((d) => ({ ...d, ruleNote: e.target.value }))}
            placeholder={tr("배포 기준 메모", "Rule note", "หมายเหตุเกณฑ์แจกจ่าย")}
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
          {tr("추가", "Add", "เพิ่ม")}
        </Button>
      </div>

      {loading && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {t("loading")}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{tr("캠페인", "Campaign", "แคมเปญ")}</th>
              <th className="px-3 py-2 font-medium">{tr("홍보물", "Material", "สื่อ")}</th>
              <th className="px-3 py-2 font-medium">{tr("매장", "Store", "สาขา")}</th>
              <th className="px-3 py-2 font-medium">{tr("사은품", "Gift", "ของแถม")}</th>
              <th className="px-3 py-2 font-medium text-right">{tr("배정", "Alloc", "จัดสรร")}</th>
              <th className="px-3 py-2 font-medium text-right">{tr("배포", "Dist", "แจกจ่าย")}</th>
              <th className="px-3 py-2 font-medium text-right">{tr("잔여", "Left", "คงเหลือ")}</th>
              <th className="px-3 py-2 font-medium">{tr("메모", "Note", "บันทึก")}</th>
              <th className="px-3 py-2 font-medium w-[140px]">{tr("작업", "Actions", "การทำงาน")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredGifts.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground text-xs">
                  {!effectiveCampaignId
                    ? tr(
                        "캠페인을 선택하면 사은품 목록이 표시됩니다.",
                        "Select a campaign to list gifts.",
                        "เลือกแคมเปญเพื่อดูของแถม"
                      )
                    : tr("데이터가 없습니다.", "No data.", "ไม่มีข้อมูล")}
                </td>
              </tr>
            )}
            {filteredGifts.map((g) =>
              editingId === g.id ? (
                <tr key={g.id} className="bg-muted/20">
                  <td colSpan={9} className="p-3">
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
                      <Input
                        type="number"
                        min={0}
                        className="h-8 text-xs"
                        value={editDraft.remainingQty}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, remainingQty: e.target.value }))
                        }
                        placeholder={tr("잔여", "Left", "คงเหลือ")}
                      />
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
                          {tr("저장", "Save", "บันทึก")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setEditingId(null)}
                        >
                          {tr("취소", "Cancel", "ยกเลิก")}
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
                  <td className="px-3 py-2 align-top text-right tabular-nums">{g.remainingQty}</td>
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
                        {tr("편집", "Edit", "แก้ไข")}
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
    </div>
  )
}
