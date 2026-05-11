"use client"

import * as React from "react"
import { RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"

type OptionGroupEditorPanelProps = {
  menuName?: string
  menuCode?: string
  contextLabel?: string
  titleFallback: string
  emptyMessage: string
  resetLabel: string
  saveLabel: string
  onReset: () => void
  onSave: () => void
  saveDisabled?: boolean
  resetDisabled?: boolean
  children: React.ReactNode
}

export function OptionGroupEditorPanel({
  menuName,
  menuCode,
  contextLabel,
  titleFallback,
  emptyMessage,
  resetLabel,
  saveLabel,
  onReset,
  onSave,
  saveDisabled,
  resetDisabled,
  children,
}: OptionGroupEditorPanelProps) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {!menuCode ? (
        <div className="p-12 text-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold">
                {menuName || titleFallback} ({menuCode})
              </h3>
              {contextLabel ? <p className="mt-1 text-xs text-muted-foreground">{contextLabel}</p> : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={onReset}
                disabled={resetDisabled}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                {resetLabel}
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={onSave} disabled={saveDisabled}>
                <Save className="mr-1 h-3.5 w-3.5" />
                {saveLabel}
              </Button>
            </div>
          </div>
          {children}
        </div>
      )}
    </div>
  )
}
