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

export const accountingFinancialTableCn = "w-full text-sm border-collapse"

export const accountingFinancialTheadCn = "border-b bg-muted/40 text-muted-foreground"

export const accountingFinancialThCn = "py-2.5 text-left font-medium first:pl-3 last:pr-3"

export const accountingFinancialThRightCn = cn(accountingFinancialThCn, "text-right")

export const accountingFinancialRowCn = "border-b transition-colors hover:bg-muted/25"

export const accountingFinancialSubRowCn = "border-b bg-muted/15"

export const accountingFinancialTotalRowCn = "border-t-2 border-border font-semibold bg-muted/20"

/** 손익계산서 문서 카드 — 대형 보고서/PPT 톤 */
export const accountingPlDocumentCn =
  "w-full max-w-4xl rounded-xl border border-border/60 bg-gradient-to-br from-card via-muted/10 to-card p-6 sm:p-8 text-foreground shadow-[0_4px_24px_-4px_rgba(0,0,0,0.1),0_2px_8px_-4px_rgba(0,0,0,0.04)]"

export const accountingPlTitleCn = "text-xl font-bold tracking-tight text-foreground"

export const accountingPlTableShellCn =
  "mx-auto w-full max-w-3xl overflow-hidden rounded-lg border border-border/70 bg-card shadow-[0_2px_12px_-2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.4)] dark:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.35)]"

export const accountingPlTableCn = "w-full text-sm border-collapse table-fixed"

export const accountingPlTheadCn =
  "border-b bg-gradient-to-r from-muted/90 via-muted/55 to-muted/90 text-muted-foreground"

export const accountingPlThCn =
  "px-5 py-3 text-xs font-semibold uppercase tracking-wider"

export const accountingPlThRightCn = cn(accountingPlThCn, "text-right")

export const accountingPlTdLabelCn = "px-5 py-2.5 align-middle"

export const accountingPlTdAmountCn =
  "px-5 py-2.5 text-right font-mono tabular-nums align-middle whitespace-nowrap"

export const accountingPlTdPctCn =
  "px-5 py-2.5 text-right tabular-nums text-muted-foreground align-middle whitespace-nowrap"

export const accountingPlSubRowCn = "border-b border-border/40 bg-muted/20"

export const accountingPlSubTdLabelCn = "px-5 py-2 pl-12 text-xs text-muted-foreground align-middle"

export const accountingPlGrossProfitRowCn =
  "border-y border-primary/25 bg-gradient-to-r from-primary/8 via-primary/5 to-primary/8"

export const accountingPlNetProfitRowCn =
  "border-t-2 border-foreground/15 bg-gradient-to-r from-muted/50 via-muted/70 to-muted/50 shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.06)]"

/** 재무제표 공통 문서 카드 (손익·재무상태표) */
export const accountingFsDocumentCn = accountingPlDocumentCn

export const accountingFsTitleCn = accountingPlTitleCn

/** 재무상태표 섹션 카드 — 자산/부채/자본 기둥 */
export const accountingBsSectionCardCn =
  "flex flex-col rounded-xl border border-border/70 bg-gradient-to-br from-card via-muted/5 to-card p-5 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.4)] dark:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.35)]"

export const accountingBsSectionTitleCn =
  "mb-4 border-b border-border/50 pb-3 text-sm font-bold uppercase tracking-wider text-foreground"

export const accountingBsLineRowCn =
  "flex items-baseline justify-between gap-3 py-1.5 border-b border-border/30 last:border-0"

export const accountingBsLineLabelCn = "text-xs font-medium text-muted-foreground shrink-0"

export const accountingBsLineValueCn =
  "font-mono text-right text-sm font-medium tabular-nums text-foreground"

export const accountingBsSubLineRowCn =
  "flex items-baseline justify-between gap-3 py-1 pl-3 border-l-2 border-border/40"

export const accountingBsSubLineLabelCn = "text-[11px] text-muted-foreground shrink-0"

export const accountingBsSubLineValueCn =
  "font-mono text-right text-sm tabular-nums text-muted-foreground"

export const accountingBsTotalRowCn =
  "mt-4 flex items-center justify-between rounded-lg border-t-2 border-foreground/10 bg-gradient-to-r from-muted/35 via-muted/55 to-muted/35 px-3 py-3 text-sm font-bold shadow-[0_-2px_6px_-2px_rgba(0,0,0,0.05)]"

export const accountingBsBalanceCheckOkCn =
  "rounded-xl border border-emerald-300/80 bg-gradient-to-r from-emerald-50/90 via-emerald-50/60 to-emerald-50/90 px-4 py-3 text-sm text-emerald-900 shadow-sm dark:from-emerald-950/40 dark:via-emerald-950/25 dark:to-emerald-950/40 dark:text-emerald-100"

export const accountingBsBalanceCheckWarnCn =
  "rounded-xl border border-amber-300/80 bg-gradient-to-r from-amber-50/90 via-amber-50/60 to-amber-50/90 px-4 py-3 text-sm text-amber-900 shadow-sm dark:from-amber-950/40 dark:via-amber-950/25 dark:to-amber-950/40 dark:text-amber-100"

export const accountingBsCompareShellCn =
  "w-full overflow-x-auto overflow-hidden rounded-lg border border-border/70 bg-card shadow-[0_2px_12px_-2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.4)] dark:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.35)]"

export const accountingBsCompareTheadCn =
  "border-b bg-gradient-to-r from-muted/90 via-muted/55 to-muted/90 text-muted-foreground"

export const accountingBsCompareThStickyCn =
  "sticky left-0 z-10 min-w-[180px] bg-gradient-to-r from-muted/95 to-muted/80 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"

export const accountingBsCompareThColCn =
  "px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider font-mono align-bottom whitespace-nowrap"

export const accountingBsCompareTdStickyCn =
  "sticky left-0 z-10 bg-card px-4 py-2.5 font-medium"

export const accountingBsCompareTdAmountCn =
  "px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap"

export const accountingBsCompareTotalRowCn =
  "border-t border-border/60 bg-muted/15 font-semibold"

export function accountingBsSectionAccentClass(
  section: "assets" | "liabilities" | "equity"
): string {
  if (section === "assets") return "border-t-[3px] border-t-sky-500/75"
  if (section === "liabilities") return "border-t-[3px] border-t-amber-500/75"
  return "border-t-[3px] border-t-emerald-500/75"
}

export function accountingStatToneClass(tone?: "default" | "warn" | "ok"): string {
  if (tone === "warn") return "text-amber-700 dark:text-amber-300"
  if (tone === "ok") return "text-emerald-700 dark:text-emerald-300"
  return "text-foreground"
}
