import { cn } from "@/lib/utils"

/** 회계·세무 검색 결과 영역 공통 스타일 */
export const accountingResultTableShellCn =
  "overflow-x-auto rounded-lg border border-border/80 bg-card shadow-sm"

export const accountingResultTableCn = "w-full text-sm border-collapse min-w-max"

export const accountingResultTheadRowCn = "border-b bg-muted/50"

export const accountingResultThCn =
  "text-left p-2.5 text-sm font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap"

export const accountingResultThRightCn = cn(accountingResultThCn, "text-right")

export const accountingResultTbodyRowCn =
  "border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30 even:bg-muted/10"

export const accountingResultTdCn = "p-2.5 align-middle"

export const accountingResultTdRightCn = cn(accountingResultTdCn, "text-right font-mono tabular-nums whitespace-nowrap")

export const accountingResultTfootRowCn = "border-t bg-muted/40 font-medium"

export const accountingLedgerEntryGridCn =
  "rounded-lg border border-border/70 bg-background/80 p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5 text-sm shadow-sm transition-shadow hover:shadow-md"

export const accountingStatGridCn = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"

export const accountingStatCardCn =
  "rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 min-w-0"

export const accountingStatLabelCn = "text-sm font-bold text-muted-foreground truncate"

export const accountingStatValueCn = "mt-0.5 text-sm font-semibold tabular-nums tracking-tight"

export const accountingEmptyStateCn =
  "rounded-lg border border-dashed border-border/70 bg-muted/10 py-12 px-4 text-center text-sm text-muted-foreground"

export const accountingPeriodChipCn =
  "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs text-muted-foreground"

export const accountingFinancialTableCn = "w-full text-sm border-collapse"

export const accountingFinancialTheadCn = "border-b bg-muted/40 text-muted-foreground"

export const accountingFinancialThCn = "py-2.5 text-left text-sm font-bold first:pl-3 last:pr-3"

export const accountingFinancialThRightCn = cn(accountingFinancialThCn, "text-right")

export const accountingFinancialRowCn = "border-b transition-colors hover:bg-muted/25"

export const accountingFinancialSubRowCn = "border-b bg-muted/15"

export const accountingFinancialTotalRowCn = "border-t-2 border-border font-semibold bg-muted/20"

/** 손익계산서 문서 카드 — 대형 보고서/PPT 톤 (탭 폭 전체 사용) */
export const accountingPlDocumentCn =
  "w-full rounded-xl border border-border/60 bg-gradient-to-br from-card via-muted/10 to-card p-6 sm:p-8 lg:p-10 text-foreground shadow-[0_4px_24px_-4px_rgba(0,0,0,0.1),0_2px_8px_-4px_rgba(0,0,0,0.04)]"

export const accountingPlTitleCn = "text-xl font-bold tracking-tight text-foreground"

export const accountingPlTableShellCn =
  "w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_2px_16px_-4px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.45)] dark:shadow-[0_2px_16px_-4px_rgba(0,0,0,0.4)]"

export const accountingPlTableCn = "w-full text-sm border-collapse"

export const accountingPlTheadCn =
  "border-b-2 border-border/60 bg-gradient-to-r from-muted/95 via-muted/60 to-muted/95 text-muted-foreground shadow-[0_1px_0_rgba(255,255,255,0.5)_inset]"

/** 회계 리스트·드릴다운 — 섹션 제목(테이블 위) */
export const accountingResultSectionTitleCn = "text-sm font-bold text-foreground mb-1.5"

/** 회계 인라인 테이블(AccountingDataTable 외) */
export const accountingResultInlineTableCn = "w-full text-sm border-collapse"

export const accountingPlThCn =
  "pl-8 pr-5 py-3.5 text-sm font-bold uppercase tracking-wider"

export const accountingPlThRightCn = cn(accountingPlThCn, "text-right pl-5 pr-8")

export const accountingPlTdLabelCn = "pl-8 pr-5 py-3 align-middle"

export const accountingPlTdAmountCn =
  "pl-5 pr-6 py-3 text-right font-mono tabular-nums align-middle whitespace-nowrap"

export const accountingPlTdPctCn =
  "pl-5 pr-8 py-3 text-right tabular-nums text-muted-foreground align-middle whitespace-nowrap"

/** 매출 구간 */
export const accountingPlSalesRowCn =
  "border-b border-sky-200/70 bg-gradient-to-r from-sky-50/90 via-card to-sky-50/50 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset] transition-colors hover:brightness-[1.02] dark:border-sky-800/50 dark:from-sky-950/35 dark:via-card dark:to-sky-950/20"

/** 재고·매입 조정 구간 */
export const accountingPlInventoryRowCn =
  "border-b border-border/45 bg-gradient-to-r from-muted/25 via-muted/10 to-muted/20"

/** 매출원가 합계 */
export const accountingPlCogsRowCn =
  "border-y border-border/55 bg-gradient-to-r from-muted/40 via-muted/25 to-muted/40 font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"

