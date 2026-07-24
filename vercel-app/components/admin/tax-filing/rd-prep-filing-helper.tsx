"use client"

import { ExternalLink, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** 국세청 RD Prep / e-Filing 공식 링크 (단기 UX — .rdx는 RD Prep만 생성) */
export const RD_PREP_DOWNLOAD_URL = "https://efiling.rd.go.th/rd-cms/"
export const RD_EFILING_UPLOAD_URL = "https://efiling.rd.go.th/rd-cms/"

type Props = {
  t: (key: string) => string
  className?: string
  /** 양식별 1회 매핑 안내 본문 키 (없으면 공통 본문) */
  mappingGuideBody?: string
  /** compact: 필터 행용 아이콘+팝오버 / panel: 본문 안내용 카드 */
  variant?: "compact" | "panel"
}

function RdPrepGuideBody({
  t,
  mappingGuideBody,
}: {
  t: (key: string) => string
  mappingGuideBody?: string
}) {
  const body = mappingGuideBody || t("accCompRdPrepMappingGuideBody")
  return (
    <div className="space-y-2.5 text-xs">
      <p className="leading-relaxed text-muted-foreground whitespace-pre-line">
        {t("accCompRdFilingWorkflowNote")}
      </p>
      <div className="rounded-md bg-muted/40 px-2.5 py-2 space-y-1">
        <div className="font-medium text-foreground/90">{t("accCompRdPrepMappingGuideTitle")}</div>
        <p className="leading-relaxed text-muted-foreground whitespace-pre-line">{body}</p>
      </div>
      <div className="flex flex-wrap gap-2 pt-0.5">
        <a
          href={RD_PREP_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted/50"
        >
          {t("accCompRdPrepDownloadApp")}
          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        </a>
        <a
          href={RD_EFILING_UPLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted/50"
        >
          {t("accCompRdPrepOpenEfiling")}
          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        </a>
      </div>
    </div>
  )
}

/**
 * TXT → RD Prep → .rdx → e-Filing 단축 링크 + 1회 매핑 안내.
 * ERP는 .rdx를 직접 만들 수 없으므로 직원 작업을 줄이는 UI.
 */
export function RdPrepFilingHelper({ t, className, mappingGuideBody, variant = "panel" }: Props) {
  if (variant === "compact") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-9 w-9 shrink-0 text-muted-foreground", className)}
            aria-label={t("accCompRdPrepMappingGuideTitle")}
            title={t("accCompRdPrepHelpAria")}
          >
            <Info className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[min(100vw-2rem,22rem)] p-3" sideOffset={6}>
          <RdPrepGuideBody t={t} mappingGuideBody={mappingGuideBody} />
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div className={cn("rounded-md border border-border/60 bg-muted/15 px-3 py-2.5", className)}>
      <RdPrepGuideBody t={t} mappingGuideBody={mappingGuideBody} />
    </div>
  )
}
