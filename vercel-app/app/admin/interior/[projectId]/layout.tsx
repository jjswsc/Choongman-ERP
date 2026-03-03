"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, usePathname, useRouter } from "next/navigation"
import { ArrowLeft, Calendar, UtensilsCrossed, ListChecks, FileText, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getInteriorProjects, type InteriorProject } from "@/lib/api-client"

const tabs = [
  { key: "schedule", href: (id: string) => `/admin/interior/${id}/schedule`, icon: Calendar, titleKey: "interiorSchedule" },
  { key: "kitchen", href: (id: string) => `/admin/interior/${id}/kitchen`, icon: UtensilsCrossed, titleKey: "interiorKitchen" },
  { key: "specification", href: (id: string) => `/admin/interior/${id}/specification`, icon: ListChecks, titleKey: "interiorSpecification" },
]

export default function InteriorProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const t = useT(useLang().lang)
  const projectId = params.projectId as string
  const [project, setProject] = React.useState<InteriorProject | null>(null)

  React.useEffect(() => {
    if (!projectId) return
    getInteriorProjects()
      .then((list) => {
        const p = list?.find((x) => String(x.id) === String(projectId))
        setProject(p || null)
      })
      .catch(() => setProject(null))
  }, [projectId])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/admin/interior")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {t("interiorProjectList") || "프로젝트 목록"}
          </Button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">
            {project ? `${project.code} - ${project.name}` : projectId}
          </span>
        </div>
      </div>

      <div className="flex gap-1 border-b px-4 py-2 bg-muted/30 items-center">
        {tabs.map((tab) => {
          const href = tab.href(projectId)
          const active = pathname === href || pathname.startsWith(href + "/")
          const Icon = tab.icon
          return (
            <Link key={tab.key} href={href}>
              <Button
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
              >
                <Icon className="h-4 w-4" />
                {t(tab.titleKey) || tab.key}
              </Button>
            </Link>
          )
        })}
        <span className="flex-1" />
        <div className="flex gap-1 text-xs">
          <Link
            href={`/admin/interior-estimates?projectId=${projectId}`}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <FileText className="h-3.5 w-3.5" />
            {t("interiorFiles") || "도면·견적서"}
          </Link>
          <Link
            href={`/admin/interior-expense?projectId=${projectId}`}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <Wallet className="h-3.5 w-3.5" />
            {t("interiorExpense") || "비용/결제"}
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  )
}