/** 비용 구간 */
export const accountingPlExpenseRowCn =
  "border-b border-amber-200/60 bg-gradient-to-r from-amber-50/70 via-card to-amber-50/40 transition-colors hover:brightness-[1.01] dark:border-amber-900/40 dark:from-amber-950/25 dark:via-card dark:to-amber-950/15"

export const accountingPlSubRowCn =
  "border-b border-border/35 bg-muted/15 shadow-[inset_2px_0_0_rgba(0,0,0,0.04)] dark:shadow-[inset_2px_0_0_rgba(255,255,255,0.04)]"

export const accountingPlSubTdLabelCn = "pl-14 pr-5 py-2.5 text-sm text-muted-foreground align-middle"

export const accountingPlGrossProfitRowCn =
  "border-y-2 border-primary/30 bg-gradient-to-r from-primary/12 via-primary/6 to-primary/12 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.5)]"

export const accountingPlNetProfitRowCn =
  "border-t-2 border-foreground/20 bg-gradient-to-r from-muted/55 via-muted/75 to-muted/55 shadow-[0_-3px_12px_-4px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.4)]"

/** 재무제표 공통 문서 카드 (손익·재무상태표) */
export const accountingFsDocumentCn = accountingPlDocumentCn

export const accountingFsTitleCn = accountingPlTitleCn

/** 재무상태표 섹션 카드 — 자산/부채/자본 기둥 */
export const accountingBsSectionCardCn =
  "flex flex-col rounded-xl border border-border/70 bg-gradient-to-br from-card via-muted/8 to-card px-6 py-5 shadow-[0_3px_14px_-4px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.45)] dark:shadow-[0_3px_14px_-4px_rgba(0,0,0,0.38)]"

export const accountingBsSectionTitleCn =
  "mb-4 border-b border-border/50 pb-3 pl-1 text-sm font-bold uppercase tracking-wider text-foreground"

export const accountingBsLineRowCn =
  "flex items-baseline justify-between gap-4 px-2 py-2.5 border-b border-border/30 last:border-0"

export const accountingBsLineLabelCn = "text-sm font-medium text-muted-foreground shrink-0 pl-1"

export const accountingBsLineValueCn =
  "font-mono text-right text-sm font-medium tabular-nums text-foreground pr-2"

export const accountingBsSubLineRowCn =
  "flex items-baseline justify-between gap-4 px-3 py-2 ml-2 border-l-2 border-border/45"

export const accountingBsSubLineLabelCn = "text-sm text-muted-foreground shrink-0 pl-1"

export const accountingBsSubLineValueCn =
  "font-mono text-right text-sm tabular-nums text-muted-foreground pr-2"

export const accountingBsTotalRowCn =
  "mt-4 flex items-center justify-between rounded-lg border-t-2 border-foreground/12 bg-gradient-to-r from-muted/40 via-muted/60 to-muted/40 px-5 py-3.5 text-sm font-bold shadow-[0_-3px_10px_-4px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.4)]"

export const accountingBsBalanceCheckOkCn =
  "rounded-xl border border-emerald-300/80 bg-gradient-to-r from-emerald-50/90 via-emerald-50/60 to-emerald-50/90 px-4 py-3 text-sm text-emerald-900 shadow-sm dark:from-emerald-950/40 dark:via-emerald-950/25 dark:to-emerald-950/40 dark:text-emerald-100"

export const accountingBsBalanceCheckWarnCn =
  "rounded-xl border border-amber-300/80 bg-gradient-to-r from-amber-50/90 via-amber-50/60 to-amber-50/90 px-4 py-3 text-sm text-amber-900 shadow-sm dark:from-amber-950/40 dark:via-amber-950/25 dark:to-amber-950/40 dark:text-amber-100"

export const accountingBsCompareShellCn =
  "w-full overflow-x-auto overflow-hidden rounded-lg border border-border/70 bg-card shadow-[0_2px_12px_-2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.4)] dark:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.35)]"

export const accountingBsCompareTheadCn =
  "border-b bg-gradient-to-r from-muted/90 via-muted/55 to-muted/90 text-muted-foreground"

export const accountingBsCompareThStickyCn =
  "sticky left-0 z-10 min-w-[200px] bg-gradient-to-r from-muted/95 to-muted/80 pl-8 pr-5 py-3.5 text-left text-sm font-bold uppercase tracking-wider"

export const accountingBsCompareThColCn =
  "pl-5 pr-8 py-3.5 text-right text-sm font-bold uppercase tracking-wider font-mono align-bottom whitespace-nowrap"

export const accountingBsCompareTdStickyCn =
  "sticky left-0 z-10 bg-card pl-8 pr-5 py-3 font-medium"

export const accountingBsCompareTdAmountCn =
  "pl-5 pr-8 py-3 text-right font-mono tabular-nums whitespace-nowrap"

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
