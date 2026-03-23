"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { useParams } from "next/navigation"
import { ListChecks, Plus, Pencil, Trash2 } from "lucide-react"
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
  getInteriorSpecifications,
  saveInteriorSpecification,
  deleteInteriorSpecification,
  type InteriorSpecification,
} from "@/lib/api-client"

function InteriorSpecificationPage() {
  const params = useParams()
  const t = useT(useLang().lang)
  const projectId = params.projectId as string
  const [list, setList] = React.useState<InteriorSpecification[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<InteriorSpecification | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)

  const loadData = React.useCallback(() => {
    if (!projectId) return
    setLoading(true)
    getInteriorSpecifications({ projectId })
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
      description: "",
      code: "",
      size: "",
      supplierCode: "",
      location: "",
    })
  }

  const handleSave = async () => {
    if (!editing || !editing.description?.trim()) {
      await appAlert(t("interiorSpecificationRequired") || "내용을 입력하세요.")
      return
    }
    try {
      const res = await saveInteriorSpecification({
        ...editing,
        projectId: Number(projectId),
        description: editing.description.trim(),
      })
      if (res.success) {
        setEditing(null)
        loadData()
        await appAlert(t("msg_saved") || "저장되었습니다.")
      } else {
        await appAlert(res.message || "저장 실패")
      }
    } catch (e) {
      await appAlert(String(e))
    }
  }

  const handleDelete = async (id: number) => {
    if (!await appConfirm(t("msg_delete_confirm_check_item") || "삭제하시겠습니까?")) return
    setDeletingId(id)
    try {
      const res = await deleteInteriorSpecification({ id })
      if (res.success) {
        loadData()
        if (editing?.id === id) setEditing(null)
      } else {
        await appAlert(res.message || "삭제 실패")
      }
    } catch (e) {
      await appAlert(String(e))
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
              <ListChecks className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">{t("interiorSpecification") || "사양서"}</h2>
          </div>
          <Button size="sm" onClick={handleAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("add") || "추가"}
          </Button>
        </div>

        {editing && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t("interiorDescription") || "내용"}</label>
                <Input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="사양 내용" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("posMenuCode") || "코드"}</label>
                <Input value={editing.code || ""} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorSizeMm") || "규격"}</label>
                <Input value={editing.size || ""} onChange={(e) => setEditing({ ...editing, size: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorSupplier") || "공급업체"}</label>
                <Input value={editing.supplierCode || ""} onChange={(e) => setEditing({ ...editing, supplierCode: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorLocation") || "위치"}</label>
                <Input value={editing.location || ""} onChange={(e) => setEditing({ ...editing, location: e.target.value })} />
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
            <div className="py-12 text-center text-sm text-muted-foreground">{t("loading") || "불러오는 중..."}</div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("msg_click_query") || "사양서 항목을 추가해 주세요."}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("interiorDescription") || "내용"}</TableHead>
                  <TableHead className="w-24">{t("posMenuCode") || "코드"}</TableHead>
                  <TableHead className="w-24">{t("interiorSizeMm") || "규격"}</TableHead>
                  <TableHead className="w-28">{t("interiorSupplier") || "공급업체"}</TableHead>
                  <TableHead className="w-28">{t("interiorLocation") || "위치"}</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="font-mono text-xs">{item.code || "—"}</TableCell>
                    <TableCell className="text-xs">{item.size || "—"}</TableCell>
                    <TableCell className="text-xs">{item.supplierCode || "—"}</TableCell>
                    <TableCell className="text-xs">{item.location || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => item.id && handleDelete(item.id)} disabled={deletingId === item.id}><Trash2 className="h-3.5 w-3.5" /></Button>
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

export default InteriorSpecificationPage
