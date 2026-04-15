"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ChevronDown, FileText, Wallet, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
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
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(INTERIOR_ADMIN.hub)} className="gap-1.5 shrink-0">
          <ArrowLeft className="h-4 w-4" />
          {t("interiorProjectList")}
        </Button>
        <span className="text-muted-foreground hidden sm:inline">/</span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <h1 className="truncate text-base font-semibold sm:text-lg">{t(titleKey)}</h1>
        </div>
        <Select value={projectId ? projectId : "__none__"} onValueChange={onProjectChange}>
          <SelectTrigger className="w-full min-w-[12rem] max-w-md sm:w-72">
            <SelectValue placeholder={t("interiorProjectList")} />
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs text-muted-foreground shrink-0"
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
      {selectedProject && projectId ? (
        <div className="border-b bg-muted/20 px-4 py-1.5 text-xs text-muted-foreground">
          <span className="font-mono">{selectedProject.code}</span>
          <span className="mx-1.5">·</span>
          <span>{selectedProject.name}</span>
        </div>
      ) : null}
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
