"use client"

import * as React from "react"
import { CalendarRange, ClipboardList } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type MarketingHubRecordScheduleCardProps = {
  disabled?: boolean
  className?: string
  campaignId: string
  hubDesignStartDate: string
  hubDesignEndDate: string
  onHubDesignStartDateChange: (v: string) => void
  onHubDesignEndDateChange: (v: string) => void
  designOutOfRange?: boolean
  /** null이면 집행·노출(또는 매장 노출) 블록을 렌더하지 않음 */
  executionTitle?: string | null
  executionNote?: React.ReactNode
  executionFromLabel?: string
  executionToLabel?: string
  executionFromValue?: string
  executionToValue?: string
  onExecutionFromChange?: (v: string) => void
  onExecutionToChange?: (v: string) => void
  /** 하단에 「저장 시 캠페인 준비 일정 반영」 안내 */
  showBundledSaveHint?: boolean
  inputVariant?: "default" | "compact"
}

export function MarketingHubRecordScheduleCard({
  disabled = false,
  className,
  campaignId,
  hubDesignStartDate,
  hubDesignEndDate,
  onHubDesignStartDateChange,
  onHubDesignEndDateChange,
  designOutOfRange = false,
  executionTitle,
  executionNote,
  executionFromLabel,
  executionToLabel,
  executionFromValue,
  executionToValue,
  onExecutionFromChange,
  onExecutionToChange,
  showBundledSaveHint = true,
  inputVariant = "default",
}: MarketingHubRecordScheduleCardProps) {
  const { lang } = useLang()
  const t = useT(lang)

  const tr = React.useCallback(
    (ko: string, en: string, th: string) => {
      if (lang === "en") return en
      if (lang === "th") return th
      if (lang === "ko") return ko
      return en
    },
    [lang]
  )

  const showExecution =
    executionTitle != null &&
    executionFromLabel != null &&
    executionToLabel != null &&
    executionFromValue != null &&
    executionToValue != null &&
    onExecutionFromChange != null &&
    onExecutionToChange != null

  const inputCn = inputVariant === "compact" ? "mt-1 h-9" : "h-10"
  const prepInputCn = inputVariant === "compact" ? "mt-1 h-9" : "h-10"

  return (
    <div
      className={cn(
        "rounded-xl border border-dashed p-4",
        designOutOfRange
          ? "border-amber-500/45 bg-amber-500/[0.07] dark:border-amber-400/35 dark:bg-amber-950/20"
          : "border-primary/25 bg-muted/20",
        className
      )}
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
        {t("marketingCampaignFinderPrepPeriodLabel")}
      </div>
      <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground sm:text-[11px]">
        {t("marketingCampaignFinderPrepPeriodHint")}
      </p>
      {!campaignId.trim() ? (
        <p className="text-xs text-muted-foreground">{t("marketingHubRecordPrepNeedCampaign")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-medium">{tr("시작", "From", "เริ่ม")}</Label>
            <Input
              type="date"
              className={prepInputCn}
              disabled={disabled}
              value={hubDesignStartDate}
              onChange={(e) => onHubDesignStartDateChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium">{tr("종료", "To", "ถึง")}</Label>
            <Input
              type="date"
              className={prepInputCn}
              disabled={disabled}
              value={hubDesignEndDate}
              onChange={(e) => onHubDesignEndDateChange(e.target.value)}
            />
          </div>
        </div>
      )}

      {showBundledSaveHint && campaignId.trim() ? (
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground sm:text-[11px]">
          {t("marketingHubRecordPrepSaveBundledHint")}
        </p>
      ) : null}

      {showExecution ? (
        <>
          <div className="my-4 border-t border-border/60" />
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarRange className="h-4 w-4 shrink-0 text-primary" />
            {executionTitle}
          </div>
          {executionNote ? <div className="mb-3 text-[10px] text-muted-foreground sm:text-[11px]">{executionNote}</div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">{executionFromLabel}</Label>
              <Input
                type="date"
                className={inputCn}
                disabled={disabled}
                value={executionFromValue}
                onChange={(e) => onExecutionFromChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">{executionToLabel}</Label>
              <Input
                type="date"
                className={inputCn}
                disabled={disabled}
                value={executionToValue}
                onChange={(e) => onExecutionToChange(e.target.value)}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
