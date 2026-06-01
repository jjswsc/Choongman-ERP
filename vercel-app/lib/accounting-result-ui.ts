import { cn } from "@/lib/utils"

/** 회계·세무 검색 결과 영역 공통 스타일 */
export const accountingResultTableShellCn =
  "overflow-x-auto rounded-lg border border-border/80 bg-card shadow-sm"

export const accountingResultTableCn = "w-full text-sm border-collapse min-w-max"

export const accountingResultTheadRowCn = "border-b bg-muted/50"

export const accountingResultThCn =
  "text-left p-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap"

export const accountingResultThRightCn = cn(accountingResultThCn, "text-right")

export const accountingResultTbodyRowCn =
  "border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30 even:bg-muted/10"

export const accountingResultTdCn = "p-2.5 align-middle"

export const accountingResultTdRightCn = cn(accountingResultTdCn, "text-right font-mono tabular-nums whitespace-nowrap")

export const accountingResultTfootRowCn = "border-t bg-muted/40 font-medium"

export const accountingLedgerEntryGridCn =
  "rounded-lg border border-border/70 bg-background/80 p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs shadow-sm transition-shadow hover:shadow-md"

export const accountingStatGridCn = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"

export const accountingStatCardCn =
  "rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 min-w-0"

export const accountingStatLabelCn = "text-[11px] font-medium text-muted-foreground truncate"

export const accountingStatValueCn = "mt-0.5 text-sm font-semibold tabular-nums tracking-tight"

export const accountingEmptyStateCn =
  "rounded-lg border border-dashed border-border/70 bg-muted/10 py-12 px-4 text-center text-sm text-muted-foreground"

export const accountingPeriodChipCn =
  "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs text-muted-foreground"

export const accountingFinancialTableCn = "w-full text-sm"

export const accountingFinancialTheadCn = "border-b bg-muted/40 text-muted-foreground"

export const accountingFinancialThCn = "py-2.5 text-left font-medium first:pl-3 last:pr-3"

export const accountingFinancialThRightCn = cn(accountingFinancialThCn, "text-right")

export const accountingFinancialRowCn = "border-b transition-colors hover:bg-muted/25"

export const accountingFinancialSubRowCn = "border-b bg-muted/15"

export const accountingFinancialTotalRowCn = "border-t-2 border-border font-semibold bg-muted/20"

export function accountingStatToneClass(tone?: "default" | "warn" | "ok"): string {
  if (tone === "warn") return "text-amber-700 dark:text-amber-300"
  if (tone === "ok") return "text-emerald-700 dark:text-emerald-300"
  return "text-foreground"
}
