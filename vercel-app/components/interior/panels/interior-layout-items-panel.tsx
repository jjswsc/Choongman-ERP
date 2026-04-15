"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { LayoutPanelTop, Plus, Pencil, Trash2, Undo2, Redo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useLang } from "@/lib/lang-context"
import { useT, tr } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import {
  getInteriorLayoutItems,
  saveInteriorLayoutItem,
  deleteInteriorLayoutItem,
  getInteriorMaterialSpecs,
  getInteriorLayoutEditorPrefs,
  saveInteriorLayoutEditorPrefs,
  type InteriorLayoutItem,
  type InteriorMaterialSpec,
} from "@/lib/api-client"

const LAYOUT_STATUS: { value: string; labelKey: string }[] = [
  { value: "planned", labelKey: "interiorLayoutStatusPlanned" },
  { value: "ordered", labelKey: "interiorLayoutStatusOrdered" },
  { value: "installed", labelKey: "interiorLayoutStatusInstalled" },
  { value: "done", labelKey: "interiorLayoutStatusDone" },
  { value: "blocked", labelKey: "interiorLayoutStatusBlocked" },
]

function layoutStatusLabel(t: (k: string) => string, status?: string | null) {
  const row = LAYOUT_STATUS.find((x) => x.value === status)
  return row ? t(row.labelKey) : status || t("interiorLayoutStatusPlanned")
}
const GRID_W = 12
const GRID_H = 8
const MIN_SIZE = 0.5
const SNAP_STEP_DEFAULT = 0.5
const MAX_HISTORY = 20
const NUDGE_SMALL_DEFAULT = 0.1
const NUDGE_MEDIUM_DEFAULT = 0.5
const NUDGE_LARGE_DEFAULT = 1
const DUPLICATE_OFFSET = 0.5
const DUPLICATE_OFFSET_STORAGE_KEY_PREFIX = "interiorLayoutItems.duplicateOffset"

type Interaction = {
  mode: "drag" | "resize"
  items: Array<{
    id: number
    baseX: number
    baseY: number
    baseW: number
    baseH: number
  }>
  startClientX: number
  startClientY: number
  keepAspectOnResize?: boolean
  resizeAspectRatio?: number
}

