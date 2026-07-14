"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import {
  LayoutGrid,
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
  ClipboardCopy,
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
import { localizeApiMessage } from "@/lib/translate-api-message"
import {
  getPosTableLayout,
  savePosTableLayout,
  useStoreList,
  type PosFloorLabels,
  type PosTableItem,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { getPosTableAabb } from "@/lib/pos-table-layout-aabb"
import {
  normalizePosFloorLabels,
  resolvePosFloorDisplayLabel,
} from "@/lib/pos-table-layout-payload"
import { PosScreenConfigActionBar, PosScreenConfigEmeraldSaveButton } from "@/components/pos/pos-screen-config-action-bar"

const FLOOR_W = 720
const FLOOR_H = 480
const GRID_SIZE = 24
/** POS 플로어 화면에서 테이블명·상태·시각 등을 담기 위한 최소 크기(픽셀, 그리드 스냅) */
const MIN_TABLE_W = GRID_SIZE * 5
const MIN_TABLE_H = GRID_SIZE * 4
const FLOOR_PREF_KEY = "pos-table-layout-floor:"

type TableShape = "rect" | "rect-wide" | "square"

const SHAPE_PRESETS: { shape: TableShape; w: number; h: number; labelKey: string; defaultSeats: number }[] = [
  { shape: "rect", w: 120, h: 96, labelKey: "posTableShapeNormal", defaultSeats: 4 },
  { shape: "rect-wide", w: 144, h: 96, labelKey: "posTableShapeLong", defaultSeats: 6 },
  { shape: "square", w: 120, h: 120, labelKey: "posTableShapeSquare", defaultSeats: 2 },
]

const SEAT_OPTIONS = [2, 3, 4, 5, 6, 8, 10]

const SEAT_R = 6
const SEAT_INSET = 6

/** 테이블 위·아래에만 좌석 원 배치 (위쪽 절반, 아래쪽 절반) */
function getSeatPositions(w: number, h: number, n: number): { x: number; y: number }[] {
  if (n <= 0) return []
  const r = SEAT_R
  const inset = SEAT_INSET
  const nTop = Math.ceil(n / 2)
  const nBottom = n - nTop
  const minX = r + inset
  const maxX = Math.max(minX, w - r - inset)
  const positions: { x: number; y: number }[] = []
  // 위쪽 행
  for (let i = 0; i < nTop; i++) {
    const t = nTop === 1 ? 0.5 : i / (nTop - 1)
    positions.push({ x: minX + (maxX - minX) * t, y: r + inset })
  }
  // 아래쪽 행
  for (let i = 0; i < nBottom; i++) {
    const t = nBottom === 1 ? 0.5 : i / (nBottom - 1)
    positions.push({ x: minX + (maxX - minX) * t, y: h - r - inset })
  }
  return positions
}

function generateId() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function snapByGrid(v: number) {
  return Math.round(v / GRID_SIZE) * GRID_SIZE
}

function normalizeLayoutItem(item: PosTableItem): PosTableItem {
  const nextW = Math.max(MIN_TABLE_W, Math.min(FLOOR_W, snapByGrid(Number(item.w ?? MIN_TABLE_W) || MIN_TABLE_W)))
  const nextH = Math.max(MIN_TABLE_H, Math.min(FLOOR_H, snapByGrid(Number(item.h ?? MIN_TABLE_H) || MIN_TABLE_H)))
  const nextX = Math.max(0, Math.min(FLOOR_W - nextW, snapByGrid(Number(item.x ?? 0) || 0)))
  const nextY = Math.max(0, Math.min(FLOOR_H - nextH, snapByGrid(Number(item.y ?? 0) || 0)))
  return { ...item, w: nextW, h: nextH, x: nextX, y: nextY }
}

export function PosTableLayoutContent() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { posStores: stores } = useStoreList()

  const [storeCode, setStoreCode] = React.useState("")
  const [layout, setLayout] = React.useState<PosTableItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [resizingId, setResizingId] = React.useState<string | null>(null)
  const [selectBox, setSelectBox] = React.useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [editingNameId, setEditingNameId] = React.useState<string | null>(null)
  const [showGrid, setShowGrid] = React.useState(true)
  const [gridCols, setGridCols] = React.useState(6)
  const [gridRows, setGridRows] = React.useState(5)
  const [activeFloor, setActiveFloor] = React.useState<1 | 2 | 3>(1)
  const [floorLabels, setFloorLabels] = React.useState<PosFloorLabels>({})
  const [tableNameInput, setTableNameInput] = React.useState("")
  const [tableSeatsInput, setTableSeatsInput] = React.useState<number>(0)
  const [isFallbackLayout, setIsFallbackLayout] = React.useState(false)
  const [copyFromStoreCode, setCopyFromStoreCode] = React.useState("")
  const [copyLoading, setCopyLoading] = React.useState(false)
  const dragStartRef = React.useRef<{
    ids: string[]
    starts: Record<string, { x: number; y: number; w: number; h: number }>
    mouseX: number
    mouseY: number
    scaleX: number
    scaleY: number
  } | null>(null)
  const resizeStartRef = React.useRef<{
    id: string
    startW: number
    startH: number
    x: number
    y: number
    mouseX: number
    mouseY: number
    scaleX: number
    scaleY: number
  } | null>(null)
  const selectStartRef = React.useRef<{ startX: number; startY: number; additive: boolean } | null>(null)
  const skipNextFloorClickRef = React.useRef(false)
  const floorRef = React.useRef<HTMLDivElement | null>(null)

  const canSearchAll = isOfficeRole(auth?.role || "")
  const formatAutoTableName = React.useCallback(
    (floor: 1 | 2 | 3, number: number) => `${floor}F-${number}`,
    []
  )
  const floorLabelFallback = t("posFloorLabel") || "{n}F"
  const getFloorTabLabel = React.useCallback(
    (floor: 1 | 2 | 3) => resolvePosFloorDisplayLabel(floor, floorLabels, floorLabelFallback),
    [floorLabels, floorLabelFallback]
  )
  const currentFloorLayout = React.useMemo(
    () => layout.filter((t) => Math.min(3, Math.max(1, Number(t.floor ?? 1) || 1)) === activeFloor),
    [layout, activeFloor]
  )
  const currentFloorIdSet = React.useMemo(() => new Set(currentFloorLayout.map((t) => t.id)), [currentFloorLayout])

  React.useEffect(() => {
    if (canSearchAll && stores.length && !storeCode) {
      setStoreCode(stores[0])
    } else if (!canSearchAll && auth?.store) {
      setStoreCode(auth.store)
    }
  }, [canSearchAll, stores, auth?.store, storeCode])

  React.useEffect(() => {
    if (!storeCode) return
    try {
      const raw = window.localStorage.getItem(`${FLOOR_PREF_KEY}${storeCode}`)
      const floor = Math.min(3, Math.max(1, Number(raw ?? 1) || 1)) as 1 | 2 | 3
      setActiveFloor(floor)
    } catch {
      setActiveFloor(1)
    }
  }, [storeCode])

  React.useEffect(() => {
    if (!storeCode) return
    try {
      window.localStorage.setItem(`${FLOOR_PREF_KEY}${storeCode}`, String(activeFloor))
    } catch {
      // ignore localStorage errors
    }
  }, [storeCode, activeFloor])

  const loadLayout = React.useCallback(() => {
    if (!storeCode) return
    setLoading(true)
    setIsFallbackLayout(false)
    getPosTableLayout({ storeCode, forceNetwork: true })
      .then(({ layout: l, floorLabels: labels, isFallback }) => {
        setLayout((l || []).map(normalizeLayoutItem))
        setFloorLabels(normalizePosFloorLabels(labels ?? {}))
        setIsFallbackLayout(Boolean(isFallback))
      })
      .catch(() => {
        setLayout([])
        setFloorLabels({})
      })
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
      const floor = Math.min(3, Math.max(1, Number(item?.floor ?? 1) || 1)) as 1 | 2 | 3
      setActiveFloor(floor)
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

  React.useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => currentFloorIdSet.has(id)))
    if (selectedId && !currentFloorIdSet.has(selectedId)) {
      setSelectedId(null)
    }
  }, [activeFloor, currentFloorIdSet, selectedId])

  const addTable = (preset: (typeof SHAPE_PRESETS)[0]) => {
    const maxY = currentFloorLayout.length ? Math.max(...currentFloorLayout.map((t) => t.y + t.h)) : 0
    const y = maxY + 20 > FLOOR_H - preset.h ? 20 : maxY + 20
    const x = (currentFloorLayout.length % 3) * 90 + 24
    const newTable: PosTableItem = {
      id: generateId(),
      name: formatAutoTableName(activeFloor, currentFloorLayout.length + 1),
      x,
      y,
      w: preset.w,
      h: preset.h,
      floor: activeFloor,
      shape: preset.shape,
      seats: preset.defaultSeats,
      rotation: 0,
    }
    setLayout((prev) => [...prev, newTable])
    setSelectedId(newTable.id)
    setSelectedIds([newTable.id])
    setEditingNameId(newTable.id)
  }

  const handleRemoveTable = async (id: string) => {
    if (!(await appConfirm(t("posTableDeleteConfirm") || "이 테이블을 삭제하시겠습니까?"))) return
    setLayout((prev) => prev.filter((t) => t.id !== id))
    if (selectedId === id) setSelectedId(null)
    setSelectedIds((prev) => prev.filter((v) => v !== id))
  }

  const snapToGrid = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE

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
    const floorSelectedIds = selectedIds.filter((sid) => currentFloorIdSet.has(sid))
    const dragIds = floorSelectedIds.length > 1 && floorSelectedIds.includes(id) ? floorSelectedIds : [id]
    const dragItems = currentFloorLayout.filter((tbl) => dragIds.includes(tbl.id))
    if (dragItems.length === 0) return
    const rect = floorRef.current?.getBoundingClientRect()
    const scaleX = rect && rect.width > 0 ? FLOOR_W / rect.width : 1
    const scaleY = rect && rect.height > 0 ? FLOOR_H / rect.height : 1
    setSelectedId(id)
    if (!(floorSelectedIds.length > 1 && floorSelectedIds.includes(id))) {
      setSelectedIds([id])
    }
    setDraggingId(id)
    setResizingId(null)
    const starts = dragItems.reduce<Record<string, { x: number; y: number; w: number; h: number }>>((acc, t) => {
      acc[t.id] = { x: t.x, y: t.y, w: t.w, h: t.h }
      return acc
    }, {})
    dragStartRef.current = {
      ids: dragIds,
      starts,
      mouseX: e.clientX,
      mouseY: e.clientY,
      scaleX,
      scaleY,
    }
  }

  const handleResizeMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    const item = layout.find((x) => x.id === id)
    if (!item) return
    const rect = floorRef.current?.getBoundingClientRect()
    const scaleX = rect && rect.width > 0 ? FLOOR_W / rect.width : 1
    const scaleY = rect && rect.height > 0 ? FLOOR_H / rect.height : 1
    setSelectedId(id)
    setSelectedIds([id])
    setDraggingId(null)
    setResizingId(id)
    resizeStartRef.current = {
      id,
      startW: item.w,
      startH: item.h,
      x: item.x,
      y: item.y,
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
      if (d) {
        const rawDx = (e.clientX - d.mouseX) * d.scaleX
        const rawDy = (e.clientY - d.mouseY) * d.scaleY
        const starts = Object.values(d.starts)
        if (starts.length === 0) return
        const minDx = Math.max(...starts.map((s) => -s.x))
        const maxDx = Math.min(...starts.map((s) => FLOOR_W - (s.x + s.w)))
        const minDy = Math.max(...starts.map((s) => -s.y))
        const maxDy = Math.min(...starts.map((s) => FLOOR_H - (s.y + s.h)))
        const dx = Math.max(minDx, Math.min(maxDx, rawDx))
        const dy = Math.max(minDy, Math.min(maxDy, rawDy))
        setLayout((prev) =>
          prev.map((t) => {
            const start = d.starts[t.id]
            if (!start) return t
            const nx = Math.max(0, Math.min(FLOOR_W - t.w, snapToGrid(start.x + dx)))
            const ny = Math.max(0, Math.min(FLOOR_H - t.h, snapToGrid(start.y + dy)))
            return { ...t, x: nx, y: ny }
          })
        )
        return
      }

      const r = resizeStartRef.current
      if (!r) return
      const dx = (e.clientX - r.mouseX) * r.scaleX
      const dy = (e.clientY - r.mouseY) * r.scaleY
      const maxW = FLOOR_W - r.x
      const maxH = FLOOR_H - r.y
      const nextW = Math.max(MIN_TABLE_W, Math.min(maxW, snapToGrid(r.startW + dx)))
      const nextH = Math.max(MIN_TABLE_H, Math.min(maxH, snapToGrid(r.startH + dy)))
      setLayout((prev) => prev.map((t) => (t.id === r.id ? { ...t, w: nextW, h: nextH } : t)))
    }
    const onUp = () => {
      setDraggingId(null)
      setResizingId(null)
      dragStartRef.current = null
      resizeStartRef.current = null
    }
    if (draggingId || resizingId) {
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    }
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [draggingId, resizingId])

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
        const hitIds = currentFloorLayout
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
  }, [currentFloorLayout, selectBox])

  const handleReset = async () => {
    if (
      !(await appConfirm(
        (t("posTableResetConfirm") || "모든 테이블을 삭제하고 초기화하시겠습니까?") +
          ` (${getFloorTabLabel(activeFloor)})`
      ))
    )
      return
    setLayout((prev) => prev.filter((tbl) => Math.min(3, Math.max(1, Number(tbl.floor ?? 1) || 1)) !== activeFloor))
    setSelectedId(null)
    setSelectedIds([])
  }

  const handleCopyFromStore = async () => {
    const source = copyFromStoreCode.trim()
    if (!source || source === storeCode) {
      await appAlert(t("posTableLayoutCopyFromHint") || "다른 매장을 선택해 주세요.")
      return
    }
    if (!storeCode) {
      await appAlert(t("store") || "대상 매장을 선택해 주세요.")
      return
    }
    setCopyLoading(true)
    try {
      const { layout: sourceLayout, floorLabels: sourceLabels } = await getPosTableLayout({
        storeCode: source,
        forceNetwork: true,
      })
      const items = sourceLayout || []
      if (items.length === 0) {
        await appAlert(t("posTableLayoutCopyEmpty") || "선택한 매장에 저장된 테이블 배치가 없습니다.")
        return
      }
      const copied: PosTableItem[] = items.map((t) => ({
        ...t,
        id: generateId(),
      })).map(normalizeLayoutItem)
      setLayout(copied)
      setFloorLabels(normalizePosFloorLabels(sourceLabels ?? {}))
      setSelectedId(null)
      setSelectedIds([])
      await appAlert(t("posTableLayoutCopyDone") || "테이블 배치를 복사했습니다. 저장 버튼을 눌러 적용하세요.")
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setCopyLoading(false)
    }
  }

  const setActiveFloorLabel = (raw: string) => {
    const clipped = String(raw ?? '').slice(0, 24)
    setFloorLabels((prev) => {
      const out: PosFloorLabels = { ...prev }
      if (clipped.trim()) out[activeFloor] = clipped
      else delete out[activeFloor]
      return out
    })
  }

  const handleAutoName = () => {
    setLayout((prev) => {
      const floorItems = prev
        .filter((tbl) => Math.min(3, Math.max(1, Number(tbl.floor ?? 1) || 1)) === activeFloor)
        .slice()
        .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x))
      const patch = new Map(floorItems.map((tbl, i) => [tbl.id, formatAutoTableName(activeFloor, i + 1)]))
      return prev.map((tbl) => (patch.has(tbl.id) ? { ...tbl, name: patch.get(tbl.id) || tbl.name } : tbl))
    })
  }

  const handleNormalizeToNumericName = () => {
    setLayout((prev) => {
      const floorItems = prev
        .filter((tbl) => Math.min(3, Math.max(1, Number(tbl.floor ?? 1) || 1)) === activeFloor)
        .slice()
        .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x))
      const used = new Set<number>()
      const patch = new Map<string, string>()
      for (const tbl of floorItems) {
        const name = String(tbl.name ?? "").trim()
        const matches = Array.from(name.matchAll(/\d+/g))
        const lastNum = matches.length > 0 ? Number(matches[matches.length - 1]?.[0] ?? 0) : 0
        if (Number.isFinite(lastNum) && lastNum > 0 && !used.has(lastNum)) {
          used.add(lastNum)
          patch.set(tbl.id, `${activeFloor}F-${lastNum}`)
        }
      }
      let next = 1
      for (const tbl of floorItems) {
        if (patch.has(tbl.id)) continue
        while (used.has(next)) next += 1
        patch.set(tbl.id, `${activeFloor}F-${next}`)
        used.add(next)
        next += 1
      }
      return prev.map((tbl) => (patch.has(tbl.id) ? { ...tbl, name: patch.get(tbl.id) || tbl.name } : tbl))
    })
  }

  const alignTables = (align: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    const ids = selectedIds.length > 0
      ? selectedIds.filter((id) => currentFloorIdSet.has(id))
      : selectedId && currentFloorIdSet.has(selectedId)
        ? [selectedId]
        : currentFloorLayout.map((t) => t.id)
    if (ids.length === 0) return
    const items = currentFloorLayout.filter((t) => ids.includes(t.id))
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
    const ids = selectedIds.length > 0
      ? selectedIds.filter((id) => currentFloorIdSet.has(id))
      : selectedId && currentFloorIdSet.has(selectedId)
        ? [selectedId]
        : []
    if (ids.length < 3) return
    const items = currentFloorLayout.filter((t) => ids.includes(t.id))
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
    const ids = selectedIds.length > 0
      ? selectedIds.filter((id) => currentFloorIdSet.has(id))
      : selectedId && currentFloorIdSet.has(selectedId)
        ? [selectedId]
        : []
    if (ids.length < 3) return
    const items = currentFloorLayout.filter((t) => ids.includes(t.id))
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
      await appAlert(t("store") || "매장을 선택하세요.")
      return
    }
    setSaving(true)
    try {
      const normalizedLayout = layout.map(normalizeLayoutItem)
      setLayout(normalizedLayout)
      const labelsToSave = normalizePosFloorLabels(floorLabels)
      setFloorLabels(labelsToSave)
      const res = await savePosTableLayout({
        storeCode,
        layout: normalizedLayout,
        floorLabels: labelsToSave,
      })
      if (res.success) {
        await appAlert(t("msg_saved") || "저장되었습니다.")
        loadLayout()
      } else {
        await appAlert(localizeApiMessage(res.message, t, t("msg_save_fail_detail"), lang))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = selectedIds.filter((id) => currentFloorIdSet.has(id)).length > 0
    ? selectedIds.filter((id) => currentFloorIdSet.has(id)).length
    : selectedId && currentFloorIdSet.has(selectedId)
      ? 1
      : 0

  return (
    <div className="space-y-4">
      {/* 상단: 매장, 새로고침, 다른 매장 복사, 저장 (POS 설정 공통 툴바) */}
      <PosScreenConfigActionBar
        left={
          <>
            <Select value={storeCode} onValueChange={setStoreCode} disabled={!canSearchAll}>
              <SelectTrigger className="h-10 w-40">
                <SelectValue placeholder={t("store") || "매장"} />
              </SelectTrigger>
              <SelectContent>
                {(canSearchAll ? stores : auth?.store ? [auth.store] : stores).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={loadLayout} disabled={loading}>
              {t("posRefresh") || "새로고침"}
            </Button>
            {canSearchAll && stores.length >= 2 && (
              <>
                <Select value={copyFromStoreCode} onValueChange={setCopyFromStoreCode}>
                  <SelectTrigger className="h-10 w-40" title={t("posTableLayoutCopyFromHint") || ""}>
                    <SelectValue placeholder={t("posTableLayoutCopyFrom") || "다른 매장에서 복사"} />
                  </SelectTrigger>
                  <SelectContent>
                    {stores
                      .filter((s) => s !== storeCode)
                      .map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5"
                  onClick={handleCopyFromStore}
                  disabled={copyLoading || !copyFromStoreCode || copyFromStoreCode === storeCode}
                  title={t("posTableLayoutCopyFromHint") || ""}
                >
                  <ClipboardCopy className="h-4 w-4" />
                  {copyLoading ? "…" : t("posTableLayoutCopyBtn")}
                </Button>
              </>
            )}
          </>
        }
        right={
          <PosScreenConfigEmeraldSaveButton onClick={handleSave} disabled={saving || !storeCode}>
            <Save className="h-4 w-4" />
            {saving ? "..." : t("itemsBtnSave") || "저장"}
          </PosScreenConfigEmeraldSaveButton>
        }
      />

      {loading && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {t("loading")}
        </div>
      )}

      {isFallbackLayout && !loading && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t("posTableLayoutRestoreHint") || "DB에 저장된 배치가 없어 기본 레이아웃을 표시합니다. 수정 후 저장 버튼을 누르면 복원됩니다."}
        </div>
      )}

      {/* 그리드 설정 & 테이블 생성 */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
            {([1, 2, 3] as const).map((floor) => (
              <Button
                key={floor}
                type="button"
                size="sm"
                variant={activeFloor === floor ? "default" : "ghost"}
                className="h-7 max-w-[7.5rem] truncate px-2 text-xs"
                title={getFloorTabLabel(floor)}
                onClick={() => setActiveFloor(floor)}
              >
                {getFloorTabLabel(floor)}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="whitespace-nowrap text-xs font-medium text-slate-600">
              {t("posTableZoneName") || "구역명"}
            </span>
            <Input
              className="h-8 w-36 text-sm"
              value={floorLabels[activeFloor] ?? ""}
              placeholder={
                (t("posFloorLabel") || "{n}F").replaceAll("{n}", String(activeFloor))
              }
              onChange={(e) => setActiveFloorLabel(e.target.value)}
              maxLength={24}
            />
          </div>
          <span className="text-[11px] text-slate-500">
            {t("posTableZoneNameHint") || "층·방·테라스 등 매장에 맞게 이름을 바꿀 수 있습니다."}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600">{t("posTableGrid") || "가로"}</span>
          <Select value={String(gridCols)} onValueChange={(v) => setGridCols(Number(v))}>
            <SelectTrigger className="h-8 w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[4, 5, 6, 8, 10, 12, 15, 18, 20, 24, 30].map((n) => (
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
              {[4, 5, 6, 8, 10, 12, 14, 16, 20].map((n) => (
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
            {t(preset.labelKey)}
          </Button>
        ))}
        <div className="h-6 w-px bg-slate-200" />
        <Button variant="outline" size="sm" className="h-8 text-red-600 hover:bg-red-50" onClick={handleReset}>
          <RotateCcw className="h-4 w-4" />
          {t("posTableReset") || "초기화"}
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleAutoName}>
          <Copy className="h-4 w-4" />
          {t("posTableAutoNameAbc")}
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleNormalizeToNumericName}>
          <Copy className="h-4 w-4" />
          {t("posTableAutoNameNumber") || "번호 이름 정리(번 제거)"}
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
            if (selectedId) handleUpdateSeats(selectedId, n)
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
        <span className="text-[11px] text-slate-500">{t("posTableMultiSelectHint")}</span>
        <div className="h-6 w-px bg-slate-200" />
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => alignTables("left")} disabled={currentFloorLayout.length === 0} title={t("posAlignLeft") || "왼쪽 정렬"}>
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => alignTables("center")} disabled={currentFloorLayout.length === 0} title={t("posAlignCenter") || "가운데 정렬"}>
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => alignTables("right")} disabled={currentFloorLayout.length === 0} title={t("posAlignRight") || "오른쪽 정렬"}>
            <AlignRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => distributeTables("horizontal")}
            disabled={selectedCount < 3}
            title={t("posTableDistributeHorizontal")}
          >
            <AlignStartVertical className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => distributeTables("vertical")}
            disabled={selectedCount < 3}
            title={t("posTableDistributeVertical")}
          >
            <AlignCenterVertical className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={distributeTablesBoth}
            disabled={selectedCount < 3}
            title={t("posTableDistributeBoth")}
          >
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
        {currentFloorLayout.map((item) => {
          const isSquare = item.shape === "square"
          const hasSeats = (item.seats ?? 0) > 0
          const seatPositions = getSeatPositions(item.w, item.h, item.seats ?? 0)
          const aabb = getPosTableAabb(
            item.x,
            item.y,
            item.w,
            item.h,
            item.rotation ?? 0
          )
          const rot = item.rotation ?? 0
          const surfWofAabb = item.w / aabb.w
          const surfHofAabb = item.h / aabb.h
          return (
          <div
            key={item.id}
            data-table-id={item.id}
            className={cn(
              "absolute flex flex-col items-center justify-center cursor-move select-none transition-all overflow-visible",
              "rounded-sm",
              "hover:shadow-md",
              selectedId === item.id && "z-10",
              selectedIds.includes(item.id) && "z-10",
              draggingId === item.id && "z-20 shadow-lg scale-[1.02]"
            )}
            style={{
              left: `${(aabb.x / FLOOR_W) * 100}%`,
              top: `${(aabb.y / FLOOR_H) * 100}%`,
              width: `${(aabb.w / FLOOR_W) * 100}%`,
              height: `${(aabb.h / FLOOR_H) * 100}%`,
            }}
            onMouseDown={(e) => handleMouseDown(e, item.id)}
          >
            <div
              className="absolute"
              style={{
                left: "50%",
                top: "50%",
                width: `${surfWofAabb * 100}%`,
                height: `${surfHofAabb * 100}%`,
                transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                transformOrigin: "center center",
              }}
            >
            <div
              className={cn(
                "absolute inset-0 flex flex-col items-center justify-center overflow-visible",
                "rounded-xl shadow-sm",
                "border-2 border-dashed",
                isSquare
                  ? "bg-stone-500/90 border-stone-600 text-white"
                  : "bg-[#d4a574] border-amber-800/40 text-stone-800",
                "hover:shadow-md",
                selectedId === item.id && "ring-2 ring-emerald-500 ring-offset-2 border-solid border-amber-700/60",
                selectedIds.includes(item.id) && "ring-2 ring-sky-500 ring-offset-2 border-solid border-sky-700/80 bg-sky-200/35",
                draggingId === item.id && "shadow-lg"
              )}
              style={{
                boxShadow: !isSquare ? "inset 0 1px 2px rgba(255,255,255,0.3)" : undefined,
              }}
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
            {selectedId === item.id && (
              <button
                type="button"
                className="absolute -bottom-1.5 -right-1.5 h-4 w-4 rounded-sm border border-white/80 bg-emerald-500 shadow z-20 cursor-se-resize"
                onMouseDown={(e) => handleResizeMouseDown(e, item.id)}
                title={t("posTableResize") || "크기 조절"}
              />
            )}
            </div>
            </div>
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
        {currentFloorLayout.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
            {t("posTableEmpty") || "테이블 추가 버튼으로 테이블을 배치하세요."}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        {t("posTableDragHint") || "테이블을 드래그해 이동, 우하단 핸들로 크기 조절, 더블클릭으로 이름 수정. 추가/삭제 후 저장 버튼을 눌러 반영해 주세요."}
      </p>
    </div>
  )
}
