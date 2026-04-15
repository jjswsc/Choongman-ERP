"use client"
import { appAlert, appConfirm } from "@/lib/app-message"
import * as React from "react"
import { Calendar, Plus, Pencil, Trash2, BarChart3, Table2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getInteriorWorkPackages, saveInteriorWorkPackage, deleteInteriorWorkPackage, type InteriorWorkPackage } from "@/lib/api-client"

const PART_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "목공", labelKey: "interiorPartWoodwork" },
  { value: "전기", labelKey: "interiorPartElectrical" },
  { value: "에어컨", labelKey: "interiorPartHvac" },
  { value: "타일", labelKey: "interiorPartTile" },
  { value: "도장", labelKey: "interiorPartPaint" },
  { value: "주방", labelKey: "interiorPartKitchenScope" },
  { value: "기타", labelKey: "interiorPartOther" },
]

const WP_STATUS: { value: string; labelKey: string }[] = [
  { value: "planned", labelKey: "interiorWpStatusPlanned" },
  { value: "in_progress", labelKey: "interiorWpStatusInProgress" },
  { value: "blocked", labelKey: "interiorWpStatusBlocked" },
  { value: "done", labelKey: "interiorWpStatusDone" },
  { value: "cancelled", labelKey: "interiorWpStatusCancelled" },
]

const DAY_MS = 24 * 60 * 60 * 1000
const toDate = (v?: string | null) => (v ? new Date(`${v}T00:00:00`) : null)
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

function wpStatusLabel(t: (k: string) => string, status?: string | null) {
  const row = WP_STATUS.find((x) => x.value === status)
  return row ? t(row.labelKey) : status || t("interiorWpStatusPlanned")
}

