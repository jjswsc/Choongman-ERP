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
  HandCoins,
  LayoutPanelTop,
  PackageSearch,
  UtensilsCrossed,
  FileText,
  Wallet,
  LayoutGrid,
  AlertTriangle,
  CalendarClock,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { AdminEmptyState } from "@/components/erp/admin-empty-state"
import { AdminFilterBar, AdminFilterField } from "@/components/erp/admin-filter-bar"
import { AdminTableSkeleton } from "@/components/erp/admin-table-skeleton"
import { InteriorPageShell } from "@/components/interior/interior-page-shell"
import { InteriorDashboardKpiCard } from "@/components/interior/interior-dashboard-kpi-card"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getInteriorProjects,
  getInteriorDashboardSummary,
  saveInteriorProject,
  deleteInteriorProject,
  type InteriorProject,
  type InteriorProjectDashboardRow,
} from "@/lib/api-client"
import { InteriorProjectFormDialog } from "@/components/interior/interior-project-form-dialog"
import { INTERIOR_ADMIN, withInteriorProjectId, withInteriorVendorsHref } from "@/lib/interior-admin-nav"
import { cn } from "@/lib/utils"

function statusBadgeClass(status: string) {
  if (status === "completed") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
  if (status === "hold") return "bg-amber-500/15 text-amber-800 dark:text-amber-400"
  return "bg-primary/10 text-primary"
}

