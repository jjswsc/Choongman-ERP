"use client"

import * as React from "react"
import Link from "next/link"
import { FileText, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getInteriorFiles, type InteriorProjectFile } from "@/lib/api-client"

const FILE_TYPES: { value: string; labelKey: string }[] = [
  { value: "drawing", labelKey: "interiorFileKindDrawing" },
  { value: "quote", labelKey: "interiorFileKindQuote" },
]

function fileTypeLabel(t: (k: string) => string, stored?: string | null) {
  const row = FILE_TYPES.find((x) => x.value === stored)
  return row ? t(row.labelKey) : stored || "—"
}

export function InteriorRecentProjectFiles(props: {
  projectId: string
  t: (key: string) => string
  viewAllHref: string
  maxItems?: number
}) {
  const { projectId, t, viewAllHref, maxItems = 6 } = props
  const [list, setList] = React.useState<InteriorProjectFile[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!projectId) return
    setLoading(true)
    getInteriorFiles({ projectId })
      .then((r) => setList(Array.isArray(r) ? r : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [projectId])

  const recent = list.slice(0, maxItems)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-muted-foreground" />
          {t("interiorQuotesRecentFiles")}
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1" asChild>
          <Link href={viewAllHref}>
            <ExternalLink className="h-3.5 w-3.5" />
            {t("interiorFiles")}
          </Link>
        </Button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">{t("loading")}</p>
      ) : recent.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("interiorFilesEmpty")}</p>
      ) : (
        <ul className="divide-y rounded-md border bg-card text-sm">
          {recent.map((item) => (
            <li key={item.id ?? item.fileName} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                {fileTypeLabel(t, item.fileType)}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{item.fileName}</span>
              {item.filePath ? (
                <a
                  href={item.filePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
                >
                  {t("interiorDownload")}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
