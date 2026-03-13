"use client"

import * as React from "react"
import {
  LayoutGrid,
  Plus,
  Save,
  Trash2,
  RotateCcw,
  RotateCw,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Square,
  RectangleHorizontal,
  RectangleVertical,
  Copy,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getPosTableLayout,
  savePosTableLayout,
  useStoreList,
  type PosTableItem,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import { cn } from "@/lib/utils"

const FLOOR_W = 720
const FLOOR_H = 480
const GRID_SIZE = 24

type TableShape = "rect" | "rect-wide" | "square"

const SHAPE_PRESETS: { shape: TableShape; w: number; h: number; label: string; defaultSeats: number }[] = [
  { shape: "rect", w: 80, h: 60, label: "일반", defaultSeats: 4 },
  { shape: "rect-wide", w: 100, h: 56, label: "긴형", defaultSeats: 6 },
  { shape: "square", w: 64, h: 64, label: "정사각", defaultSeats: 2 },
]

const SEAT_OPTIONS = [2, 3, 4, 5, 6, 8, 10]

const SEAT_R = 6
const SEAT_OFFSET = 2

/** 테이블 위·아래에만 좌석 원 배치 (위쪽 절반, 아래쪽 절반) */
function getSeatPositions(w: number, h: number, n: number): { x: number; y: number }[] {
  if (n <= 0) return []
  const r = SEAT_R
  const off = SEAT_OFFSET
  const nTop = Math.ceil(n / 2)
  const nBottom = n - nTop
  const positions: { x: number; y: number }[] = []
  // 위쪽 행
  for (let i = 0; i < nTop; i++) {
    const t = nTop === 1 ? 0.5 : i / (nTop - 1)
    positions.push({ x: w * t, y: -r - off })
  }
  // 아래쪽 행
  for (let i = 0; i < nBottom; i++) {
    const t = nBottom === 1 ? 0.5 : i / (nBottom - 1)
    positions.push({ x: w * t, y: h + r + off })
  }
  return positions
}

function generateId() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function PosTableLayoutContent() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()

  const [storeCode, setStoreCode] = React.useState("")
  const [layout, setLayout] = React.useState<PosTableItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [selectBox, setSelectBox] = React.useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [editingNameId, setEditingNameId] = React.useState<string | null>(null)
  const [showGrid, setShowGrid] = React.useState(true)
  const [gridCols, setGridCols] = React.useState(6)
  const [gridRows, setGridRows] = React.useState(5)
  const [tableNameInput, setTableNameInput] = React.useState("")
  const [tableSeatsInput, setTableSeatsInput] = React.useState<number>(0)
  const dragStartRef = React.useRef<{ id: string; startX: number; startY: number; mouseX: number; mouseY: number; scaleX: number; scaleY: number } | null>(null)
  const selectStartRef = React.useRef<{ startX: number; startY: number; additive: boolean } | null>(null)
  const skipNextFloorClickRef = React.useRef(false)
  const floorRef = React.useRef<HTMLDivElement | null>(null)

  const canSearchAll = isOfficeRole(auth?.role || "")

  React.useEffect(() => {
    if (canSearchAll && stores.length && !storeCode) {
      setStoreCode(stores[0])
    } else if (!canSearchAll && auth?.store) {
      setStoreCode(auth.store)
    }
  }, [canSearchAll, stores, auth?.store, storeCode])

  const loadLayout = React.useCallback(() => {
    if (!storeCode) return
    setLoading(true)
    getPosTableLayout({ storeCode })
      .then(({ layout: l }) => setLayout(l || []))
      .catch(() => setLayout([]))
      .finally(() => setLoading(false))
  }, [storeCode])

  React.useEffect(() => {
    loadLayout()
  }, [loadLayout])

  React.useEffect(() => {
    if (selectedId) {
      const item = layout.find((x) => x.id === selectedId)
      setTableNameInput(item?.name ?? "")
      setTableSeatsInput(item?.seats ?? 0)
    } else {
      setTableNameInput("")
      setTableSeatsInput(0)
    }
  }, [selectedId, layout])

  React.useEffect(() => {
    const idSet = new Set(layout.map((x) => x.id))
    setSelectedIds((prev) => prev.filter((id) => idSet.has(id)))
    if (selectedId && !idSet.has(selectedId)) {
      setSelectedId(null)
    }
  }, [layout, selectedId])

  const addTable = (preset: (typeof SHAPE_PRESETS)[0]) => {
    const maxY = layout.length ? Math.max(...layout.map((t) => t.y + t.h)) : 0
    const y = maxY + 20 > FLOOR_H - preset.h ? 20 : maxY + 20
    const x = (layout.length % 3) * 90 + 24
    const newTable: PosTableItem = {
      id: generateId(),
      name: `${layout.length + 1}번`,
      x,
      y,
      w: preset.w,
      h: preset.h,
      shape: preset.shape,
      seats: preset.defaultSeats,
      rotation: 0,
    }
    setLayout((prev) => [...prev, newTable])
    setSelectedId(newTable.id)
    setSelectedIds([newTable.id])
    setEditingNameId(newTable.id)
  }

  const handleRemoveTable = (id: string) => {
    if (!confirm(t("posTableDeleteConfirm") || "이 테이블을 삭제하시겠습니까?")) return
    setLayout((prev) => prev.filter((t) => t.id !== id))
    if (selectedId === id) setSelectedId(null)
    setSelectedIds((prev) => prev.filter((v) => v !== id))
  }

  const snapToGrid = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE

  const handleMoveTable = (id: string, dx: number, dy: number) => {
    setLayout((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        let nx = snapToGrid(t.x + dx)
        let ny = snapToGrid(t.y + dy)
        nx = Math.max(0, Math.min(FLOOR_W - t.w, nx))
        ny = Math.max(0, Math.min(FLOOR_H - t.h, ny))
        return { ...t, x: nx, y: ny }
      })
    )
  }

  const handleUpdateName = (id: string, name: string) => {
    setLayout((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: name.trim() || t.name } : t))
    )
    setEditingNameId(null)
  }

  const handleUpdateSeats = (id: string, seats: number) => {
    setLayout((prev) =>
      prev.map((t) => (t.id === id ? { ...t, seats } : t))
    )
  }

  const handleRotateTable = (id: string) => {
    setLayout((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        const current = t.rotation ?? 0
        const next = (current + 90) % 360
        return { ...t, rotation: next }
      })
    )
  }

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest("input, button")) return
    const multiSelect = e.shiftKey || e.ctrlKey || e.metaKey
    if (multiSelect) {
      e.preventDefault()
      setSelectedIds((prev) => {
        const has = prev.includes(id)
        const next = has ? prev.filter((v) => v !== id) : [...prev, id]
        if (!has) setSelectedId(id)
        else if (selectedId === id) setSelectedId(next[0] ?? null)
        return next
      })
      setDraggingId(null)
      dragStartRef.current = null
      return
    }
    e.preventDefault()
    const item = layout.find((x) => x.id === id)
    if (!item) return
    const rect = floorRef.current?.getBoundingClientRect()
    const scaleX = rect && rect.width > 0 ? FLOOR_W / rect.width : 1
    const scaleY = rect && rect.height > 0 ? FLOOR_H / rect.height : 1
    setSelectedId(id)
    setSelectedIds([id])
    setDraggingId(id)
    dragStartRef.current = {
      id,
      startX: item.x,
      startY: item.y,
      mouseX: e.clientX,
      mouseY: e.clientY,
      scaleX,
      scaleY,
    }
  }

  const handleFloorMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-table-id]")) return
    if ((e.target as HTMLElement).closest("button, input")) return
    if (!floorRef.current) return
    const rect = floorRef.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const scaleX = FLOOR_W / rect.width
    const scaleY = FLOOR_H / rect.height
    const x = Math.max(0, Math.min(FLOOR_W, (e.clientX - rect.left) * scaleX))
    const y = Math.max(0, Math.min(FLOOR_H, (e.clientY - rect.top) * scaleY))
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    selectStartRef.current = { startX: x, startY: y, additive }
    setSelectBox({ x1: x, y1: y, x2: x, y2: y })
    if (!additive) {
      setSelectedId(null)
      setSelectedIds([])
    }
    skipNextFloorClickRef.current = true
  }

  const handleFloorClick = (e: React.MouseEvent) => {
    if (skipNextFloorClickRef.current) {
      skipNextFloorClickRef.current = false
      return
    }
    if ((e.target as HTMLElement).id === "pos-floor") {
      setSelectedId(null)
      setSelectedIds([])
    }
  }

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragStartRef.current
      if (!d) return
      const dx = (e.clientX - d.mouseX) * d.scaleX
      const dy = (e.clientY - d.mouseY) * d.scaleY
      setLayout((prev) =>
        prev.map((t) => {
          if (t.id !== d.id) return t
          let nx = snapToGrid(d.startX + dx)
          let ny = snapToGrid(d.startY + dy)
          nx = Math.max(0, Math.min(FLOOR_W - t.w, nx))
          ny = Math.max(0, Math.min(FLOOR_H - t.h, ny))
          return { ...t, x: nx, y: ny }
        })
      )
    }
    const onUp = () => {
      setDraggingId(null)
      dragStartRef.current = null
    }
    if (draggingId) {
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    }
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [draggingId])

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const s = selectStartRef.current
      if (!s || !floorRef.current) return
      const rect = floorRef.current.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const scaleX = FLOOR_W / rect.width
      const scaleY = FLOOR_H / rect.height
      const x = Math.max(0, Math.min(FLOOR_W, (e.clientX - rect.left) * scaleX))
      const y = Math.max(0, Math.min(FLOOR_H, (e.clientY - rect.top) * scaleY))
      setSelectBox({ x1: s.startX, y1: s.startY, x2: x, y2: y })
    }
    const onUp = () => {
      const s = selectStartRef.current
      const box = selectBox
      if (!s || !box) {
        selectStartRef.current = null
        setSelectBox(null)
        return
      }
      const minX = Math.min(box.x1, box.x2)
      const maxX = Math.max(box.x1, box.x2)
      const minY = Math.min(box.y1, box.y2)
      const maxY = Math.max(box.y1, box.y2)
      const w = maxX - minX
      const h = maxY - minY
      const isClickLike = w < 3 && h < 3
      if (!isClickLike) {
        const hitIds = layout
          .filter((t) => {
            const tx1 = t.x
            const ty1 = t.y
            const tx2 = t.x + t.w
            const ty2 = t.y + t.h
            return tx1 < maxX && tx2 > minX && ty1 < maxY && ty2 > minY
          })
          .map((t) => t.id)
        setSelectedIds((prev) => {
          const next = s.additive ? Array.from(new Set([...prev, ...hitIds])) : hitIds
          setSelectedId(next[0] ?? null)
          return next
        })
      }
      selectStartRef.current = null
      setSelectBox(null)
      setTimeout(() => {
        skipNextFloorClickRef.current = false
      }, 0)
    }
    if (selectStartRef.current) {
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    }
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [layout, selectBox])

  const handleReset = () => {
    if (!confirm(t("posTableResetConfirm") || "모든 테이블을 삭제하고 초기화하시겠습니까?")) return
    setLayout([])
    setSelectedId(null)
    setSelectedIds([])
  }

  const handleAutoName = () => {
    setLayout((prev) =>
      prev
        .slice()
        .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x))
        .map((t, i) => ({ ...t, name: `${i + 1}번` }))
        .sort((a, b) => {
          const ia = prev.findIndex((p) => p.id === a.id)
          const ib = prev.findIndex((p) => p.id === b.id)
          return ia - ib
        })
    )
  }

  const alignTables = (align: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    const ids = selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : layout.map((t) => t.id)
    if (ids.length === 0) return
    const items = layout.filter((t) => ids.includes(t.id))
    if (items.length === 0) return

    const minX = Math.min(...items.map((t) => t.x))
    const maxX = Math.max(...items.map((t) => t.x + t.w))
    const minY = Math.min(...items.map((t) => t.y))
    const maxY = Math.max(...items.map((t) => t.y + t.h))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setLayout((prev) =>
      prev.map((t) => {
        if (!ids.includes(t.id)) return t
        const nx =
          align === "left"
            ? snapToGrid(minX)
            : align === "right"
              ? snapToGrid(maxX - t.w)
              : align === "center"
                ? snapToGrid(cx - t.w / 2)
                : t.x
        const ny =
          align === "top"
            ? snapToGrid(minY)
            : align === "bottom"
              ? snapToGrid(maxY - t.h)
              : align === "middle"
                ? snapToGrid(cy - t.h / 2)
                : t.y
        return { ...t, x: Math.max(0, Math.min(FLOOR_W - t.w, nx)), y: Math.max(0, Math.min(FLOOR_H - t.h, ny)) }
      })
    )
  }

  const distributeTablesBoth = () => {
    const ids = selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : []
    if (ids.length < 3) return
    const items = layout.filter((t) => ids.includes(t.id))
    if (items.length < 3) return

    const byX = [...items].sort((a, b) => a.x - b.x)
    const byY = [...items].sort((a, b) => a.y - b.y)

    const xPatch: Record<string, number> = {}
    const yPatch: Record<string, number> = {}

    const firstX = byX[0]
    const lastX = byX[byX.length - 1]
    const spanX = (lastX.x + lastX.w) - firstX.x
    const innerW = byX.slice(1, -1).reduce((s, t) => s + t.w, 0)
    const gapX = (spanX - firstX.w - lastX.w - innerW) / (byX.length - 1)
    let cursorX = firstX.x + firstX.w + gapX
    for (let i = 1; i < byX.length - 1; i++) {
      xPatch[byX[i].id] = Math.max(0, Math.min(FLOOR_W - byX[i].w, snapToGrid(cursorX)))
      cursorX += byX[i].w + gapX
    }

    const firstY = byY[0]
    const lastY = byY[byY.length - 1]
    const spanY = (lastY.y + lastY.h) - firstY.y
    const innerH = byY.slice(1, -1).reduce((s, t) => s + t.h, 0)
    const gapY = (spanY - firstY.h - lastY.h - innerH) / (byY.length - 1)
    let cursorY = firstY.y + firstY.h + gapY
    for (let i = 1; i < byY.length - 1; i++) {
      yPatch[byY[i].id] = Math.max(0, Math.min(FLOOR_H - byY[i].h, snapToGrid(cursorY)))
      cursorY += byY[i].h + gapY
    }

    setLayout((prev) =>
      prev.map((t) => ({
        ...t,
        ...(xPatch[t.id] != null ? { x: xPatch[t.id] } : {}),
        ...(yPatch[t.id] != null ? { y: yPatch[t.id] } : {}),
      }))
    )
  }

  const distributeTables = (dir: "horizontal" | "vertical") => {
    const ids = selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : []
    if (ids.length < 3) return
    const items = layout.filter((t) => ids.includes(t.id))
    if (items.length < 3) return

    if (dir === "horizontal") {
      const sorted = [...items].sort((a, b) => a.x - b.x)
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const span = (last.x + last.w) - first.x
      const innerWidths = sorted.slice(1, -1).reduce((s, t) => s + t.w, 0)
      const gap = (span - first.w - last.w - innerWidths) / (sorted.length - 1)
      let cursor = first.x + first.w + gap
      const patch: Record<string, number> = {}
      for (let i = 1; i < sorted.length - 1; i++) {
        patch[sorted[i].id] = Math.max(0, Math.min(FLOOR_W - sorted[i].w, snapToGrid(cursor)))
        cursor += sorted[i].w + gap
      }
      setLayout((prev) => prev.map((t) => (patch[t.id] != null ? { ...t, x: patch[t.id] } : t)))
      return
    }

    const sorted = [...items].sort((a, b) => a.y - b.y)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const span = (last.y + last.h) - first.y
    const innerHeights = sorted.slice(1, -1).reduce((s, t) => s + t.h, 0)
    const gap = (span - first.h - last.h - innerHeights) / (sorted.length - 1)
    let cursor = first.y + first.h + gap
    const patch: Record<string, number> = {}
    for (let i = 1; i < sorted.length - 1; i++) {
      patch[sorted[i].id] = Math.max(0, Math.min(FLOOR_H - sorted[i].h, snapToGrid(cursor)))
      cursor += sorted[i].h + gap
    }
    setLayout((prev) => prev.map((t) => (patch[t.id] != null ? { ...t, y: patch[t.id] } : t)))
  }

  const handleSave = async () => {
    if (!storeCode) {
      alert(t("store") || "매장을 선택하세요.")
      return
    }
    setSaving(true)
    try {
      const res = await savePosTableLayout({ storeCode, layout })
      if (res.success) {
        alert(t("msg_saved") || "저장되었습니다.")
        loadLayout()
      } else {
        alert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = selectedIds.length > 0 ? selectedIds.length : selectedId ? 1 : 0

  return (
    <div className="space-y-4">
      {/* 상단: 매장, 새로고침, 저장 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={storeCode} onValueChange={setStoreCode}>
            <SelectTrigger className="h-10 w-40">
              <SelectValue placeholder={t("store") || "매장"} />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadLayout} disabled={loading}>
            {t("posRefresh") || "새로고침"}
          </Button>
        </div>
        <Button size="sm" className="h-10 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={handleSave} disabled={saving || !storeCode}>
          <Save className="h-4 w-4" />
          {saving ? "..." : t("itemsBtnSave") || "저장"}
        </Button>
      </div>

      {loading && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {t("loading")}
        </div>
      )}

      {/* 그리드 설정 & 테이블 생성 */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600">{t("posTableGrid") || "가로"}</span>
          <Select value={String(gridCols)} onValueChange={(v) => setGridCols(Number(v))}>
            <SelectTrigger className="h-8 w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[4, 5, 6, 8, 10, 12].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600">{t("posTableGridVert") || "세로"}</span>
          <Select value={String(gridRows)} onValueChange={(v) => setGridRows(Number(v))}>
            <SelectTrigger className="h-8 w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[4, 5, 6, 8, 10].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="h-8" onClick={() => setShowGrid((s) => !s)}>
          <LayoutGrid className={cn("h-4 w-4", !showGrid && "opacity-50")} />
        </Button>
        <div className="h-6 w-px bg-slate-200" />
        <span className="text-xs font-medium text-slate-600">{t("posTableCreate") || "테이블 생성"}</span>
        {SHAPE_PRESETS.map((preset) => (
          <Button key={preset.shape} variant="outline" size="sm" className="h-8 gap-1" onClick={() => addTable(preset)}>
            {preset.shape === "square" ? (
              <Square className="h-4 w-4" />
            ) : preset.shape === "rect-wide" ? (
              <RectangleHorizontal className="h-4 w-4" />
            ) : (
              <RectangleVertical className="h-4 w-4" />
            )}
            {preset.label}
          </Button>
        ))}
        <div className="h-6 w-px bg-slate-200" />
        <Button variant="outline" size="sm" className="h-8 text-red-600 hover:bg-red-50" onClick={handleReset}>
          <RotateCcw className="h-4 w-4" />
          {t("posTableReset") || "초기화"}
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleAutoName}>
          <Copy className="h-4 w-4" />
          ABC
        </Button>
      </div>

      {/* 정렬 & 테이블명 & 좌석 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
        <span className="text-xs font-medium text-slate-600">{t("posTableName") || "테이블명"}</span>
        <Input
          className="h-8 w-28"
          value={tableNameInput}
          onChange={(e) => setTableNameInput(e.target.value)}
          onBlur={() => selectedId && handleUpdateName(selectedId, tableNameInput)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && selectedId) {
              handleUpdateName(selectedId, tableNameInput)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          placeholder={t("posTableCustomPh") || "테이블명"}
          disabled={!selectedId}
        />
        <span className="text-xs font-medium text-slate-600">{t("posTableSeats") || "좌석"}</span>
        <Select
          value={tableSeatsInput ? String(tableSeatsInput) : "0"}
          onValueChange={(v) => {
            const n = Number(v)
            setTableSeatsInput(n)
            selectedId && handleUpdateSeats(selectedId, n)
          }}
          disabled={!selectedId}
        >
          <SelectTrigger className="h-8 w-20">
            <SelectValue placeholder="0" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">{t("posTableSeatsNone") || "-"}</SelectItem>
            {SEAT_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}{t("posTableSeatsUnit") || "인"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="h-6 w-px bg-slate-200" />
        <span className="text-[11px] text-slate-500">
          Shift/Ctrl+Click 또는 드래그: 다중 선택
        </span>
        <div className="h-6 w-px bg-slate-200" />
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => alignTables("left")} disabled={layout.length === 0} title={t("posAlignLeft") || "왼쪽 정렬"}>
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => alignTables("center")} disabled={layout.length === 0} title={t("posAlignCenter") || "가운데 정렬"}>
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => alignTables("right")} disabled={layout.length === 0} title={t("posAlignRight") || "오른쪽 정렬"}>
            <AlignRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => distributeTables("horizontal")} disabled={selectedCount < 3} title="가로 균등 간격">
            <AlignStartVertical className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => distributeTables("vertical")} disabled={selectedCount < 3} title="세로 균등 간격">
            <AlignCenterVertical className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={distributeTablesBoth} disabled={selectedCount < 3} title="가로/세로 균등 간격">
            <AlignEndVertical className="h-4 w-4" />
          </Button>
        </div>
        <div className="h-6 w-px bg-slate-200" />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          onClick={() => selectedId && handleRotateTable(selectedId)}
          disabled={!selectedId}
          title={t("posTableRotate") || "테이블 90° 회전"}
        >
          <RotateCw className="h-4 w-4" />
          {t("posTableRotate") || "회전"}
        </Button>
      </div>

      {/* 바닥 캔버스 */}
      <div
        id="pos-floor"
        ref={floorRef}
        className="relative rounded-xl border-2 border-slate-200 bg-slate-100 overflow-visible cursor-crosshair"
        style={{ width: '100%', maxWidth: `${FLOOR_W}px`, aspectRatio: `${FLOOR_W} / ${FLOOR_H}` }}
        onMouseDown={handleFloorMouseDown}
        onClick={handleFloorClick}
      >
        {showGrid && (
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(to right, #94a3b8 1px, transparent 1px),
                linear-gradient(to bottom, #94a3b8 1px, transparent 1px)
              `,
              backgroundSize: `${100 / gridCols}% ${100 / gridRows}%`,
            }}
          />
        )}
        {layout.map((item) => {
          const isSquare = item.shape === "square"
          const hasSeats = (item.seats ?? 0) > 0
          const seatPositions = getSeatPositions(item.w, item.h, item.seats ?? 0)
          return (
          <div
            key={item.id}
            data-table-id={item.id}
            className={cn(
              "absolute flex flex-col items-center justify-center cursor-move select-none transition-all overflow-visible",
              "rounded-xl shadow-sm",
              "border-2 border-dashed",
              isSquare
                ? "bg-stone-500/90 border-stone-600 text-white"
                : "bg-[#d4a574] border-amber-800/40 text-stone-800",
              "hover:shadow-md",
              selectedId === item.id && "ring-2 ring-emerald-500 ring-offset-2 border-solid border-amber-700/60 z-10",
              selectedIds.includes(item.id) && "ring-2 ring-sky-500 ring-offset-2 border-solid border-sky-700/80 z-10 bg-sky-200/35",
              draggingId === item.id && "z-20 shadow-lg scale-[1.02]"
            )}
            style={{
              left: `${(item.x / FLOOR_W) * 100}%`,
              top: `${(item.y / FLOOR_H) * 100}%`,
              width: `${(item.w / FLOOR_W) * 100}%`,
              height: `${(item.h / FLOOR_H) * 100}%`,
              transform: `rotate(${item.rotation ?? 0}deg)`,
              transformOrigin: "center center",
              boxShadow: !isSquare ? "inset 0 1px 2px rgba(255,255,255,0.3)" : undefined,
            }}
            onMouseDown={(e) => handleMouseDown(e, item.id)}
          >
            {hasSeats && seatPositions.map((pos, i) => (
              <div
                key={i}
                className={cn(
                  "absolute rounded-full pointer-events-none shadow-sm",
                  isSquare
                    ? "bg-stone-400/90 border border-stone-500"
                    : "bg-[#c9a86c] border border-amber-800/50"
                )}
                style={{
                  left: `calc(${(pos.x / Math.max(item.w, 1)) * 100}% - ${SEAT_R}px)`,
                  top: `calc(${(pos.y / Math.max(item.h, 1)) * 100}% - ${SEAT_R}px)`,
                  width: SEAT_R * 2,
                  height: SEAT_R * 2,
                }}
              />
            ))}
            {editingNameId === item.id ? (
              <Input
                defaultValue={item.name}
                className="h-6 w-14 px-1 text-center text-xs relative z-10"
                autoFocus
                onBlur={(e) => handleUpdateName(item.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUpdateName(item.id, (e.target as HTMLInputElement).value)
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="text-xs font-bold relative z-10" onDoubleClick={() => setEditingNameId(item.id)}>
                {item.name}
              </span>
            )}
            <button
              type="button"
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-90 hover:opacity-100 shadow z-20"
              onClick={(e) => {
                e.stopPropagation()
                handleRemoveTable(item.id)
              }}
              title={t("itemsBtnDelete") || "삭제"}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )})}
        {selectBox && (
          <div
            className="absolute border border-emerald-500 bg-emerald-400/20 pointer-events-none z-30"
            style={{
              left: `${(Math.min(selectBox.x1, selectBox.x2) / FLOOR_W) * 100}%`,
              top: `${(Math.min(selectBox.y1, selectBox.y2) / FLOOR_H) * 100}%`,
              width: `${(Math.abs(selectBox.x2 - selectBox.x1) / FLOOR_W) * 100}%`,
              height: `${(Math.abs(selectBox.y2 - selectBox.y1) / FLOOR_H) * 100}%`,
            }}
          />
        )}
        {layout.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
            {t("posTableEmpty") || "테이블 추가 버튼으로 테이블을 배치하세요."}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        {t("posTableDragHint") || "테이블을 드래그하여 이동, 더블클릭으로 이름 수정. 추가/삭제 후 저장 버튼을 눌러 반영해 주세요."}
      </p>
    </div>
  )
}
