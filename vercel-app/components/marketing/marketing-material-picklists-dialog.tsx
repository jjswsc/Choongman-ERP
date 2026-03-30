"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  defaultMarketingMaterialTypeOptions,
  newMaterialTypeValue,
  resolveMaterialTypeLabel,
  saveMarketingMaterialTypeOptions,
  type MarketingMaterialTypeOption,
} from "@/lib/marketing-material-type-options"
import {
  defaultMarketingMaterialPlacementOptions,
  newPlacementValue,
  resolvePlacementLabel,
  saveMarketingMaterialPlacementOptions,
  type MarketingMaterialPlacementOption,
} from "@/lib/marketing-material-placement-options"

function OptionListSection({
  items,
  onItemsChange,
  addPlaceholder,
  newValueFn,
  resetKey,
  rowTitle,
}: {
  items: { value: string; label: string }[]
  onItemsChange: (next: { value: string; label: string }[]) => void
  addPlaceholder: string
  newValueFn: (label: string, existingValues: string[]) => string
  resetKey: number
  /** 저장 label 대신 UI 언어로 표시 (기본 선택지는 tr 반영) */
  rowTitle: (row: { value: string; label: string }) => string
}) {
  const [addDraft, setAddDraft] = React.useState("")
  React.useEffect(() => {
    setAddDraft("")
  }, [resetKey])

  const add = () => {
    const label = addDraft.trim()
    if (!label) return
    if (items.some((t) => t.label.trim().toLowerCase() === label.toLowerCase())) return
    const value = newValueFn(
      label,
      items.map((t) => t.value)
    )
    onItemsChange([...items, { value, label }])
    setAddDraft("")
  }

  return (
    <div className="space-y-3">
      <Label className="text-xs text-muted-foreground">{addPlaceholder}</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          value={addDraft}
          onChange={(e) => setAddDraft(e.target.value)}
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
      <ul className="max-h-[min(36vh,14rem)] space-y-1.5 overflow-y-auto rounded-lg border border-border/80 bg-muted/20 p-2">
        {items.length === 0 ? (
          <li className="px-2 py-6 text-center text-xs text-muted-foreground">{addPlaceholder}</li>
        ) : (
          items.map((row) => (
            <li
              key={row.value}
              className="flex items-center justify-between gap-2 rounded-md bg-background/80 px-2 py-1.5 text-sm shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{rowTitle(row)}</div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">{row.value}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onItemsChange(items.filter((x) => x.value !== row.value))}
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

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  types: MarketingMaterialTypeOption[]
  placements: MarketingMaterialPlacementOption[]
  onTypesApplied: (next: MarketingMaterialTypeOption[]) => void
  onPlacementsApplied: (next: MarketingMaterialPlacementOption[]) => void
  labels: {
    title: string
    hint: string
    typeTab: string
    placementTab: string
    typeDisplayName: string
    placementDisplayName: string
    save: string
    cancel: string
  }
  tr: (ko: string, en: string, th: string) => string
}

export function MarketingMaterialPicklistsDialog({
  open,
  onOpenChange,
  types,
  placements,
  onTypesApplied,
  onPlacementsApplied,
  labels,
  tr,
}: Props) {
  const [draftTypes, setDraftTypes] = React.useState<MarketingMaterialTypeOption[]>(() => [...types])
  const [draftPlacements, setDraftPlacements] = React.useState<MarketingMaterialPlacementOption[]>(() => [
    ...placements,
  ])
  const [resetKey, setResetKey] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    setDraftTypes([...types])
    setDraftPlacements([...placements])
    setResetKey((k) => k + 1)
  }, [open, types, placements])

  const apply = () => {
    const nextTypes = draftTypes.length ? [...draftTypes] : defaultMarketingMaterialTypeOptions()
    const nextPlacements = draftPlacements.length ? [...draftPlacements] : defaultMarketingMaterialPlacementOptions()
    saveMarketingMaterialTypeOptions(nextTypes)
    saveMarketingMaterialPlacementOptions(nextPlacements)
    onTypesApplied(nextTypes)
    onPlacementsApplied(nextPlacements)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,620px)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <p className="text-xs text-muted-foreground">{labels.hint}</p>
        </DialogHeader>
        <Tabs defaultValue="type" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="type" className="text-xs sm:text-sm">
              {labels.typeTab}
            </TabsTrigger>
            <TabsTrigger value="placement" className="text-xs sm:text-sm">
              {labels.placementTab}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="type" className="mt-3 space-y-2">
            <OptionListSection
              resetKey={resetKey}
              items={draftTypes}
              onItemsChange={setDraftTypes}
              addPlaceholder={labels.typeDisplayName}
              newValueFn={newMaterialTypeValue}
              rowTitle={(row) => resolveMaterialTypeLabel(row.value, draftTypes, tr)}
            />
          </TabsContent>
          <TabsContent value="placement" className="mt-3 space-y-2">
            <OptionListSection
              resetKey={resetKey}
              items={draftPlacements}
              onItemsChange={setDraftPlacements}
              addPlaceholder={labels.placementDisplayName}
              newValueFn={newPlacementValue}
              rowTitle={(row) => resolvePlacementLabel(row.value, draftPlacements, tr)}
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
