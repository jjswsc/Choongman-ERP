"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { Calendar, Plus, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getInteriorSchedule,
  saveInteriorScheduleItem,
  deleteInteriorScheduleItem,
  type InteriorScheduleItem,
} from "@/lib/api-client"

export default function InteriorSchedulePage() {
  const params = useParams()
  const t = useT(useLang().lang)
  const projectId = params.projectId as string
  const [list, setList] = React.useState<InteriorScheduleItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<InteriorScheduleItem | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)

  const loadData = React.useCallback(() => {
    if (!projectId) return
    setLoading(true)
    getInteriorSchedule({ projectId })
      .then((r) => setList(r || []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [projectId])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleAdd = () => {
    setEditing({
      projectId: Number(projectId),
      workDetail: "",
      itemNo: (list.length || 0) + 1,
      startDate: null,
      endDate: null,
      sortOrder: list.length || 0,
    })
  }

  const handleEdit = (item: InteriorScheduleItem) => {
    setEditing({ ...item, projectId: Number(projectId) })
  }

  const handleSave = async () => {
    if (!editing || !editing.workDetail?.trim()) {
      alert(t("interiorWorkDetailRequired") || "작업 내용을 입력하세요.")
      return
    }
    try {
      const res = await saveInteriorScheduleItem({
        id: editing.id,
        projectId: Number(projectId),
        workDetail: editing.workDetail.trim(),
        itemNo: editing.itemNo ?? 0,
        startDate: editing.startDate || null,
        endDate: editing.endDate || null,
        sortOrder: editing.sortOrder ?? 0,
      })
      if (res.success) {
        setEditing(null)
        loadData()
        alert(t("msg_saved") || "저장되었습니다.")
      } else {
        alert(res.message || "저장 실패")
      }
    } catch (e) {
      alert(String(e))
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t("msg_delete_confirm_check_item") || "삭제하시겠습니까?")) return
    setDeletingId(id)
    try {
      const res = await deleteInteriorScheduleItem({ id })
      if (res.success) {
        loadData()
        if (editing?.id === id) setEditing(null)
      } else {
        alert(res.message || "삭제 실패")
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">
              {t("interiorSchedule") || "일정"}
            </h2>
          </div>
          <Button size="sm" onClick={handleAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("add") || "추가"}
          </Button>
        </div>

        {editing && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="text-sm font-medium">{editing.id ? (t("edit") || "수정") : (t("add") || "추가")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t("interiorWorkDetail") || "작업 내용"}</label>
                <Input
                  value={editing.workDetail || ""}
                  onChange={(e) => setEditing({ ...editing, workDetail: e.target.value })}
                  placeholder="예: 기초공사, 배선"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("dateFrom") || "시작일"}</label>
                <Input
                  type="date"
                  value={editing.startDate || ""}
                  onChange={(e) => setEditing({ ...editing, startDate: e.target.value || null })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("dateTo") || "종료일"}</label>
                <Input
                  type="date"
                  value={editing.endDate || ""}
                  onChange={(e) => setEditing({ ...editing, endDate: e.target.value || null })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave}>{t("save") || "저장"}</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>{t("cancel") || "취소"}</Button>
            </div>
          </div>
        )}

        <div className="rounded-lg border bg-card">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t("loading") || "불러오는 중..."}
            </div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t("msg_click_query") || "일정 항목을 추가해 주세요."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>{t("interiorWorkDetail") || "작업 내용"}</TableHead>
                  <TableHead className="w-28">{t("dateFrom") || "시작일"}</TableHead>
                  <TableHead className="w-28">{t("dateTo") || "종료일"}</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.itemNo ?? item.sortOrder ?? ""}</TableCell>
                    <TableCell className="font-medium">{item.workDetail}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.startDate ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.endDate ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
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
