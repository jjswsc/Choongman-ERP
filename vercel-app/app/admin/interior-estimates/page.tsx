"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { FileText } from "lucide-react"
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
import { InteriorFilesContent } from "@/components/interior/interior-files-content"

export default function InteriorEstimatesPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useT(useLang().lang)
  const [projects, setProjects] = React.useState<InteriorProject[]>([])
  const projectId = searchParams.get("projectId") ?? ""

  React.useEffect(() => {
    getInteriorProjects()
      .then((r) => setProjects(r || []))
      .catch(() => setProjects([]))
  }, [])

  const handleProjectChange = (id: string) => {
    router.replace(`/admin/interior-estimates?projectId=${id}`)
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">
              {t("interiorFiles") || "도면·견적서"}
            </h2>
          </div>
          <Select
            value={projectId || "none"}
            onValueChange={(v) => (v === "none" ? router.replace("/admin/interior-estimates") : handleProjectChange(v))}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder={t("interiorProjectList") || "프로젝트 선택"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {t("interiorProjectList") || "프로젝트 선택"}
              </SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.code} - {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {projectId ? (
          <InteriorFilesContent projectId={projectId} t={t} />
        ) : (
          <div className="rounded-lg border bg-card py-16 text-center text-sm text-muted-foreground">
            {t("interiorProjectList") || "프로젝트를 선택하세요"}
          </div>
        )}

        <div className="text-xs">
          <Link href="/admin/interior" className="text-primary hover:underline">
            ← {t("interiorProjectList") || "프로젝트 목록"}
          </Link>
        </div>
      </div>
    </div>
  )
}
