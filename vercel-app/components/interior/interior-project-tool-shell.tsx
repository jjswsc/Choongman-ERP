"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, FileText, LayoutGrid, Wallet, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getInteriorProjects, type InteriorProject } from "@/lib/api-client"
import { INTERIOR_ADMIN } from "@/lib/interior-admin-nav"
import { InteriorPageShell } from "@/components/interior/interior-page-shell"
import { InteriorProjectCompareBar } from "@/components/interior/interior-project-compare-bar"
import { cn } from "@/lib/utils"

type InteriorProjectToolShellProps = {
  toolBasePath: string
  titleKey: string
  icon: LucideIcon
  children: (projectId: string) => React.ReactNode
  allowMultiProject?: boolean
}

export function InteriorProjectToolShell({
  toolBasePath,
  titleKey,
  icon: Icon,
  children,
  allowMultiProject = false,
}: InteriorProjectToolShellProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT(useLang().lang)
  const projectId = searchParams.get("projectId")?.trim() ?? ""
  const projectIdsParam = searchParams.get("projectIds")?.trim() ?? ""
  const tabPreserve = searchParams.get("tab")?.trim() ?? ""
  const [projects, setProjects] = React.useState<InteriorProject[]>([])
  const [projectSearch, setProjectSearch] = React.useState("")

  React.useEffect(() => {
    getInteriorProjects()
      .then((r) => setProjects(r || []))
      .catch(() => setProjects([]))
  }, [])

  const replaceWithSelection = React.useCallback((ids: string[]) => {
    const next = new URLSearchParams()
    const normalized = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))
    if (normalized.length === 1) {
      next.set("projectId", normalized[0])
    } else if (normalized.length > 1) {
      next.set("projectId", normalized[0])
      next.set("projectIds", normalized.join(","))
    }
    if (tabPreserve) next.set("tab", tabPreserve)
    const q = next.toString()
    router.replace(q ? `${toolBasePath}?${q}` : toolBasePath)
  }, [router, tabPreserve, toolBasePath])

  const onProjectChange = (value: string) => {
    replaceWithSelection(value !== "__none__" ? [value] : [])
  }

  const selectedProjectIds = React.useMemo(() => {
    if (!allowMultiProject) return projectId ? [projectId] : []
    const list = projectIdsParam
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
    if (!list.length && projectId) list.push(projectId)
    return Array.from(new Set(list))
  }, [allowMultiProject, projectId, projectIdsParam])

  const selectedSet = React.useMemo(() => new Set(selectedProjectIds), [selectedProjectIds])

  const filteredProjects = React.useMemo(() => {
    const q = projectSearch.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => {
      const code = String(p.code || "").toLowerCase()
      const name = String(p.name || "").toLowerCase()
      return code.includes(q) || name.includes(q)
    })
  }, [projectSearch, projects])

  const toggleProject = (id: string) => {
    if (!allowMultiProject) {
      onProjectChange(id)
      return
    }
    const next = new Set(selectedSet)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    replaceWithSelection(Array.from(next))
  }

  const selectedProject = projects.find((p) => String(p.id) === projectId)
  const selectedProjects = React.useMemo(
    () => selectedProjectIds
      .map((id) => projects.find((p) => String(p.id) === id))
      .filter(Boolean) as InteriorProject[],
    [projects, selectedProjectIds]
  )

  return (
    <InteriorPageShell hideHeader showSubnav>
      <div className="flex flex-1 flex-col overflow-auto -mx-4 -mt-2 sm:-mx-6 lg:-mx-8">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <h1 className="truncate text-lg font-semibold">{t(titleKey)}</h1>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3 sm:px-5 sm:py-3.5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
              <div className="min-w-0 flex-1 space-y-1.5">
                {allowMultiProject ? (
                  <>
                    <Label htmlFor="interior-hub-project-search" className="text-[11px] font-medium text-muted-foreground">
                      {t("interiorHubProjectPickerLabel")} ({t("all")})
                    </Label>
                    <Input
                      id="interior-hub-project-search"
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      placeholder={t("search")}
                      className="h-10 w-full max-w-xl lg:max-w-md"
                    />
                    <div className="max-h-44 overflow-auto rounded-md border bg-background">
                      {filteredProjects.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">{t("msg_no_data")}</div>
                      ) : (
                        filteredProjects.map((p) => {
                          const id = String(p.id)
                          const active = selectedSet.has(id)
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => toggleProject(id)}
                              className={cn(
                                "flex w-full items-center gap-2 border-b px-3 py-2 text-left text-xs last:border-b-0",
                                active ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
                              )}
                            >
                              <span className="font-mono">{p.code}</span>
                              <span className="truncate text-muted-foreground">{p.name}</span>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Label htmlFor="interior-hub-project-select" className="text-[11px] font-medium text-muted-foreground">
                      {t("interiorHubProjectPickerLabel")}
                    </Label>
                    <Select value={projectId ? projectId : "__none__"} onValueChange={onProjectChange}>
                      <SelectTrigger id="interior-hub-project-select" className="h-10 w-full max-w-xl lg:max-w-md">
                        <SelectValue placeholder={t("interiorSelectProjectPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t("interiorSelectProjectPlaceholder")}</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.code} — {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" asChild>
                  <Link href={INTERIOR_ADMIN.hub}>
                    <LayoutGrid className="h-3.5 w-3.5" />
                    {t("adminInteriorProjects")}
                  </Link>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 text-xs text-muted-foreground"
                      disabled={!projectId}
                    >
                      {t("interiorProjectDocsExpenseMenu")}
                      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem asChild disabled={!projectId}>
                      <Link
                        href={
                          projectId
                            ? `${INTERIOR_ADMIN.drawings}?projectId=${encodeURIComponent(projectId)}&tab=files`
                            : "#"
                        }
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {t("interiorFiles")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild disabled={!projectId}>
                      <Link
                        href={
                          projectId
                            ? `${INTERIOR_ADMIN.costs}?projectId=${encodeURIComponent(projectId)}&tab=expense`
                            : "#"
                        }
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <Wallet className="h-3.5 w-3.5" />
                        {t("interiorExpense")}
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {allowMultiProject && selectedProjects.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3">
                {selectedProjects.map((p) => {
                  const id = String(p.id)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleProject(id)}
                      className="rounded-full border bg-background px-2.5 py-1 text-[11px] text-foreground hover:bg-muted"
                      title={t("delete")}
                    >
                      <span className="font-mono">{p.code}</span>
                      <span className="mx-1">·</span>
                      <span>{p.name}</span>
                      <span className="ml-1 text-muted-foreground">×</span>
                    </button>
                  )
                })}
              </div>
            ) : selectedProject && projectId ? (
              <div className="mt-3 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                <span className="font-mono font-medium text-foreground">{selectedProject.code}</span>
                <span className="mx-1.5">·</span>
                <span>{selectedProject.name}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {allowMultiProject && selectedProjectIds.length > 1 ? (
        <InteriorProjectCompareBar projectIds={selectedProjectIds} />
      ) : null}
      <div className="min-h-0 flex-1">
        {selectedProjectIds.length > 0 ? (
          selectedProjectIds.map((pid, idx) => {
            const p = projects.find((row) => String(row.id) === pid)
            return (
              <div key={pid} className={idx > 0 ? "border-t border-border/70" : ""}>
                {allowMultiProject && (
                  <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
                    <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("interiorProject")}</span>
                      <span className="mx-1.5">:</span>
                      <span className="font-mono text-foreground">{p?.code || pid}</span>
                      <span className="mx-1.5">·</span>
                      <span>{p?.name || ""}</span>
                    </div>
                  </div>
                )}
                {children(pid)}
              </div>
            )
          })
        ) : (
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
              {t("interiorSelectProjectPlaceholder")}
            </div>
          </div>
        )}
      </div>
    </div>
    </InteriorPageShell>
  )
}
