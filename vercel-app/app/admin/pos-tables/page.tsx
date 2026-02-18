"use client"

import * as React from "react"
import { LayoutGrid, Plus, Save, Trash2 } from "lucide-react"
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

const FLOOR_W = 640
const FLOOR_H = 420
const DEFAULT_TABLE = { w: 72, h: 56 }

function generateId() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export default function PosTablesPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()

  const [storeCode, setStoreCode] = React.useState("")
  const [layout, setLayout] = React.useState<PosTableItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [editingNameId, setEditingNameId] = React.useState<string | null>(null)
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

  const handleAddTable = () => {
    const maxY = layout.length ? Math.max(...layout.map((t) => t.y + t.h)) : 0
    const y = maxY + 16 > FLOOR_H - DEFAULT_TABLE.h ? 20 : maxY + 16
    const x = layout.length % 2 === 0 ? 24 : 120
    const newTable: PosTableItem = {
      id: generateId(),
      name: `${layout.length + 1}번`,
      x,
      y,
      w: DEFAULT_TABLE.w,
      h: DEFAULT_TABLE.h,
    }
    setLayout((prev) => [...prev, newTable])
    setEditingNameId(newTable.id)
  }

  const handleRemoveTable = (id: string) => {
    if (!confirm(t("posTableDeleteConfirm") || "이 테이블을 삭제하시겠습니까?")) return
    setLayout((prev) => prev.filter((t) => t.id !== id))
  }

  const handleMoveTable = (id: string, dx: number, dy: number) => {
    setLayout((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        let nx = t.x + dx
        let ny = t.y + dy
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

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest("input, button")) return
    e.preventDefault()
    const t = layout.find((x) => x.id === id)
    if (!t) return
    setDraggingId(id)
    dragStartRef.current = {
      id,
      startX: t.x,
      startY: t.y,
      mouseX: e.clientX,
      mouseY: e.clientY,
    }
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
          let nx = d.startX + dx
          let ny = d.startY + dy
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

  const handleSave = async () => {
    if (!storeCode) {
      alert(t("store") || "매장을 선택하세요.")
      return
    }
    setSaving(true)
    try {
      const res = await savePosTableLayout({ storeCode, layout })
      if (res.success) {
        alert(t("itemsAlertSaved") || "저장되었습니다.")
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
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <LayoutGrid className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("posTableLayout") || "테이블 배치"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("posTableLayoutSub") || "매장별 테이블 위치를 드래그하여 배치합니다."}
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
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
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5"
            onClick={loadLayout}
            disabled={loading}
          >
            {t("posRefresh") || "새로고침"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5"
            onClick={handleAddTable}
          >
            <Plus className="h-4 w-4" />
            {t("posAddTable") || "테이블 추가"}
          </Button>
          <Button
            size="sm"
            className="h-10 gap-1.5"
            onClick={handleSave}
            disabled={saving || !storeCode}
          >
            <Save className="h-4 w-4" />
            {saving ? "..." : t("itemsBtnSave") || "저장"}
          </Button>
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        <div
          id="pos-floor"
          className="relative rounded-xl border-2 border-dashed bg-muted/20"
          style={{ width: FLOOR_W, height: FLOOR_H }}
        >
          {layout.map((item) => (
            <div
              key={item.id}
              className={cn(
                "absolute flex flex-col items-center justify-center rounded-lg border-2 border-primary/60 bg-primary/10 cursor-move select-none",
                "hover:border-primary hover:bg-primary/15",
                draggingId === item.id && "z-10 ring-2 ring-primary"
              )}
              style={{
                left: item.x,
                top: item.y,
                width: item.w,
                height: item.h,
              }}
              onMouseDown={(e) => handleMouseDown(e, item.id)}
            >
              {editingNameId === item.id ? (
                <Input
                  defaultValue={item.name}
                  className="h-7 w-16 px-1 text-center text-xs"
                  autoFocus
                  onBlur={(e) => handleUpdateName(item.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleUpdateName(item.id, (e.target as HTMLInputElement).value)
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="text-xs font-bold"
                  onDoubleClick={() => setEditingNameId(item.id)}
                >
                  {item.name}
                </span>
              )}
              <button
                type="button"
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-60 hover:opacity-100 transition"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveTable(item.id)
                }}
                title={t("itemsBtnDelete") || "삭제"}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {layout.length === 0 && !loading && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              {t("posTableEmpty") || "테이블 추가 버튼으로 테이블을 배치하세요."}
            </div>
          )}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {t("posTableDragHint") || "테이블을 드래그하여 이동, 더블클릭으로 이름 수정"}
        </p>
      </div>
    </div>
  )
}
