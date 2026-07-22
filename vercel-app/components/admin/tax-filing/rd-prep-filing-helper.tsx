"use client"

import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

/** 국세청 RD Prep / e-Filing 공식 링크 (단기 UX — .rdx는 RD Prep만 생성) */
export const RD_PREP_DOWNLOAD_URL = "https://efiling.rd.go.th/rd-cms/"
export const RD_EFILING_UPLOAD_URL = "https://efiling.rd.go.th/rd-cms/"

type Props = {
  t: (key: string) => string
  className?: string
  /** 양식별 1회 매핑 안내 본문 키 (없으면 공통 본문) */
  mappingGuideBody?: string
}

/**
 * TXT → RD Prep → .rdx → e-Filing 단축 링크 + 1회 매핑 안내.
 * ERP는 .rdx를 직접 만들 수 없으므로 직원 작업을 줄이는 UI.
 */
export function RdPrepFilingHelper({ t, className, mappingGuideBody }: Props) {
  const body = mappingGuideBody || t("accCompRdPrepMappingGuideBody")
  return (
    <div
      className={cn(
        "rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground space-y-1.5",
        className
      )}
    >
      <div className="font-medium text-foreground/90">{t("accCompRdPrepMappingGuideTitle")}</div>
      <p className="leading-relaxed whitespace-pre-line">{body}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
        <a
          href={RD_PREP_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
        >
          {t("accCompRdPrepDownloadApp")}
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
        </a>
        <a
          href={RD_EFILING_UPLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
        >
          {t("accCompRdPrepOpenEfiling")}
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
        </a>
      </div>
    </div>
  )
}
