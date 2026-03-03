"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Layout, Plus, Pencil, Trash2, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
  getInteriorProjects,
  saveInteriorProject,
  deleteInteriorProject,
  type InteriorProject,
} from "@/lib/api-client"
import { InteriorProjectFormDialog } from "@/components/interior/interior-project-form-dialog"

export default function InteriorPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const router = useRouter()
  const [list, setList] = React.useState<InteriorProject[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingProject, setEditingProject] = React.useState<InteriorProject | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)

  const loadData = React.useCallback(() => {
    setLoading(true)
    getInteriorProjects()
      .then((r) => setList(r || []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleAdd = () => {
    setEditingProject(null)
    setDialogOpen(true)
  }

  const handleEdit = (p: InteriorProject) => {
    setEditingProject(p)
    setDialogOpen(true)
  }

  const handleSave = async (data: Partial<InteriorProject> & { code: string; name: string }) => {
    const res = await saveInteriorProject(data)
    if (!res.success) {
      throw new Error(res.message || "저장 실패")
    }
    loadData()
    alert(t("msg_saved") || "저장되었습니다.")
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t("msg_delete_confirm_check_item") || "이 프로젝트를 삭제하시겠습니까? (관련 데이터 모두 삭제)")) return
    setDeletingId(id)
    try {
      const res = await deleteInteriorProject({ id })
      if (res.success) {
        loadData()
        if (editingProject?.id === id) setDialogOpen(false)
      } else {
        alert(res.message || "삭제 실패")
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setDeletingId(null)
    }
  }

  const handleRowClick = (p: InteriorProject) => {
    if (p.id) {
      router.push(`/admin/interior/${p.id}/schedule`)
    }
  }

  const statusLabel = (s: string) => {
    const m: Record<string, string> = { active: "진행중", completed: "완료", hold: "보류" }
    return m[s] || s
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Layout className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              {t("interiorProjectList") || "인테리어 프로젝트"}
            </h1>
          </div>
          <Button size="sm" onClick={handleAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("add") || "추가"}
          </Button>
        </div>

        <Card>
          <CardContent className="pt-4">
            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {t("loading") || "불러오는 중..."}
              </div>
            ) : list.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {t("msg_click_query") || "프로젝트를 추가해 주세요."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">{t("posMenuCode") || "코드"}</TableHead>
                    <TableHead>{t("posMenuName") || "프로젝트명"}</TableHead>
                    <TableHead className="w-24">{t("status") || "상태"}</TableHead>
                    <TableHead className="w-28 text-right">{t("interiorBudget") || "예산"}</TableHead>
                    <TableHead className="w-24">{t("dateFrom") || "시작"}</TableHead>
                    <TableHead className="w-24">{t("dateTo") || "종료"}</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(p)}
                    >
                      <TableCell className="font-mono text-xs">{p.code}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        <span className="text-xs rounded-full px-2 py-0.5 bg-muted">
                          {statusLabel(p.status || "active")}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {(p.budgetTotal ?? 0) > 0 ? `฿${(p.budgetTotal ?? 0).toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.startDate ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.endDate ?? "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleEdit(p)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => p.id && handleDelete(p.id)}
                            disabled={deletingId === p.id}
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
          </CardContent>
        </Card>
      </div>

      <InteriorProjectFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editingProject}
        onSave={handleSave}
        t={t}
      />
    </div>
  )
}
