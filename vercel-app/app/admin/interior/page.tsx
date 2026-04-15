"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Layout,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  CalendarClock,
  HandCoins,
  LayoutPanelTop,
  PackageSearch,
  UtensilsCrossed,
  FileText,
  Wallet,
  LayoutGrid,
  AlertTriangle,
} from "lucide-react"
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
  getInteriorDashboardSummary,
  saveInteriorProject,
  deleteInteriorProject,
  type InteriorProject,
  type InteriorDashboardTotals,
} from "@/lib/api-client"
import { InteriorProjectFormDialog } from "@/components/interior/interior-project-form-dialog"
import { INTERIOR_ADMIN, withInteriorProjectId } from "@/lib/interior-admin-nav"

export default function InteriorPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const router = useRouter()
  const [list, setList] = React.useState<InteriorProject[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingProject, setEditingProject] = React.useState<InteriorProject | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)
  const [dashTotals, setDashTotals] = React.useState<InteriorDashboardTotals | null>(null)

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

  React.useEffect(() => {
    let cancelled = false
    getInteriorDashboardSummary()
      .then((s) => {
        if (!cancelled && s?.totals) setDashTotals(s.totals)
      })
      .catch(() => {
        if (!cancelled) setDashTotals(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

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
      throw new Error(res.message || t("msg_save_fail"))
    }
    loadData()
    await appAlert(t("msg_saved"))
  }

  const handleDelete = async (id: number) => {
    if (!await appConfirm(t("interiorProjectDeleteConfirmFull"))) return
    setDeletingId(id)
    try {
      const res = await deleteInteriorProject({ id })
      if (res.success) {
        loadData()
        if (editingProject?.id === id) setDialogOpen(false)
      } else {
        await appAlert(res.message || t("msg_delete_fail"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setDeletingId(null)
    }
  }

  const handleRowClick = (p: InteriorProject) => {
    if (p.id) {
      router.push(withInteriorProjectId(INTERIOR_ADMIN.schedule, p.id))
    }
  }

  const statusLabel = (s: string) => {
    const m: Record<string, string> = {
      active: t("interiorProjStatusActive"),
      completed: t("interiorProjStatusCompleted"),
      hold: t("interiorProjStatusHold"),
    }
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
              {t("interiorProjectList")}
            </h1>
          </div>
          <Button size="sm" onClick={handleAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("add")}
          </Button>
        </div>

        {dashTotals ? (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t("interiorDashboardRiskSummary")}
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <LayoutGrid className="h-4 w-4" />
                  <span className="text-xs font-medium">{t("interiorDashMetricActiveProjects")}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{dashTotals.activeProjectCount}</p>
              </div>
              <div
                className={`rounded-lg border p-3 shadow-sm ${
                  dashTotals.scheduleOverdueCount > 0 ? "border-amber-500/50 bg-amber-500/5" : "bg-card"
                }`}
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarClock className="h-4 w-4" />
                  <span className="text-xs font-medium">{t("interiorDashMetricScheduleLate")}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{dashTotals.scheduleOverdueCount}</p>
              </div>
              <div
                className={`rounded-lg border p-3 shadow-sm ${
                  dashTotals.vendorDelayedCount > 0 ? "border-amber-500/50 bg-amber-500/5" : "bg-card"
                }`}
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <HandCoins className="h-4 w-4" />
                  <span className="text-xs font-medium">{t("interiorDashMetricVendorDelayed")}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{dashTotals.vendorDelayedCount}</p>
              </div>
              <div
                className={`rounded-lg border p-3 shadow-sm ${
                  dashTotals.overBudgetProjectCount > 0 ? "border-destructive/40 bg-destructive/5" : "bg-card"
                }`}
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Wallet className="h-4 w-4" />
                  <span className="text-xs font-medium">{t("interiorDashMetricOverBudget")}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{dashTotals.overBudgetProjectCount}</p>
              </div>
              <div
                className={`rounded-lg border p-3 shadow-sm ${
                  dashTotals.projectsWithAnyAlert > 0 ? "border-destructive/40 bg-destructive/5" : "bg-card"
                }`}
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs font-medium">{t("interiorDashMetricProjectsAlert")}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{dashTotals.projectsWithAnyAlert}</p>
              </div>
            </div>
          </div>
        ) : null}

        <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">{t("interiorGlossaryHint")}</p>

        <Card>
          <CardContent className="pt-4">
            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {t("loading")}
              </div>
            ) : list.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {t("interiorProjectEmptyHint")}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">{t("posMenuCode")}</TableHead>
                    <TableHead>{t("posMenuName")}</TableHead>
                    <TableHead className="w-24">{t("status")}</TableHead>
                    <TableHead className="w-28 text-right">{t("interiorBudget")}</TableHead>
                    <TableHead className="w-24">{t("dateFrom")}</TableHead>
                    <TableHead className="w-24">{t("dateTo")}</TableHead>
                    <TableHead className="min-w-[10rem]">{t("interiorToolShortcuts")}</TableHead>
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
                      <TableCell onClick={(e) => e.stopPropagation()} className="align-top">
                        {p.id ? (
                          <div className="flex max-w-[14rem] flex-wrap justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild title={t("interiorSchedule")}>
                              <Link href={withInteriorProjectId(INTERIOR_ADMIN.schedule, p.id)}><Calendar className="h-3.5 w-3.5" /></Link>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild title={t("interiorVendorTracks")}>
                              <Link href={withInteriorProjectId(INTERIOR_ADMIN.vendors, p.id)}><HandCoins className="h-3.5 w-3.5" /></Link>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild title={t("interiorHubSpecs")}>
                              <Link href={withInteriorProjectId(INTERIOR_ADMIN.specs, p.id, "materials")}><PackageSearch className="h-3.5 w-3.5" /></Link>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild title={t("interiorLayoutItems")}>
                              <Link href={withInteriorProjectId(INTERIOR_ADMIN.drawings, p.id, "layout")}><LayoutPanelTop className="h-3.5 w-3.5" /></Link>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild title={t("interiorFiles")}>
                              <Link href={withInteriorProjectId(INTERIOR_ADMIN.drawings, p.id, "files")}><FileText className="h-3.5 w-3.5" /></Link>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild title={t("interiorKitchen")}>
                              <Link href={withInteriorProjectId(INTERIOR_ADMIN.kitchen, p.id)}><UtensilsCrossed className="h-3.5 w-3.5" /></Link>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild title={t("interiorExpense")}>
                              <Link href={withInteriorProjectId(INTERIOR_ADMIN.costs, p.id, "expense")}><Wallet className="h-3.5 w-3.5" /></Link>
                            </Button>
                          </div>
                        ) : null}
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