export default function InteriorPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const router = useRouter()
  const [list, setList] = React.useState<InteriorProject[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingProject, setEditingProject] = React.useState<InteriorProject | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)
  const [dash, setDash] = React.useState<{
    totals: NonNullable<Awaited<ReturnType<typeof getInteriorDashboardSummary>>["totals"]>
    projects: InteriorProjectDashboardRow[]
  } | null>(null)
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("__all__")
  const [alertOnly, setAlertOnly] = React.useState(false)

  const projectMeta = React.useMemo(() => {
    const map = new Map<number, InteriorProjectDashboardRow>()
    for (const row of dash?.projects ?? []) {
      if (row.id) map.set(row.id, row)
    }
    return map
  }, [dash?.projects])

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
        if (cancelled || !s?.totals) return
        setDash({
          totals: s.totals,
          projects: s.projects ?? [],
        })
      })
      .catch(() => {
        if (!cancelled) setDash(null)
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
    getInteriorDashboardSummary()
      .then((s) => {
        if (s?.totals) setDash({ totals: s.totals, projects: s.projects ?? [] })
      })
      .catch(() => {})
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

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return list.filter((p) => {
      if (statusFilter !== "__all__" && (p.status || "active") !== statusFilter) return false
      const meta = p.id ? projectMeta.get(p.id) : undefined
      if (alertOnly && !meta?.hasAlert) return false
      if (!q) return true
      return (
        String(p.code || "").toLowerCase().includes(q) ||
        String(p.name || "").toLowerCase().includes(q) ||
        String(p.location || "").toLowerCase().includes(q)
      )
    })
  }, [list, search, statusFilter, alertOnly, projectMeta])

  const totals = dash?.totals

  return (
    <InteriorPageShell
      icon={Layout}
      title={t("interiorProjectList")}
      subtitle={t("interiorHubPageSub")}
    >
      <div className="mb-4 flex items-center justify-end gap-2">
        <Button size="sm" onClick={handleAdd} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t("add")}
        </Button>
      </div>

      {totals ? (
        <div className="mb-4 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("interiorDashboardRiskSummary")}
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <InteriorDashboardKpiCard
              label={t("interiorDashMetricActiveProjects")}
              value={totals.activeProjectCount}
              icon={LayoutGrid}
              href={INTERIOR_ADMIN.hub}
              cta={t("interiorKpiGoProjects")}
            />
            <InteriorDashboardKpiCard
              label={t("interiorDashMetricScheduleLate")}
              value={totals.scheduleOverdueCount}
              icon={CalendarClock}
              href={INTERIOR_ADMIN.schedule}
              cta={t("interiorKpiGoSchedule")}
              warn
            />
            <InteriorDashboardKpiCard
              label={t("interiorDashMetricVendorDelayed")}
              value={totals.vendorDelayedCount}
              icon={HandCoins}
              href={withInteriorVendorsHref(undefined, "tracks")}
              cta={t("interiorKpiGoVendors")}
              warn
            />
            <InteriorDashboardKpiCard
              label={t("interiorDashMetricOverBudget")}
              value={totals.overBudgetProjectCount}
              icon={Wallet}
              href={`${INTERIOR_ADMIN.costs}?tab=expense`}
              cta={t("interiorKpiGoCosts")}
              danger
            />
            <InteriorDashboardKpiCard
              label={t("interiorDashMetricProjectsAlert")}
              value={totals.projectsWithAnyAlert}
              icon={AlertTriangle}
              href={INTERIOR_ADMIN.hub}
              cta={t("interiorHubFilterAlertOnly")}
              danger
            />
          </div>
        </div>
      ) : null}

      <p className="mb-4 max-w-4xl text-xs leading-relaxed text-muted-foreground">{t("interiorGlossaryHint")}</p>

      <AdminFilterBar className="mb-4">
        <AdminFilterField label={t("interiorHubFilterSearch")} className="min-w-[12rem] flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="h-9"
          />
        </AdminFilterField>
        <AdminFilterField label={t("interiorHubFilterStatus")}>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[8.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("all")}</SelectItem>
              <SelectItem value="active">{t("interiorProjStatusActive")}</SelectItem>
              <SelectItem value="hold">{t("interiorProjStatusHold")}</SelectItem>
              <SelectItem value="completed">{t("interiorProjStatusCompleted")}</SelectItem>
            </SelectContent>
          </Select>
        </AdminFilterField>
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs">
          <Checkbox checked={alertOnly} onCheckedChange={(v) => setAlertOnly(v === true)} />
          {t("interiorHubFilterAlertOnly")}
        </label>
      </AdminFilterBar>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <AdminTableSkeleton columns={8} rows={6} />
          ) : filtered.length === 0 ? (
            <AdminEmptyState
              icon={LayoutGrid}
              title={t("interiorEmptyProjectTitle")}
              description={list.length === 0 ? t("interiorEmptyProjectDesc") : t("msg_no_data")}
              action={
                list.length === 0 ? (
                  <Button size="sm" onClick={handleAdd} className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    {t("add")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24 text-center">{t("interiorProjectCode")}</TableHead>
                  <TableHead className="text-center">{t("interiorProjectName")}</TableHead>
                  <TableHead className="w-24 text-center">{t("status")}</TableHead>
                  <TableHead className="min-w-[10rem] text-center">{t("interiorBudgetUsage")}</TableHead>
                  <TableHead className="w-36 text-center">{t("interiorAlertSchedule")}</TableHead>
                  <TableHead className="w-24 text-center">{t("dateFrom")}</TableHead>
                  <TableHead className="w-24 text-center">{t("dateTo")}</TableHead>
                  <TableHead className="w-28 text-center">{t("interiorMoreActions")}</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const meta = p.id ? projectMeta.get(p.id) : undefined
                  const budget = p.budgetTotal ?? 0
                  const spent = meta?.paidTotal ?? 0
                  const usagePct = budget > 0 ? Math.round((spent / budget) * 100) : null
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(p)}
                    >
                      <TableCell className="font-mono text-xs">{p.code}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-center">
                        <span className={cn("text-xs rounded-full px-2 py-0.5", statusBadgeClass(p.status || "active"))}>
                          {statusLabel(p.status || "active")}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {budget > 0 ? (
                          <div className="space-y-1">
                            <div className="font-mono tabular-nums">
                              ฿{spent.toLocaleString()} / ฿{budget.toLocaleString()}
                            </div>
                            <div className="mx-auto h-1.5 max-w-[8rem] overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  meta?.overBudget ? "bg-destructive" : usagePct != null && usagePct >= 85 ? "bg-amber-500" : "bg-primary"
                                )}
                                style={{ width: `${Math.min(100, usagePct ?? 0)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap justify-center gap-1">
                          {(meta?.scheduleLateCount ?? 0) > 0 ? (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                              {t("interiorAlertSchedule")} {meta?.scheduleLateCount}
                            </span>
                          ) : null}
                          {(meta?.vendorDelayedCount ?? 0) > 0 ? (
                            <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-800 dark:text-orange-300">
                              {t("interiorAlertVendor")} {meta?.vendorDelayedCount}
                            </span>
                          ) : null}
                          {meta?.overBudget ? (
                            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
                              {t("interiorAlertBudget")}
                            </span>
                          ) : null}
                          {!meta?.hasAlert ? <span className="text-muted-foreground">—</span> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground text-center">
                        {p.startDate ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground text-center">
                        {p.endDate ?? "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()} className="text-center">
                        {p.id ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                                {t("interiorMoreActions")}
                                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem asChild>
                                <Link href={withInteriorProjectId(INTERIOR_ADMIN.schedule, p.id)} className="gap-2">
                                  <Calendar className="h-3.5 w-3.5" />
                                  {t("interiorSchedule")}
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={withInteriorVendorsHref(p.id, "tracks")} className="gap-2">
                                  <HandCoins className="h-3.5 w-3.5" />
                                  {t("interiorVendorsHub")}
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={withInteriorProjectId(INTERIOR_ADMIN.specs, p.id, "materials")} className="gap-2">
                                  <PackageSearch className="h-3.5 w-3.5" />
                                  {t("interiorHubSpecs")}
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={withInteriorProjectId(INTERIOR_ADMIN.drawings, p.id, "layout")} className="gap-2">
                                  <LayoutPanelTop className="h-3.5 w-3.5" />
                                  {t("interiorLayoutItems")}
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={withInteriorProjectId(INTERIOR_ADMIN.drawings, p.id, "files")} className="gap-2">
                                  <FileText className="h-3.5 w-3.5" />
                                  {t("interiorFiles")}
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={withInteriorProjectId(INTERIOR_ADMIN.kitchen, p.id)} className="gap-2">
                                  <UtensilsCrossed className="h-3.5 w-3.5" />
                                  {t("interiorKitchen")}
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={withInteriorProjectId(INTERIOR_ADMIN.costs, p.id, "expense")} className="gap-2">
                                  <Wallet className="h-3.5 w-3.5" />
                                  {t("interiorExpense")}
                                </Link>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <InteriorProjectFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editingProject}
        onSave={handleSave}
        t={t}
      />
    </InteriorPageShell>
  )
}
