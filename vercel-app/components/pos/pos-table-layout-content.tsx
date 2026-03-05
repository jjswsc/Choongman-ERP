"use client"

import * as React from "react"
import {
  LayoutGrid,
  Plus,
  Save,
  Trash2,
  RotateCcw,
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

/** 테이블 둘레에 좌석 원 배치 - 4인은 상/하/좌/우, 그 외는 균등 분배 */
function getSeatPositions(w: number, h: number, n: number): { x: number; y: number }[] {
  if (n <= 0) return []
  const r = SEAT_R
  const off = SEAT_OFFSET
  if (n === 4) {
    return [
      { x: w / 2, y: -r - off },
      { x: w + r + off, y: h / 2 },
      { x: w / 2, y: h + r + off },
      { x: -r - off, y: h / 2 },
    ]
  }
  const positions: { x: number; y: number }[] = []
  const perimeter = 2 * (w + h)
  const step = perimeter / n
  let traveled = step / 2
  for (let i = 0; i < n; i++) {
    if (traveled < w) {
      positions.push({ x: traveled, y: -r - off })
    } else if (traveled < w + h) {
      positions.push({ x: w + r + off, y: traveled - w })
    } else if (traveled < 2 * w + h) {
      positions.push({ x: 2 * w + h - traveled, y: h + r + off })
    } else {
      positions.push({ x: -r - off, y: 2 * (w + h) - traveled })
    }
    traveled += step
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
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [editingNameId, setEditingNameId] = React.useState<string | null>(null)
  const [showGrid, setShowGrid] = React.useState(true)
  const [gridCols, setGridCols] = React.useState(6)
  const [gridRows, setGridRows] = React.useState(5)
  const [tableNameInput, setTableNameInput] = React.useState("")
  const [tableSeatsInput, setTableSeatsInput] = React.useState<number>(0)
  const dragStartRef = React.useRef<{ id: string; startX: number; startY: number; mouseX: number; mouseY: number } | null>(null)

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
    }
    setLayout((prev) => [...prev, newTable])
    setSelectedId(newTable.id)
    setEditingNameId(newTable.id)
  }

  const handleRemoveTable = (id: string) => {
    if (!confirm(t("posTableDeleteConfirm") || "이 테이블을 삭제하시겠습니까?")) return
    setLayout((prev) => prev.filter((t) => t.id !== id))
    if (selectedId === id) setSelectedId(null)
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

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest("input, button")) return
    e.preventDefault()
    const item = layout.find((x) => x.id === id)
    if (!item) return
    setSelectedId(id)
    setDraggingId(id)
    dragStartRef.current = {
      id,
      startX: item.x,
      startY: item.y,
      mouseX: e.clientX,
      mouseY: e.clientY,
    }
  }

  const handleFloorClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).id === "pos-floor") setSelectedId(null)
  }

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragStartRef.current
      if (!d) return
      const dx = e.clientX - d.mouseX
      const dy = e.clientY - d.mouseY
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

  const handleReset = () => {
    if (!confirm(t("posTableResetConfirm") || "모든 테이블을 삭제하고 초기화하시겠습니까?")) return
    setLayout([])
    setSelectedId(null)
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
    const ids = selectedId ? [selectedId] : layout.map((t) => t.id)
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
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => alignTables("top")} disabled={layout.length === 0} title={t("posAlignTop") || "위 정렬"}>
            <AlignStartVertical className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => alignTables("middle")} disabled={layout.length === 0} title={t("posAlignMiddle") || "세로 중앙"}>
            <AlignCenterVertical className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => alignTables("bottom")} disabled={layout.length === 0} title={t("posAlignBottom") || "아래 정렬"}>
            <AlignEndVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 바닥 캔버스 */}
      <div
        id="pos-floor"
        className="relative rounded-xl border-2 border-slate-200 bg-slate-100 overflow-visible cursor-crosshair"
        style={{ width: FLOOR_W, height: FLOOR_H }}
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
              backgroundSize: `${FLOOR_W / gridCols}px ${FLOOR_H / gridRows}px`,
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
            className={cn(
              "absolute flex flex-col items-center justify-center cursor-move select-none transition-all overflow-visible",
              "rounded-xl shadow-sm",
              "border-2 border-dashed",
              isSquare
                ? "bg-stone-500/90 border-stone-600 text-white"
                : "bg-[#d4a574] border-amber-800/40 text-stone-800",
              "hover:shadow-md",
              selectedId === item.id && "ring-2 ring-emerald-500 ring-offset-2 border-solid border-amber-700/60 z-10",
              draggingId === item.id && "z-20 shadow-lg scale-[1.02]"
            )}
            style={{
              left: item.x,
              top: item.y,
              width: item.w,
              height: item.h,
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
                  left: pos.x - SEAT_R,
                  top: pos.y - SEAT_R,
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
