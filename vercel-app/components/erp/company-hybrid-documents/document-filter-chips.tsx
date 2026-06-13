"use client"

import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export type ActiveFilterChip = {
  id: string
  label: string
}

type Props = {
  chips: ActiveFilterChip[]
  onRemove: (id: string) => void
  onClearAll: () => void
  clearLabel: string
}

export function CompanyHybridDocumentFilterChips({ chips, onRemove, onClearAll, clearLabel }: Props) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge key={chip.id} variant="secondary" className="gap-1 pr-1 font-normal">
          <span className="max-w-[14rem] truncate">{chip.label}</span>
          <button
            type="button"
            className="rounded-sm p-0.5 hover:bg-muted"
            onClick={() => onRemove(chip.id)}
            aria-label={`Remove ${chip.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClearAll}>
        {clearLabel}
      </Button>
    </div>
  )
}
