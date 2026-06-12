"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { ONBOARDING_STEP_ORDER, type OnboardingStepKey } from "@/lib/saas-onboarding-status"

type StepLabels = Record<OnboardingStepKey, string>

type Props = {
  current: OnboardingStepKey
  completed: Partial<Record<OnboardingStepKey, boolean>>
  labels: StepLabels
  onStepClick?: (step: OnboardingStepKey) => void
}

export function SaasOnboardingStepIndicator({ current, completed, labels, onStepClick }: Props) {
  const currentIdx = ONBOARDING_STEP_ORDER.indexOf(current)

  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-[640px] items-start gap-1 sm:min-w-0 sm:gap-2">
        {ONBOARDING_STEP_ORDER.map((step, idx) => {
          const done = completed[step] === true
          const active = step === current
          const clickable = Boolean(onStepClick) && (done || idx <= currentIdx)
          const content = (
            <>
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold sm:h-8 sm:w-8 sm:text-sm",
                  done && "border-emerald-600 bg-emerald-600 text-white",
                  !done && active && "border-primary bg-primary text-primary-foreground",
                  !done && !active && "border-muted-foreground/30 text-muted-foreground"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : idx + 1}
              </span>
              <span className="min-w-0 hidden sm:block">
                <span className={cn("block text-xs font-medium sm:text-sm", active ? "text-foreground" : "text-muted-foreground")}>
                  {labels[step]}
                </span>
              </span>
            </>
          )
          return (
            <li key={step} className="flex flex-1 items-center gap-1 sm:gap-2">
              {clickable ? (
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1 rounded-md p-1 text-left hover:bg-muted/50 -m-1 sm:gap-2"
                  onClick={() => onStepClick?.(step)}
                >
                  {content}
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">{content}</div>
              )}
              {idx < ONBOARDING_STEP_ORDER.length - 1 ? (
                <div className="hidden h-px w-2 shrink-0 bg-border sm:block sm:flex-1" aria-hidden />
              ) : null}
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-sm font-medium sm:hidden">{labels[current]}</p>
    </div>
  )
}