export function InteriorSchedulePanel({ projectId }: { projectId: string }) {
  const t = useT(useLang().lang)
  const [list, setList] = React.useState<InteriorWorkPackage[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<InteriorWorkPackage | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)
  const [viewMode, setViewMode] = React.useState<"gantt" | "table">("gantt")
  const [partFilter, setPartFilter] = React.useState("__all__")
  const [statusFilter, setStatusFilter] = React.useState("__all__")

  const loadData = React.useCallback(() => {
    if (!projectId) return
    setLoading(true)
    getInteriorWorkPackages({ projectId }).then((r) => setList(r || [])).catch(() => setList([])).finally(() => setLoading(false))
  }, [projectId])
  React.useEffect(() => { loadData() }, [loadData])

  const handleAdd = () => setEditing({ projectId: Number(projectId), partType: "기타", title: "", description: "", startDate: null, endDate: null, status: "planned", progressPct: 0, sortOrder: list.length || 0 })
  const handleEdit = (item: InteriorWorkPackage) => setEditing({ ...item, projectId: Number(projectId) })

  const handleSave = async () => {
    if (!editing || !editing.title?.trim()) return appAlert(t("interiorWorkPackageTitleRequired"))
    if (editing.isLegacy) return appAlert(t("interiorLegacyScheduleHint"))
    const res = await saveInteriorWorkPackage({ ...editing, projectId: Number(projectId), title: editing.title.trim(), partType: editing.partType || "기타", status: editing.status || "planned", progressPct: editing.progressPct ?? 0 })
    if (!res.success) return appAlert(res.message || t("msg_save_fail"))
    setEditing(null); loadData(); await appAlert(t("msg_saved"))
  }

  const handleDelete = async (id: number) => {
    if (!await appConfirm(t("msg_delete_confirm_check_item"))) return
    setDeletingId(id)
    const res = await deleteInteriorWorkPackage({ id }).catch((e) => ({ success: false, message: String(e) }))
    setDeletingId(null)
    if (!res.success) return appAlert(res.message || t("msg_delete_fail"))
    if (editing?.id === id) setEditing(null)
    loadData()
  }

  const filtered = React.useMemo(() => list.filter((x) => (partFilter === "__all__" || (x.partType || "") === partFilter) && (statusFilter === "__all__" || (x.status || "planned") === statusFilter)), [list, partFilter, statusFilter])
  const [start, end] = React.useMemo(() => {
    const dates = filtered.flatMap((x) => [toDate(x.startDate), toDate(x.endDate)]).filter(Boolean) as Date[]
    if (!dates.length) { const now = new Date(); return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0)] }
    return [new Date(Math.min(...dates.map((d) => d.getTime())) - DAY_MS * 2), new Date(Math.max(...dates.map((d) => d.getTime())) + DAY_MS * 2)]
  }, [filtered])
  const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1)

  const partTypeLabel = (v?: string | null) => {
    const row = PART_OPTIONS.find((p) => p.value === (v || ""))
    return row ? t(row.labelKey) : v || t("interiorPartOther")
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><Calendar className="h-4 w-4 text-primary" /></div><h2 className="text-lg font-semibold">{t("interiorSchedulePageTitle")}</h2></div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={viewMode === "gantt" ? "default" : "outline"} onClick={() => setViewMode("gantt")} className="gap-1.5"><BarChart3 className="h-4 w-4" />{t("interiorViewGantt")}</Button>
            <Button size="sm" variant={viewMode === "table" ? "default" : "outline"} onClick={() => setViewMode("table")} className="gap-1.5"><Table2 className="h-4 w-4" />{t("interiorViewTable")}</Button>
            <Button size="sm" onClick={handleAdd} className="gap-1.5"><Plus className="h-4 w-4" />{t("add")}</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">{t("interiorPartFilter")}</label><Select value={partFilter} onValueChange={setPartFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">{t("all")}</SelectItem>{PART_OPTIONS.map((part) => <SelectItem key={part.value} value={part.value}>{t(part.labelKey)}</SelectItem>)}</SelectContent></Select></div>
          <div><label className="text-xs text-muted-foreground">{t("interiorStatusFilter")}</label><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">{t("all")}</SelectItem>{WP_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{t(s.labelKey)}</SelectItem>)}</SelectContent></Select></div>
        </div>

        {editing && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div><label className="text-xs text-muted-foreground">{t("interiorPart")}</label><Select value={editing.partType || "기타"} onValueChange={(value) => setEditing({ ...editing, partType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PART_OPTIONS.map((part) => <SelectItem key={part.value} value={part.value}>{t(part.labelKey)}</SelectItem>)}</SelectContent></Select></div>
              <div className="sm:col-span-2"><label className="text-xs text-muted-foreground">{t("interiorWorkPackageName")}</label><Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">{t("dateFrom")}</label><Input type="date" value={editing.startDate || ""} onChange={(e) => setEditing({ ...editing, startDate: e.target.value || null })} /></div>
              <div><label className="text-xs text-muted-foreground">{t("dateTo")}</label><Input type="date" value={editing.endDate || ""} onChange={(e) => setEditing({ ...editing, endDate: e.target.value || null })} /></div>
              <div><label className="text-xs text-muted-foreground">{t("status")}</label><Select value={editing.status || "planned"} onValueChange={(value) => setEditing({ ...editing, status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{WP_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{t(s.labelKey)}</SelectItem>)}</SelectContent></Select></div>
              <div><label className="text-xs text-muted-foreground">{t("interiorProgressPct")}</label><Input type="number" min={0} max={100} value={editing.progressPct ?? 0} onChange={(e) => setEditing({ ...editing, progressPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></div>
              <div className="sm:col-span-2 lg:col-span-3"><label className="text-xs text-muted-foreground">{t("interiorDetailText")}</label><Input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
            </div>
            <div className="flex gap-2"><Button size="sm" onClick={handleSave}>{t("save")}</Button><Button size="sm" variant="outline" onClick={() => setEditing(null)}>{t("cancel")}</Button></div>
          </div>
        )}

        <div className="rounded-lg border bg-card">
          {loading ? <div className="py-12 text-center text-sm text-muted-foreground">{t("loading")}</div> : filtered.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">{t("interiorNoScheduleForFilter")}</div> : (
            <div className="overflow-x-auto">
              {viewMode === "gantt" ? (
                <div className="min-w-[900px]">
                  <div className="grid grid-cols-[260px_1fr] border-b bg-muted/40 text-xs"><div className="px-3 py-2 font-medium">{t("interiorGanttColProcess")}</div><div className="px-3 py-2 font-medium">{ymd(start)} ~ {ymd(end)}</div></div>
                  {filtered.map((item) => {
                    const s = toDate(item.startDate) || start
                    const e = toDate(item.endDate) || s
                    const left = ((s.getTime() - start.getTime()) / DAY_MS / totalDays) * 100
                    const width = (Math.max(1, Math.floor((e.getTime() - s.getTime()) / DAY_MS) + 1) / totalDays) * 100
                    const progress = Math.max(0, Math.min(100, Number(item.progressPct ?? 0)))
                    return (
                      <div key={item.id || item.legacyId} className="grid grid-cols-[260px_1fr] border-b">
                        <button type="button" className="px-3 py-2 text-left hover:bg-muted/30" onClick={() => handleEdit(item)}><div className="truncate text-sm font-medium">{item.title || t("interiorUntitled")}</div><div className="text-[11px] text-muted-foreground">{partTypeLabel(item.partType)} · {wpStatusLabel(t, item.status)}</div></button>
                        <div className="relative h-12"><div className="absolute top-2 h-8 rounded border border-primary/40 bg-primary/20" style={{ left: `${Math.max(0, left)}%`, width: `${Math.min(100, Math.max(2, width))}%` }}><div className="h-full rounded bg-primary/40" style={{ width: `${progress}%` }} /></div></div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>{t("interiorPart")}</TableHead><TableHead>{t("interiorWorkPackageName")}</TableHead><TableHead className="w-28">{t("dateFrom")}</TableHead><TableHead className="w-28">{t("dateTo")}</TableHead><TableHead className="w-20 text-right">{t("interiorProgressPct")}</TableHead><TableHead className="w-20">{t("status")}</TableHead><TableHead className="w-20"></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((item) => (
                      <TableRow key={item.id || item.legacyId}>
                        <TableCell className="text-xs">{partTypeLabel(item.partType)}</TableCell><TableCell className="font-medium">{item.title || "—"}</TableCell><TableCell className="text-xs">{item.startDate || "—"}</TableCell><TableCell className="text-xs">{item.endDate || "—"}</TableCell><TableCell className="text-right font-mono">{Math.round(Number(item.progressPct ?? 0))}%</TableCell><TableCell className="text-xs">{wpStatusLabel(t, item.status)}</TableCell>
                        <TableCell><div className="flex gap-1"><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => item.id && handleDelete(item.id)} disabled={deletingId === item.id || !!item.isLegacy}><Trash2 className="h-3.5 w-3.5" /></Button></div></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
