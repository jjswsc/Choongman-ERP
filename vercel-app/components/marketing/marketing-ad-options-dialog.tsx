"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  defaultMarketingAdUiOptions,
  type MarketingAdLabelOption,
  type MarketingAdUiOptions,
  newPlatformValue,
  saveMarketingAdUiOptions,
} from "@/lib/marketing-ad-ui-options"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: MarketingAdUiOptions
  onApplied: (next: MarketingAdUiOptions) => void
  labels: {
    title: string
    hint: string
    platformTab: string
    formatTab: string
    pillarTab: string
    displayName: string
    save: string
    cancel: string
  }
}

function OptionsListEditor({
  items,
  onChange,
  addPlaceholder,
  mode,
}: {
  items: MarketingAdLabelOption[]
  onChange: (next: MarketingAdLabelOption[]) => void
  addPlaceholder: string
  mode: "simple" | "platform"
}) {
  const [draft, setDraft] = React.useState("")

  const add = () => {
    const label = draft.trim()
    if (!label) return
    if (mode === "simple") {
      const value = label
      if (items.some((x) => x.value === value)) return
      onChange([...items, { value, label }])
    } else {
      const values = items.map((p) => p.value)
      const value = newPlatformValue(label, values)
      onChange([...items, { value, label }])
    }
    setDraft("")
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={addPlaceholder}
          className="h-9 min-w-[12rem] flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button type="button" size="sm" className="h-9 gap-1" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ul className="max-h-[min(40vh,16rem)] space-y-1.5 overflow-y-auto rounded-lg border border-border/80 bg-muted/20 p-2">
        {items.length === 0 ? (
          <li className="px-2 py-6 text-center text-xs text-muted-foreground">{addPlaceholder}</li>
        ) : (
          items.map((row) => (
            <li
              key={row.value}
              className="flex items-center justify-between gap-2 rounded-md bg-background/80 px-2 py-1.5 text-sm shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{row.label}</div>
                {mode === "platform" && (
                  <div className="truncate font-mono text-[10px] text-muted-foreground">{row.value}</div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onChange(items.filter((x) => x.value !== row.value))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

export function MarketingAdOptionsDialog({ open, onOpenChange, options, onApplied, labels }: Props) {
  const [draft, setDraft] = React.useState<MarketingAdUiOptions>(() => ({
    platforms: [...options.platforms],
    formats: [...options.formats],
    pillars: [...options.pillars],
  }))

  React.useEffect(() => {
    if (!open) return
    setDraft({
      platforms: [...options.platforms],
      formats: [...options.formats],
      pillars: [...options.pillars],
    })
  }, [open, options])

  const apply = () => {
    const fallback = defaultMarketingAdUiOptions()
    const next: MarketingAdUiOptions = {
      platforms: draft.platforms.length ? [...draft.platforms] : [...fallback.platforms],
      formats: draft.formats.length ? [...draft.formats] : [...fallback.formats],
      pillars: draft.pillars.length ? [...draft.pillars] : [...fallback.pillars],
    }
    saveMarketingAdUiOptions(next)
    onApplied(next)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <p className="text-xs text-muted-foreground">{labels.hint}</p>
        </DialogHeader>
        <Tabs defaultValue="platform" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="platform" className="text-xs sm:text-sm">
              {labels.platformTab}
            </TabsTrigger>
            <TabsTrigger value="format" className="text-xs sm:text-sm">
              {labels.formatTab}
            </TabsTrigger>
            <TabsTrigger value="pillar" className="text-xs sm:text-sm">
              {labels.pillarTab}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="platform" className="mt-3 space-y-2">
            <Label className="text-xs text-muted-foreground">{labels.displayName}</Label>
            <OptionsListEditor
              mode="platform"
              items={draft.platforms}
              onChange={(platforms) => setDraft((d) => ({ ...d, platforms }))}
              addPlaceholder={labels.displayName}
            />
          </TabsContent>
          <TabsContent value="format" className="mt-3 space-y-2">
            <Label className="text-xs text-muted-foreground">{labels.formatTab}</Label>
            <OptionsListEditor
              mode="simple"
              items={draft.formats}
              onChange={(formats) => setDraft((d) => ({ ...d, formats }))}
              addPlaceholder={labels.formatTab}
            />
          </TabsContent>
          <TabsContent value="pillar" className="mt-3 space-y-2">
            <Label className="text-xs text-muted-foreground">{labels.pillarTab}</Label>
            <OptionsListEditor
              mode="simple"
              items={draft.pillars}
              onChange={(pillars) => setDraft((d) => ({ ...d, pillars }))}
              addPlaceholder={labels.pillarTab}
            />
          </TabsContent>
        </Tabs>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
          <Button type="button" onClick={apply}>
            {labels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
