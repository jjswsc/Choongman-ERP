"use client"

import * as React from "react"
import { formatBahtInteger as formatBath } from "@/lib/financial-amount-format"
import { cn } from "@/lib/utils"

export type WaterfallStep = {
  key: string
  label: string
  amount: number
  kind: "start" | "subtract" | "subtotal" | "section" | "end"
  tone?: "pos" | "accounting"
  href?: string
  /** 항목별 구성비(%) — 총매출 또는 순매출 기준 */
  pct?: number | null
}

function stepAmountClass(kind: WaterfallStep["kind"], _amount: number): string {
  if (kind === "subtract") return "text-rose-700 dark:text-rose-300"
  if (kind === "subtotal" || kind === "end") return "font-semibold text-foreground"
  return "text-foreground"
}

export function ManagementMarginWaterfall({
  steps,
  baseAmount,
  onStepClick,
}: {
  steps: WaterfallStep[]
  baseAmount: number
  onStepClick?: (step: WaterfallStep) => void
}) {
  const base = Math.max(baseAmount, 1)
  let running = 0

  return (
    <div className="space-y-1">
      {steps.map((step) => {
        if (step.kind === "section") {
          return (
            <div
              key={step.key}
              className="pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-t border-dashed border-border/80 mt-2"
            >
              {step.label}
            </div>
          )
        }

        let displayAmount = step.amount
        if (step.kind === "start") {
          running = step.amount
        } else if (step.kind === "subtract") {
          running = Math.max(0, running - Math.abs(step.amount))
          displayAmount = -Math.abs(step.amount)
        } else if (step.kind === "subtotal" || step.kind === "end") {
          running = step.amount
        }

        const barPct = Math.min(100, (Math.abs(step.kind === "subtract" ? step.amount : running) / base) * 100)
        const clickable = Boolean(step.href || onStepClick)

        return (
          <div
            key={step.key}
            className={cn(
              "group rounded-md px-2 py-1.5 -mx-2",
              clickable && "cursor-pointer hover:bg-muted/50",
              step.tone === "accounting" && "bg-slate-50/80 dark:bg-slate-900/20"
            )}
            onClick={
              clickable
                ? () => {
                    if (onStepClick) onStepClick(step)
                    else if (step.href) window.location.href = step.href
                  }
                : undefined
            }
            role={clickable ? "button" : undefined}
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span
                className={cn(
                  "min-w-0 truncate",
                  step.kind === "subtotal" || step.kind === "end" ? "font-medium" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
              <span
                className={cn(
                  "shrink-0 font-erp-numeric tabular-nums",
                  stepAmountClass(step.kind, displayAmount)
                )}
              >
                {step.kind === "subtract" ? "−" : ""}
                {formatBath(Math.abs(displayAmount))}
                {step.kind !== "end" && step.pct != null && Number.isFinite(step.pct) ? (
                  <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                    ({step.pct.toFixed(1)}%)
                  </span>
                ) : null}
              </span>
            </div>
            {(step.kind === "start" || step.kind === "subtract" || step.kind === "subtotal" || step.kind === "end") && (
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      step.kind === "subtract"
                        ? "bg-rose-400/80"
                        : step.kind === "end"
                          ? "bg-emerald-500/80"
                          : step.tone === "accounting"
                            ? "bg-slate-400/70"
                            : "bg-sky-500/80"
                    )}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                {step.kind === "end" && step.pct != null && Number.isFinite(step.pct) ? (
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                    {step.pct.toFixed(1)}%
                  </span>
                ) : null}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
