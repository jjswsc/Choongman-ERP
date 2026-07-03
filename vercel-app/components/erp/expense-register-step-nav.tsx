"use client"

import { cn } from "@/lib/utils"

export type ExpenseRegisterStepId = "basics" | "amount" | "evidence"

export function ExpenseRegisterStepNav({
  active,
  onChange,
  labels,
}: {
  active: ExpenseRegisterStepId
  onChange: (step: ExpenseRegisterStepId) => void
  labels: Record<ExpenseRegisterStepId, string>
}) {
  const steps: ExpenseRegisterStepId[] = ["basics", "amount", "evidence"]
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {steps.map((id, idx) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            active === id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-muted/60"
          )}
        >
          {idx + 1}. {labels[id]}
        </button>
      ))}
    </div>
  )
}
