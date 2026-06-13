"use client"

import { Input } from "@/components/ui/input"
import { normalizeCompanyHybridDocDateTextInput } from "@/lib/company-hybrid-documents"
import { cn } from "@/lib/utils"

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  hint?: string
  className?: string
}

export function CompanyHybridDocDateTextField({ value, onChange, placeholder, hint, className }: Props) {
  return (
    <div className={cn("space-y-1", className)}>
      <Input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onChange(normalizeCompanyHybridDocDateTextInput(value))}
        className="max-w-[12rem] font-mono tabular-nums tracking-tight"
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