type SelectionBox = {
  startClientX: number
  startClientY: number
  currentClientX: number
  currentClientY: number
  additive: boolean
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function snapBy(value: number, step: number) {
  return Math.round(value / step) * step
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function applySnapValue(value: number, enabled: boolean, step: number) {
  return enabled ? snapBy(value, step) : round1(value)
}

function cloneLayoutList(items: InteriorLayoutItem[]) {
  return items.map((item) => ({ ...item }))
}

function normalizeRange(a: number, b: number) {
  return { min: Math.min(a, b), max: Math.max(a, b) }
}

export function InteriorLayoutItemsPanel({ projectId }: { projectId: string }) {
  const t = useT(useLang().lang)
  const { auth } = useAuth()
  const [zone, setZone] = React.useState<"kitchen" | "hall">("kitchen")
  const [list, setList] = React.useState<InteriorLayoutItem[]>([])
  const [materials, setMaterials] = React.useState<InteriorMaterialSpec[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<InteriorLayoutItem | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)
  const [interaction, setInteraction] = React.useState<Interaction | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<number[]>([])
  const [duplicateSeedIds, setDuplicateSeedIds] = React.useState<number[]>([])
  const [duplicateOffsetX, setDuplicateOffsetX] = React.useState<number>(DUPLICATE_OFFSET)
  const [duplicateOffsetY, setDuplicateOffsetY] = React.useState<number>(DUPLICATE_OFFSET)
  const [snapEnabled, setSnapEnabled] = React.useState<boolean>(true)
  const [snapStep, setSnapStep] = React.useState<number>(SNAP_STEP_DEFAULT)
  const [nudgeSmall, setNudgeSmall] = React.useState<number>(NUDGE_SMALL_DEFAULT)
  const [nudgeMedium, setNudgeMedium] = React.useState<number>(NUDGE_MEDIUM_DEFAULT)
  const [nudgeLarge, setNudgeLarge] = React.useState<number>(NUDGE_LARGE_DEFAULT)
  const [selectionBox, setSelectionBox] = React.useState<SelectionBox | null>(null)
  const [historyPast, setHistoryPast] = React.useState<InteriorLayoutItem[][]>([])
  const [historyFuture, setHistoryFuture] = React.useState<InteriorLayoutItem[][]>([])
  const previewRef = React.useRef<HTMLDivElement | null>(null)
  const duplicateOffsetStorageKey = React.useMemo(
    () => `${DUPLICATE_OFFSET_STORAGE_KEY_PREFIX}.${projectId || "global"}.${zone || "all"}`,
    [projectId, zone]
  )
  const serverPrefsLoadedRef = React.useRef(false)

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(duplicateOffsetStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as { x?: number; y?: number; snapEnabled?: boolean; snapStep?: number; nudgeSmall?: number; nudgeMedium?: number; nudgeLarge?: number }
      if (typeof parsed.x === "number" && Number.isFinite(parsed.x)) setDuplicateOffsetX(parsed.x)
      if (typeof parsed.y === "number" && Number.isFinite(parsed.y)) setDuplicateOffsetY(parsed.y)
      if (typeof parsed.snapEnabled === "boolean") setSnapEnabled(parsed.snapEnabled)
      if (typeof parsed.snapStep === "number" && Number.isFinite(parsed.snapStep)) setSnapStep(Math.max(0.1, parsed.snapStep))
      if (typeof parsed.nudgeSmall === "number" && Number.isFinite(parsed.nudgeSmall)) setNudgeSmall(Math.max(0.01, parsed.nudgeSmall))
      if (typeof parsed.nudgeMedium === "number" && Number.isFinite(parsed.nudgeMedium)) setNudgeMedium(Math.max(0.01, parsed.nudgeMedium))
      if (typeof parsed.nudgeLarge === "number" && Number.isFinite(parsed.nudgeLarge)) setNudgeLarge(Math.max(0.01, parsed.nudgeLarge))
    } catch {
      // ignore localStorage parse errors
    }
  }, [duplicateOffsetStorageKey])

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        duplicateOffsetStorageKey,
        JSON.stringify({
          x: duplicateOffsetX,
          y: duplicateOffsetY,
          snapEnabled,
          snapStep,
          nudgeSmall,
          nudgeMedium,
          nudgeLarge,
        })
      )
    } catch {
      // ignore localStorage write errors
    }
  }, [duplicateOffsetStorageKey, duplicateOffsetX, duplicateOffsetY, snapEnabled, snapStep, nudgeSmall, nudgeMedium, nudgeLarge])

  React.useEffect(() => {
    if (!auth?.store || !auth?.user || !projectId || !zone) return
    serverPrefsLoadedRef.current = false
    let cancelled = false
    getInteriorLayoutEditorPrefs({
      projectId,
      zone,
      userStore: auth.store,
      userName: auth.user,
      employeeId: auth.employeeId,
    })
      .then((prefs) => {
        if (cancelled || !prefs) return
        if (typeof prefs.duplicateOffsetX === "number" && Number.isFinite(prefs.duplicateOffsetX)) {
          setDuplicateOffsetX(prefs.duplicateOffsetX)
        }
        if (typeof prefs.duplicateOffsetY === "number" && Number.isFinite(prefs.duplicateOffsetY)) {
          setDuplicateOffsetY(prefs.duplicateOffsetY)
        }
        if (typeof prefs.snapEnabled === "boolean") {
          setSnapEnabled(prefs.snapEnabled)
        }
        if (typeof prefs.snapStep === "number" && Number.isFinite(prefs.snapStep)) {
          setSnapStep(Math.max(0.1, prefs.snapStep))
        }
        if (typeof prefs.nudgeSmall === "number" && Number.isFinite(prefs.nudgeSmall)) {
          setNudgeSmall(Math.max(0.01, prefs.nudgeSmall))
        }
        if (typeof prefs.nudgeMedium === "number" && Number.isFinite(prefs.nudgeMedium)) {
          setNudgeMedium(Math.max(0.01, prefs.nudgeMedium))
        }
        if (typeof prefs.nudgeLarge === "number" && Number.isFinite(prefs.nudgeLarge)) {
          setNudgeLarge(Math.max(0.01, prefs.nudgeLarge))
        }
      })
      .finally(() => {
        if (!cancelled) serverPrefsLoadedRef.current = true
      })
    return () => {
      cancelled = true
    }
  }, [auth?.store, auth?.user, auth?.employeeId, projectId, zone])

  React.useEffect(() => {
    if (!auth?.store || !auth?.user || !projectId || !zone) return
    if (!serverPrefsLoadedRef.current) return
    const timer = window.setTimeout(() => {
      void saveInteriorLayoutEditorPrefs({
        projectId: Number(projectId),
        zone,
        userStore: auth.store,
        userName: auth.user,
        employeeId: auth.employeeId,
        duplicateOffsetX,
        duplicateOffsetY,
        snapEnabled,
        snapStep,
        nudgeSmall,
        nudgeMedium,
        nudgeLarge,
      })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [auth?.store, auth?.user, auth?.employeeId, projectId, zone, duplicateOffsetX, duplicateOffsetY, snapEnabled, snapStep, nudgeSmall, nudgeMedium, nudgeLarge])

  const applyDuplicatePreset = React.useCallback((preset: "right" | "down" | "diagonal" | "left") => {
    if (preset === "right") {
      setDuplicateOffsetX(0.5)
      setDuplicateOffsetY(0)
      return
    }
    if (preset === "down") {
      setDuplicateOffsetX(0)
      setDuplicateOffsetY(0.5)
      return
    }
    if (preset === "diagonal") {
      setDuplicateOffsetX(0.5)
      setDuplicateOffsetY(0.5)
      return
    }
    setDuplicateOffsetX(-0.5)
    setDuplicateOffsetY(0)
  }, [])

  const loadData = React.useCallback(() => {
    if (!projectId) return
    setLoading(true)
    Promise.all([
      getInteriorLayoutItems({ projectId, zone }).catch(() => []),
      getInteriorMaterialSpecs({ projectId }).catch(() => []),
    ])
      .then(([items, specs]) => {
        setList(items || [])
        setMaterials(specs || [])
      })
      .finally(() => setLoading(false))
  }, [projectId, zone])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleAdd = () => {
    setEditing({
      projectId: Number(projectId),
      zone,
      itemName: "",
      x: 0.5,
      y: 0.5,
      w: 1,
      h: 1,
      rotation: 0,
      qty: 1,
      status: "planned",
      sortOrder: list.length,
    })
  }

  const handleSave = async () => {
    if (!editing || !editing.itemName?.trim()) {
      await appAlert(t("interiorItemNameRequired"))
      return
    }
    try {
      const res = await saveInteriorLayoutItem({
        ...editing,
        projectId: Number(projectId),
        zone,
        itemName: editing.itemName.trim(),
      })
      if (res.success) {
        setEditing(null)
        loadData()
        await appAlert(t("msg_saved"))
      } else {
        await appAlert(res.message || t("msg_save_fail"))
      }
    } catch (e) {
      await appAlert(String(e))
    }
  }

  const handleDelete = async (id: number) => {
    if (!await appConfirm(t("msg_delete_confirm_check_item"))) return
    setDeletingId(id)
    try {
      const res = await deleteInteriorLayoutItem({ id })
      if (res.success) {
        loadData()
        if (editing?.id === id) setEditing(null)
      } else {
        await appAlert(res.message || t("msg_delete_fail"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setDeletingId(null)
    }
  }

  const persistLayoutItems = React.useCallback(async (items: InteriorLayoutItem[]) => {
    try {
      await Promise.all(
        items
          .filter((item) => item.id && item.itemName?.trim())
          .map((item) =>
            saveInteriorLayoutItem({
              ...item,
              projectId: Number(projectId),
              zone,
              itemName: String(item.itemName).trim(),
            })
          )
      )
    } catch {
      // 사용자 동작 중 자동 저장 실패는 경고만 하고 계속 편집 가능하도록 둔다.
      await appAlert(t("interiorLayoutSaveFailed"))
      loadData()
    }
  }, [projectId, zone, loadData, t])

  const pushHistory = React.useCallback((snapshot: InteriorLayoutItem[]) => {
    setHistoryPast((prev) => {
      const next = [...prev, cloneLayoutList(snapshot)]
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
    })
    setHistoryFuture([])
  }, [])

  const syncEditingFromList = React.useCallback((nextList: InteriorLayoutItem[]) => {
    setEditing((prev) => {
      if (!prev?.id) return prev
      return nextList.find((x) => x.id === prev.id) || prev
    })
  }, [])

  const handleUndo = React.useCallback(async () => {
    if (historyPast.length === 0) return
    const previous = historyPast[historyPast.length - 1]
    const currentSnapshot = cloneLayoutList(list)
    const prevSnapshot = cloneLayoutList(previous)
    setHistoryPast((prev) => prev.slice(0, -1))
    setHistoryFuture((prev) => [currentSnapshot, ...prev].slice(0, MAX_HISTORY))
    setList(prevSnapshot)
    syncEditingFromList(prevSnapshot)
    await persistLayoutItems(prevSnapshot)
  }, [historyPast, list, persistLayoutItems, syncEditingFromList])

  const handleRedo = React.useCallback(async () => {
    if (historyFuture.length === 0) return
    const next = historyFuture[0]
    const currentSnapshot = cloneLayoutList(list)
    const nextSnapshot = cloneLayoutList(next)
    setHistoryFuture((prev) => prev.slice(1))
    setHistoryPast((prev) => [...prev, currentSnapshot].slice(-MAX_HISTORY))
    setList(nextSnapshot)
    syncEditingFromList(nextSnapshot)
    await persistLayoutItems(nextSnapshot)
  }, [historyFuture, list, persistLayoutItems, syncEditingFromList])

  React.useEffect(() => {
    if (!interaction) return
    const onMove = (ev: MouseEvent) => {
      if (!previewRef.current) return
      const rect = previewRef.current.getBoundingClientRect()
      const dx = ((ev.clientX - interaction.startClientX) / rect.width) * GRID_W
      const dy = ((ev.clientY - interaction.startClientY) / rect.height) * GRID_H
      const effectiveSnapEnabled = snapEnabled || ev.shiftKey

      setList((prev) => {
        const nextList =
        prev.map((item) => {
          const base = interaction.items.find((x) => x.id === item.id)
          if (!base) return item

          if (interaction.mode === "drag") {
            const nextX = clamp(applySnapValue(base.baseX + dx, effectiveSnapEnabled, snapStep), 0, GRID_W - base.baseW)
            const nextY = clamp(applySnapValue(base.baseY + dy, effectiveSnapEnabled, snapStep), 0, GRID_H - base.baseH)
            const next = { ...item, x: nextX, y: nextY }
            return next
          }

          const maxW = GRID_W - base.baseX
          const maxH = GRID_H - base.baseY
          let nextW = clamp(applySnapValue(base.baseW + dx, effectiveSnapEnabled, snapStep), MIN_SIZE, maxW)
          let nextH = clamp(applySnapValue(base.baseH + dy, effectiveSnapEnabled, snapStep), MIN_SIZE, maxH)
          if (interaction.keepAspectOnResize) {
            const ratio = interaction.resizeAspectRatio && interaction.resizeAspectRatio > 0
              ? interaction.resizeAspectRatio
              : base.baseW / Math.max(base.baseH, MIN_SIZE)
            if (Math.abs(dx) >= Math.abs(dy)) {
              nextW = clamp(applySnapValue(base.baseW + dx, effectiveSnapEnabled, snapStep), MIN_SIZE, maxW)
              nextH = clamp(applySnapValue(nextW / ratio, effectiveSnapEnabled, snapStep), MIN_SIZE, maxH)
              nextW = clamp(applySnapValue(nextH * ratio, effectiveSnapEnabled, snapStep), MIN_SIZE, maxW)
            } else {
              nextH = clamp(applySnapValue(base.baseH + dy, effectiveSnapEnabled, snapStep), MIN_SIZE, maxH)
              nextW = clamp(applySnapValue(nextH * ratio, effectiveSnapEnabled, snapStep), MIN_SIZE, maxW)
              nextH = clamp(applySnapValue(nextW / ratio, effectiveSnapEnabled, snapStep), MIN_SIZE, maxH)
            }
          }
          const next = { ...item, w: nextW, h: nextH }
          return next
        })
        syncEditingFromList(nextList)
        return nextList
      })
    }

    const onUp = async () => {
      const affectedIds = interaction.items.map((x) => x.id)
      const changed = list.filter((x) => x.id && affectedIds.includes(x.id))
      await persistLayoutItems(changed)
      setInteraction(null)
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [interaction, list, persistLayoutItems, syncEditingFromList, snapStep, snapEnabled])

  React.useEffect(() => {
    if (!selectionBox) return
    const onMove = (ev: MouseEvent) => {
      setSelectionBox((prev) =>
        prev
          ? {
              ...prev,
              currentClientX: ev.clientX,
              currentClientY: ev.clientY,
            }
          : prev
      )
    }

    const onUp = (ev: MouseEvent) => {
      if (!previewRef.current) {
        setSelectionBox(null)
        return
      }
      const rect = previewRef.current.getBoundingClientRect()
      const x1 = clamp(((selectionBox.startClientX - rect.left) / rect.width) * GRID_W, 0, GRID_W)
      const y1 = clamp(((selectionBox.startClientY - rect.top) / rect.height) * GRID_H, 0, GRID_H)
      const x2 = clamp(((ev.clientX - rect.left) / rect.width) * GRID_W, 0, GRID_W)
      const y2 = clamp(((ev.clientY - rect.top) / rect.height) * GRID_H, 0, GRID_H)
      const xr = normalizeRange(x1, x2)
      const yr = normalizeRange(y1, y2)
      const picked = list
        .filter((item) => {
          if (!item.id) return false
          const ix = item.x ?? 0
          const iy = item.y ?? 0
          const iw = item.w ?? 1
          const ih = item.h ?? 1
          const intersects = ix < xr.max && ix + iw > xr.min && iy < yr.max && iy + ih > yr.min
          return intersects
        })
        .map((item) => Number(item.id))

      if (selectionBox.additive) {
        setSelectedIds((prev) => Array.from(new Set([...prev, ...picked])))
      } else {
        setSelectedIds(picked)
      }
      if (picked.length === 1) {
        const target = list.find((x) => x.id === picked[0])
        if (target) setEditing(target)
      }
      setSelectionBox(null)
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [selectionBox, list])

  const handleItemSelect = React.useCallback((itemId: number, additive: boolean) => {
    if (!additive) {
      setSelectedIds([itemId])
      return
    }
    setSelectedIds((prev) => (prev.includes(itemId) ? prev.filter((x) => x !== itemId) : [...prev, itemId]))
  }, [])

  const alignSelectedItems = React.useCallback(async (direction: "left" | "right" | "top" | "bottom") => {
    const selected = list.filter((item) => item.id && selectedIds.includes(Number(item.id)))
    if (selected.length < 2) {
      await appAlert(t("interiorAlignNeedTwo"))
      return
    }
    pushHistory(list)

    const minX = Math.min(...selected.map((item) => item.x ?? 0))
    const maxX = Math.max(...selected.map((item) => (item.x ?? 0) + (item.w ?? 1)))
    const minY = Math.min(...selected.map((item) => item.y ?? 0))
    const maxY = Math.max(...selected.map((item) => (item.y ?? 0) + (item.h ?? 1)))

    const changedIds = new Set<number>()
    const nextList = list.map((item) => {
      if (!item.id || !selectedIds.includes(Number(item.id))) return item
      const w = item.w ?? 1
      const h = item.h ?? 1
      let x = item.x ?? 0
      let y = item.y ?? 0

      if (direction === "left") x = minX
      if (direction === "right") x = maxX - w
      if (direction === "top") y = minY
      if (direction === "bottom") y = maxY - h

      x = clamp(applySnapValue(x, snapEnabled, snapStep), 0, GRID_W - w)
      y = clamp(applySnapValue(y, snapEnabled, snapStep), 0, GRID_H - h)
      changedIds.add(Number(item.id))
      return { ...item, x, y }
    })

    setList(nextList)
    syncEditingFromList(nextList)
    const changed = nextList.filter((item) => item.id && changedIds.has(Number(item.id)))
    await persistLayoutItems(changed)
  }, [list, selectedIds, pushHistory, syncEditingFromList, persistLayoutItems, snapStep, snapEnabled, t])

  const alignCenterSelectedItems = React.useCallback(async (axis: "horizontal" | "vertical") => {
    const selected = list.filter((item) => item.id && selectedIds.includes(Number(item.id)))
    if (selected.length < 2) {
      await appAlert(t("interiorAlignCenterNeedTwo"))
      return
    }
    pushHistory(list)

    const center =
      axis === "horizontal"
        ? selected.reduce((sum, item) => sum + ((item.x ?? 0) + (item.w ?? 1) / 2), 0) / selected.length
        : selected.reduce((sum, item) => sum + ((item.y ?? 0) + (item.h ?? 1) / 2), 0) / selected.length

    const changedIds = new Set<number>()
    const nextList = list.map((item) => {
      if (!item.id || !selectedIds.includes(Number(item.id))) return item
      const w = item.w ?? 1
      const h = item.h ?? 1
      let x = item.x ?? 0
      let y = item.y ?? 0
      if (axis === "horizontal") {
        x = clamp(applySnapValue(center - w / 2, snapEnabled, snapStep), 0, GRID_W - w)
      } else {
        y = clamp(applySnapValue(center - h / 2, snapEnabled, snapStep), 0, GRID_H - h)
      }
      changedIds.add(Number(item.id))
      return { ...item, x, y }
    })

    setList(nextList)
    syncEditingFromList(nextList)
    const changed = nextList.filter((item) => item.id && changedIds.has(Number(item.id)))
    await persistLayoutItems(changed)
  }, [list, selectedIds, pushHistory, syncEditingFromList, persistLayoutItems, snapStep, snapEnabled, t])

  const distributeSelectedItems = React.useCallback(async (axis: "horizontal" | "vertical") => {
    const selected = list.filter((item) => item.id && selectedIds.includes(Number(item.id)))
    if (selected.length < 3) {
      await appAlert(t("interiorDistributeNeedThree"))
      return
    }
    pushHistory(list)

    const sorted = [...selected].sort((a, b) =>
      axis === "horizontal" ? (a.x ?? 0) - (b.x ?? 0) : (a.y ?? 0) - (b.y ?? 0)
    )

    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const firstPos = axis === "horizontal" ? (first.x ?? 0) : (first.y ?? 0)
    const lastPos = axis === "horizontal" ? (last.x ?? 0) : (last.y ?? 0)
    const step = (lastPos - firstPos) / (sorted.length - 1)

    const targetPosById = new Map<number, number>()
    sorted.forEach((item, index) => {
      if (!item.id) return
      targetPosById.set(Number(item.id), firstPos + step * index)
    })

    const changedIds = new Set<number>()
    const nextList = list.map((item) => {
      if (!item.id || !targetPosById.has(Number(item.id))) return item
      const id = Number(item.id)
      const target = targetPosById.get(id) ?? 0
      const w = item.w ?? 1
      const h = item.h ?? 1

      let x = item.x ?? 0
      let y = item.y ?? 0
      if (axis === "horizontal") {
        x = clamp(applySnapValue(target, snapEnabled, snapStep), 0, GRID_W - w)
      } else {
        y = clamp(applySnapValue(target, snapEnabled, snapStep), 0, GRID_H - h)
      }
      changedIds.add(id)
      return { ...item, x, y }
    })

    setList(nextList)
    syncEditingFromList(nextList)
    const changed = nextList.filter((item) => item.id && changedIds.has(Number(item.id)))
    await persistLayoutItems(changed)
  }, [list, selectedIds, pushHistory, syncEditingFromList, persistLayoutItems, snapStep, snapEnabled, t])

  const nudgeSelectedItems = React.useCallback(async (dx: number, dy: number) => {
    const selectedCount = list.filter((item) => item.id && selectedIds.includes(Number(item.id))).length
    if (selectedCount === 0) return
    pushHistory(list)

    const changedIds = new Set<number>()
    const nextList = list.map((item) => {
      if (!item.id || !selectedIds.includes(Number(item.id))) return item
      const w = item.w ?? 1
      const h = item.h ?? 1
      const nextX = clamp(round1((item.x ?? 0) + dx), 0, GRID_W - w)
      const nextY = clamp(round1((item.y ?? 0) + dy), 0, GRID_H - h)
      changedIds.add(Number(item.id))
      return { ...item, x: nextX, y: nextY }
    })

    setList(nextList)
    syncEditingFromList(nextList)
    const changed = nextList.filter((item) => item.id && changedIds.has(Number(item.id)))
    await persistLayoutItems(changed)
  }, [list, selectedIds, pushHistory, syncEditingFromList, persistLayoutItems])

  const resizeSelectedItemsByKey = React.useCallback(async (dw: number, dh: number) => {
    const selectedCount = list.filter((item) => item.id && selectedIds.includes(Number(item.id))).length
    if (selectedCount === 0) return
    pushHistory(list)

    const changedIds = new Set<number>()
    const nextList = list.map((item) => {
      if (!item.id || !selectedIds.includes(Number(item.id))) return item
      const x = item.x ?? 0
      const y = item.y ?? 0
      const w = item.w ?? 1
      const h = item.h ?? 1
      const nextW = clamp(round1(w + dw), MIN_SIZE, GRID_W - x)
      const nextH = clamp(round1(h + dh), MIN_SIZE, GRID_H - y)
      changedIds.add(Number(item.id))
      return { ...item, w: nextW, h: nextH }
    })

    setList(nextList)
    syncEditingFromList(nextList)
    const changed = nextList.filter((item) => item.id && changedIds.has(Number(item.id)))
    await persistLayoutItems(changed)
  }, [list, selectedIds, pushHistory, syncEditingFromList, persistLayoutItems])

  const duplicateSelectedItems = React.useCallback(async (opts?: { preferSeed?: boolean; silent?: boolean }) => {
    const selected = list.filter((item) => item.id && selectedIds.includes(Number(item.id)))
    const seeded = list.filter((item) => item.id && duplicateSeedIds.includes(Number(item.id)))
    const source = selected.length > 0 ? selected : (opts?.preferSeed ? seeded : [])
    const isRepeat = selected.length === 0 && source.length > 0
    const workingSet = source

    const selectedCount = workingSet.length
    if (selectedCount === 0) return
    if (isRepeat && !opts?.silent && !await appConfirm(tr(t, "interiorRepeatDuplicateConfirm", { n: selectedCount }))) return

    pushHistory(list)

    try {
      const createdIds: number[] = []
      for (const item of workingSet) {
        const x = clamp(round1((item.x ?? 0) + duplicateOffsetX), 0, GRID_W - (item.w ?? 1))
        const y = clamp(round1((item.y ?? 0) + duplicateOffsetY), 0, GRID_H - (item.h ?? 1))
        const res = await saveInteriorLayoutItem({
          projectId: Number(projectId),
          zone,
          floor: item.floor || "",
          itemName: item.itemName || t("interiorDuplicateDefaultName"),
          x,
          y,
          w: item.w ?? 1,
          h: item.h ?? 1,
          rotation: item.rotation ?? 0,
          qty: item.qty ?? 1,
          status: item.status || "planned",
          materialSpecId: item.materialSpecId ?? null,
          note: item.note || "",
          sortOrder: (item.sortOrder ?? 0) + 1,
        })
        if (res.success && res.id) createdIds.push(res.id)
      }

      await loadData()
      if (createdIds.length > 0) {
        setSelectedIds(createdIds)
        setDuplicateSeedIds(createdIds)
        if (createdIds.length === 1) {
          const reloaded = await getInteriorLayoutItems({ projectId, zone })
          const target = reloaded.find((x) => x.id === createdIds[0]) || null
          if (target) setEditing(target)
        }
      }
      if (!opts?.silent) await appAlert(tr(t, "interiorDuplicatedCount", { n: workingSet.length }))
    } catch (e) {
      await appAlert(String(e))
      loadData()
    }
  }, [list, selectedIds, duplicateSeedIds, pushHistory, projectId, zone, loadData, duplicateOffsetX, duplicateOffsetY, t])

  const bulkDeleteSelected = React.useCallback(async () => {
    const ids = selectedIds.filter((id) => Number.isFinite(id))
    if (ids.length === 0) return
    if (!await appConfirm(tr(t, "interiorBulkDeleteConfirm", { n: ids.length }))) return

    pushHistory(list)
    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          const res = await deleteInteriorLayoutItem({ id })
          return { id, ok: !!res.success, message: res.message }
        })
      )
      const failed = results.filter((x) => !x.ok)
      if (failed.length > 0) {
        await appAlert(tr(t, "interiorBulkDeletePartial", { n: failed.length }))
      }
      const failedIds = new Set(failed.map((x) => x.id))
      const deletedIds = new Set(ids.filter((id) => !failedIds.has(id)))
      const nextList = list.filter((item) => !item.id || !deletedIds.has(Number(item.id)))
      setList(nextList)
      setSelectedIds((prev) => prev.filter((id) => !deletedIds.has(id)))
      setEditing((prev) => (prev?.id && deletedIds.has(Number(prev.id)) ? null : prev))
    } catch (e) {
      await appAlert(String(e))
      loadData()
    }
  }, [selectedIds, pushHistory, list, loadData, t])

  React.useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      const tag = (target?.tagName || "").toLowerCase()
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return

      if ((ev.key === "Delete" || ev.key === "Backspace") && selectedIds.length > 0) {
        ev.preventDefault()
        void bulkDeleteSelected()
        return
      }

      if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === "d") {
        ev.preventDefault()
        void duplicateSelectedItems({ preferSeed: true, silent: true })
        return
      }

      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "d" && selectedIds.length > 0) {
        ev.preventDefault()
        void duplicateSelectedItems()
        return
      }

      if (selectedIds.length === 0) return
      const arrowToDelta: Record<string, { dx: number; dy: number }> = {
        ArrowLeft: { dx: -1, dy: 0 },
        ArrowRight: { dx: 1, dy: 0 },
        ArrowUp: { dx: 0, dy: -1 },
        ArrowDown: { dx: 0, dy: 1 },
      }
      const delta = arrowToDelta[ev.key]
      if (!delta) return

      ev.preventDefault()
      const step = ev.shiftKey ? nudgeMedium : (ev.ctrlKey || ev.metaKey ? nudgeLarge : nudgeSmall)
      if (ev.altKey) {
        void resizeSelectedItemsByKey(delta.dx * step, delta.dy * step)
      } else {
        void nudgeSelectedItems(delta.dx * step, delta.dy * step)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedIds, bulkDeleteSelected, nudgeSelectedItems, resizeSelectedItemsByKey, duplicateSelectedItems, nudgeSmall, nudgeMedium, nudgeLarge])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <LayoutPanelTop className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">{t("interiorLayoutPageTitle")}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Select value={zone} onValueChange={(value) => setZone(value as "kitchen" | "hall")}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kitchen">{t("interiorZoneKitchen")}</SelectItem>
                <SelectItem value="hall">{t("interiorZoneHall")}</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleAdd} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("add")}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{t("interiorLayoutPreviewHint")}</span>
            <div className="flex items-center gap-1 flex-wrap justify-end">
              <div className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                <span className="text-muted-foreground">{t("interiorDupOffsetX")}</span>
                <Input
                  type="number"
                  step="0.1"
                  className="h-6 w-16 text-xs"
                  value={duplicateOffsetX}
                  onChange={(e) => setDuplicateOffsetX(Number(e.target.value) || 0)}
                />
                <span className="text-muted-foreground">Y</span>
                <Input
                  type="number"
                  step="0.1"
                  className="h-6 w-16 text-xs"
                  value={duplicateOffsetY}
                  onChange={(e) => setDuplicateOffsetY(Number(e.target.value) || 0)}
                />
              </div>
              <div className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                <Button
                  size="sm"
                  variant={snapEnabled ? "default" : "outline"}
                  className="h-6 px-2 text-xs"
                  onClick={() => setSnapEnabled((prev) => !prev)}
                >
                  {snapEnabled ? t("interiorSnapOn") : t("interiorSnapOff")}
                </Button>
                <span className="text-muted-foreground">{t("interiorSnapLabel")}</span>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  className="h-6 w-14 text-xs"
                  value={snapStep}
                  onChange={(e) => setSnapStep(Math.max(0.1, Number(e.target.value) || SNAP_STEP_DEFAULT))}
                />
              </div>
              <div className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                <span className="text-muted-foreground">{t("interiorMoveLabel")}</span>
                <Input type="number" step="0.1" className="h-6 w-14 text-xs" value={nudgeSmall} onChange={(e) => setNudgeSmall(Math.max(0.01, Number(e.target.value) || NUDGE_SMALL_DEFAULT))} />
                <span className="text-muted-foreground">{t("interiorKeyShift")}</span>
                <Input type="number" step="0.1" className="h-6 w-14 text-xs" value={nudgeMedium} onChange={(e) => setNudgeMedium(Math.max(0.01, Number(e.target.value) || NUDGE_MEDIUM_DEFAULT))} />
                <span className="text-muted-foreground">{t("interiorKeyCtrl")}</span>
                <Input type="number" step="0.1" className="h-6 w-14 text-xs" value={nudgeLarge} onChange={(e) => setNudgeLarge(Math.max(0.01, Number(e.target.value) || NUDGE_LARGE_DEFAULT))} />
              </div>
              <Button size="sm" variant="outline" onClick={() => applyDuplicatePreset("right")} className="h-7 px-2 text-xs">{t("interiorPresetRight")}</Button>
              <Button size="sm" variant="outline" onClick={() => applyDuplicatePreset("down")} className="h-7 px-2 text-xs">{t("interiorPresetDown")}</Button>
              <Button size="sm" variant="outline" onClick={() => applyDuplicatePreset("diagonal")} className="h-7 px-2 text-xs">{t("interiorPresetDiagonal")}</Button>
              <Button size="sm" variant="outline" onClick={() => applyDuplicatePreset("left")} className="h-7 px-2 text-xs">{t("interiorPresetLeft")}</Button>
              <Button size="sm" variant="outline" onClick={() => { setDuplicateOffsetX(DUPLICATE_OFFSET); setDuplicateOffsetY(DUPLICATE_OFFSET) }} className="h-7 px-2 text-xs">{t("interiorDupOffsetReset")}</Button>
              <Button size="sm" variant="outline" onClick={() => setSnapStep(SNAP_STEP_DEFAULT)} className="h-7 px-2 text-xs">{t("interiorSnapReset")}</Button>
              <Button size="sm" variant="outline" onClick={() => { setNudgeSmall(NUDGE_SMALL_DEFAULT); setNudgeMedium(NUDGE_MEDIUM_DEFAULT); setNudgeLarge(NUDGE_LARGE_DEFAULT) }} className="h-7 px-2 text-xs">{t("interiorNudgeReset")}</Button>
              <Button size="sm" variant="outline" onClick={() => void alignSelectedItems("left")} disabled={selectedIds.length < 2} className="h-7 px-2 text-xs">{t("interiorAlignLeft")}</Button>
              <Button size="sm" variant="outline" onClick={() => void alignSelectedItems("right")} disabled={selectedIds.length < 2} className="h-7 px-2 text-xs">{t("interiorAlignRight")}</Button>
              <Button size="sm" variant="outline" onClick={() => void alignCenterSelectedItems("horizontal")} disabled={selectedIds.length < 2} className="h-7 px-2 text-xs">{t("interiorAlignCenterH")}</Button>
              <Button size="sm" variant="outline" onClick={() => void alignSelectedItems("top")} disabled={selectedIds.length < 2} className="h-7 px-2 text-xs">{t("interiorAlignTop")}</Button>
              <Button size="sm" variant="outline" onClick={() => void alignSelectedItems("bottom")} disabled={selectedIds.length < 2} className="h-7 px-2 text-xs">{t("interiorAlignBottom")}</Button>
              <Button size="sm" variant="outline" onClick={() => void alignCenterSelectedItems("vertical")} disabled={selectedIds.length < 2} className="h-7 px-2 text-xs">{t("interiorAlignCenterV")}</Button>
              <Button size="sm" variant="outline" onClick={() => void distributeSelectedItems("horizontal")} disabled={selectedIds.length < 3} className="h-7 px-2 text-xs">{t("interiorDistributeH")}</Button>
              <Button size="sm" variant="outline" onClick={() => void distributeSelectedItems("vertical")} disabled={selectedIds.length < 3} className="h-7 px-2 text-xs">{t("interiorDistributeV")}</Button>
              <Button size="sm" variant="outline" onClick={() => void duplicateSelectedItems()} disabled={selectedIds.length === 0} className="h-7 px-2 text-xs">{t("interiorDuplicate")}</Button>
              <Button size="sm" variant="outline" onClick={() => void bulkDeleteSelected()} disabled={selectedIds.length === 0} className="h-7 px-2 text-xs text-destructive">{t("interiorDeleteSelected")}</Button>
              <Button size="sm" variant="outline" onClick={handleUndo} disabled={historyPast.length === 0} className="h-7 gap-1 px-2">
                <Undo2 className="h-3.5 w-3.5" /> {t("interiorUndo")}
              </Button>
              <Button size="sm" variant="outline" onClick={handleRedo} disabled={historyFuture.length === 0} className="h-7 gap-1 px-2">
                <Redo2 className="h-3.5 w-3.5" /> {t("interiorRedo")}
              </Button>
            </div>
          </div>
          <div className="mb-2 text-[11px] text-muted-foreground">{t("interiorLayoutTip")}</div>
          <div
            ref={previewRef}
            className="relative mx-auto h-[320px] w-full max-w-4xl rounded-md border bg-muted/20 select-none"
            onMouseDown={(ev) => {
              if (interaction) return
              if (ev.target !== ev.currentTarget) return
              ev.preventDefault()
              const additive = ev.ctrlKey || ev.metaKey
              if (!additive) setSelectedIds([])
              setSelectionBox({
                startClientX: ev.clientX,
                startClientY: ev.clientY,
                currentClientX: ev.clientX,
                currentClientY: ev.clientY,
                additive,
              })
            }}
          >
            {selectionBox && previewRef.current ? (() => {
              const rect = previewRef.current.getBoundingClientRect()
              const startX = clamp(((selectionBox.startClientX - rect.left) / rect.width) * 100, 0, 100)
              const startY = clamp(((selectionBox.startClientY - rect.top) / rect.height) * 100, 0, 100)
              const currX = clamp(((selectionBox.currentClientX - rect.left) / rect.width) * 100, 0, 100)
              const currY = clamp(((selectionBox.currentClientY - rect.top) / rect.height) * 100, 0, 100)
              const x = Math.min(startX, currX)
              const y = Math.min(startY, currY)
              const w = Math.abs(currX - startX)
              const h = Math.abs(currY - startY)
              return (
                <div
                  className="pointer-events-none absolute border border-primary bg-primary/15"
                  style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
                />
              )
            })() : null}
            {list.map((item) => {
              const itemId = item.id ?? 0
              const x = item.x ?? 0
              const y = item.y ?? 0
              const w = item.w ?? 1
              const h = item.h ?? 1
              const left = `${(x / GRID_W) * 100}%`
              const top = `${(y / GRID_H) * 100}%`
              const width = `${(w / GRID_W) * 100}%`
              const height = `${(h / GRID_H) * 100}%`
              const isSelected = item.id ? selectedIds.includes(item.id) : false
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`absolute rounded border bg-background/90 px-1 py-0.5 text-left text-[11px] shadow-sm hover:border-primary ${isSelected ? "border-primary ring-1 ring-primary/50" : ""}`}
                  style={{ left, top, width, height }}
                  onMouseDown={(ev) => {
                    if (!item.id) return
                    if (ev.ctrlKey || ev.metaKey) return
                    ev.preventDefault()
                    const selected = selectedIds.includes(itemId) ? selectedIds : [itemId]
                    setSelectedIds(selected)
                    pushHistory(list)
                    const dragItems = list
                      .filter((x) => x.id && selected.includes(x.id))
                      .map((x) => ({
                        id: Number(x.id),
                        baseX: x.x ?? 0,
                        baseY: x.y ?? 0,
                        baseW: x.w ?? 1,
                        baseH: x.h ?? 1,
                      }))
                    setInteraction({
                      mode: "drag",
                      items: dragItems,
                      startClientX: ev.clientX,
                      startClientY: ev.clientY,
                    })
                  }}
                  onClick={(ev) => {
                    if (!item.id) return
                    const additive = ev.ctrlKey || ev.metaKey
                    handleItemSelect(item.id, additive)
                    if (!additive) {
                      setEditing(item)
                    }
                  }}
                >
                  <div className="truncate font-medium">{item.itemName}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{t("interiorQtyTag")} {item.qty ?? 1}</div>
                  <span
                    className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 cursor-se-resize rounded-sm border border-primary/60 bg-primary/30"
                    onMouseDown={(ev) => {
                      if (!item.id) return
                      ev.preventDefault()
                      ev.stopPropagation()
                      setSelectedIds([itemId])
                      pushHistory(list)
                      setInteraction({
                        mode: "resize",
                        items: [
                          {
                            id: itemId,
                            baseX: x,
                            baseY: y,
                            baseW: w,
                            baseH: h,
                          },
                        ],
                        startClientX: ev.clientX,
                        startClientY: ev.clientY,
                        keepAspectOnResize: ev.shiftKey,
                        resizeAspectRatio: w / Math.max(h, MIN_SIZE),
                      })
                    }}
                  />
                </button>
              )
            })}
          </div>
        </div>

        {editing && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="lg:col-span-2">
                <label className="text-xs text-muted-foreground">{t("interiorColItemName")}</label>
                <Input
                  value={editing.itemName || ""}
                  onChange={(e) => setEditing({ ...editing, itemName: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorLayoutItemLink")}</label>
                <Select
                  value={editing.materialSpecId ? String(editing.materialSpecId) : "__none__"}
                  onValueChange={(value) =>
                    setEditing({ ...editing, materialSpecId: value === "__none__" ? null : Number(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("interiorUnassigned")}</SelectItem>
                    {materials.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.materialName || tr(t, "interiorMaterialNumber", { n: String(m.id) })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("status")}</label>
                <Select value={editing.status || "planned"} onValueChange={(value) => setEditing({ ...editing, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LAYOUT_STATUS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{t(opt.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorQtyTag")}</label>
                <Input type="number" value={editing.qty ?? 1} onChange={(e) => setEditing({ ...editing, qty: Number(e.target.value) || 1 })} />
              </div>
              <div><label className="text-xs text-muted-foreground">x</label><Input type="number" value={editing.x ?? 0} onChange={(e) => setEditing({ ...editing, x: Number(e.target.value) || 0 })} /></div>
              <div><label className="text-xs text-muted-foreground">y</label><Input type="number" value={editing.y ?? 0} onChange={(e) => setEditing({ ...editing, y: Number(e.target.value) || 0 })} /></div>
              <div><label className="text-xs text-muted-foreground">w</label><Input type="number" value={editing.w ?? 1} onChange={(e) => setEditing({ ...editing, w: Number(e.target.value) || 1 })} /></div>
              <div><label className="text-xs text-muted-foreground">h</label><Input type="number" value={editing.h ?? 1} onChange={(e) => setEditing({ ...editing, h: Number(e.target.value) || 1 })} /></div>
              <div><label className="text-xs text-muted-foreground">{t("interiorRotationDeg")}</label><Input type="number" value={editing.rotation ?? 0} onChange={(e) => setEditing({ ...editing, rotation: Number(e.target.value) || 0 })} /></div>
              <div className="lg:col-span-6">
                <label className="text-xs text-muted-foreground">{t("interiorMemo")}</label>
                <Input value={editing.note || ""} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave}>{t("save")}</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>{t("cancel")}</Button>
            </div>
          </div>
        )}

        <div className="rounded-lg border bg-card">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("loading")}</div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("interiorLayoutEmpty")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("interiorColItemName")}</TableHead>
                  <TableHead className="w-20">x</TableHead>
                  <TableHead className="w-20">y</TableHead>
                  <TableHead className="w-20">w</TableHead>
                  <TableHead className="w-20">h</TableHead>
                  <TableHead className="w-20 text-right">{t("interiorQtyTag")}</TableHead>
                  <TableHead className="w-24">{t("status")}</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.itemName}</TableCell>
                    <TableCell className="font-mono text-xs">{item.x ?? 0}</TableCell>
                    <TableCell className="font-mono text-xs">{item.y ?? 0}</TableCell>
                    <TableCell className="font-mono text-xs">{item.w ?? 1}</TableCell>
                    <TableCell className="font-mono text-xs">{item.h ?? 1}</TableCell>
                    <TableCell className="text-right font-mono">{item.qty ?? 1}</TableCell>
                    <TableCell className="text-xs">{layoutStatusLabel(t, item.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => item.id && handleDelete(item.id)}
                          disabled={deletingId === item.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  )
}
