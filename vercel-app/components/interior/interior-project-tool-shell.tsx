"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, FileText, LayoutGrid, Wallet, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
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

type InteriorProjectToolShellProps = {
  toolBasePath: string
  titleKey: string
  icon: LucideIcon
  children: (projectId: string) => React.ReactNode
}

export function InteriorProjectToolShell({
  toolBasePath,
  titleKey,
  icon: Icon,
  children,
}: InteriorProjectToolShellProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT(useLang().lang)
  const projectId = searchParams.get("projectId")?.trim() ?? ""
  const tabPreserve = searchParams.get("tab")?.trim() ?? ""
  const [projects, setProjects] = React.useState<InteriorProject[]>([])

  React.useEffect(() => {
    getInteriorProjects()
      .then((r) => setProjects(r || []))
      .catch(() => setProjects([]))
  }, [])

  const onProjectChange = (value: string) => {
    const next = new URLSearchParams()
    if (value !== "__none__") next.set("projectId", value)
    if (tabPreserve) next.set("tab", tabPreserve)
    const q = next.toString()
    router.replace(q ? `${toolBasePath}?${q}` : toolBasePath)
  }

  const selectedProject = projects.find((p) => String(p.id) === projectId)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b bg-card">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <h1 className="truncate text-base font-semibold sm:text-lg">{t(titleKey)}</h1>
        </div>

        <div className="px-4 pb-4">
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3 sm:px-5 sm:py-3.5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
              <div className="min-w-0 flex-1 space-y-1.5">
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
            {selectedProject && projectId ? (
              <div className="mt-3 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                <span className="font-mono font-medium text-foreground">{selectedProject.code}</span>
                <span className="mx-1.5">·</span>
                <span>{selectedProject.name}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {projectId ? children(projectId) : (
          <div className="mx-auto max-w-lg px-4 py-20 text-center text-sm text-muted-foreground">
            {t("interiorSelectProjectPlaceholder")}
          </div>
        )}
      </div>
    </div>
  )
}
