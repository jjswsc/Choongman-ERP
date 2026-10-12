"use client"

import * as React from "react"
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatPosMenuBulkPickLabel } from "@/app/admin/pos-menus/pos-menus-page-helpers"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import type { PosMenu } from "@/lib/api-client"

export interface PosMenusBulkMenuPickerDialogContentProps {
  t: (k: string) => string
  optionsConfigBulkMenuPickerSearch: string
  setOptionsConfigBulkMenuPickerSearch: React.Dispatch<React.SetStateAction<string>>
  optionsConfigBulkMenuPickerList: PosMenu[]
  optionsConfigBulkMenuPickerChecked: Record<string, boolean>
  setOptionsConfigBulkMenuPickerChecked: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  appendOptionsConfigBulkLabels: (labels: string[]) => void
  setOptionsConfigBulkMenuPickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  optionsConfigBulkMenuPickerSelectedCount: number
  menus: PosMenu[]
}

export function PosMenusBulkMenuPickerDialogContent({
  t,
  optionsConfigBulkMenuPickerSearch,
  setOptionsConfigBulkMenuPickerSearch,
  optionsConfigBulkMenuPickerList,
  optionsConfigBulkMenuPickerChecked,
  setOptionsConfigBulkMenuPickerChecked,
  appendOptionsConfigBulkLabels,
  setOptionsConfigBulkMenuPickerOpen,
  optionsConfigBulkMenuPickerSelectedCount,
  menus,
}: PosMenusBulkMenuPickerDialogContentProps) {
  return (
    <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden gap-3 p-4 sm:p-6">
      <DialogHeader>
        <DialogTitle className="text-base">{t("posOptionBulkMenuPickerTitle") || "메뉴에서 값으로 넣기"}</DialogTitle>
        <DialogDescription className="text-xs">{t("posOptionBulkMenuPickerHint")}</DialogDescription>
      </DialogHeader>
      <Input
        className="h-9 text-sm"
        placeholder={t("posOptionBulkMenuPickerSearchPh") || "코드·메뉴명 검색"}
        value={optionsConfigBulkMenuPickerSearch}
        onChange={(e) => setOptionsConfigBulkMenuPickerSearch(e.target.value)}
        autoFocus
      />
      <div className="max-h-[min(52vh,28rem)] overflow-y-auto rounded-md border">
        {optionsConfigBulkMenuPickerList.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">{t("posOptionBulkMenuPickerEmpty")}</p>
        ) : (
          <ul className="divide-y">
            {optionsConfigBulkMenuPickerList.map((m) => {
              const line = formatPosMenuBulkPickLabel(m)
              const checked = !!optionsConfigBulkMenuPickerChecked[String(m.id)]
              return (
                <li key={m.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/40">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) =>
                      setOptionsConfigBulkMenuPickerChecked((prev) => ({
                        ...prev,
                        [String(m.id)]: c === true,
                      }))
                    }
                    aria-label={line}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm" title={line}>
                    {m.code ? (
                      <>
                        <span className="font-mono text-xs text-muted-foreground">{m.code}</span>
                        <span className="text-muted-foreground"> — </span>
                      </>
                    ) : null}
                    <span>{m.name}</span>
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className={`${ADMIN_BTN_XS_CN} shrink-0 text-[11px]`}
                    onClick={() => appendOptionsConfigBulkLabels([line])}
                  >
                    {t("posOptionBulkMenuPickerRowAdd")}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => setOptionsConfigBulkMenuPickerOpen(false)}>
          {t("btn_close")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={optionsConfigBulkMenuPickerSelectedCount === 0}
          onClick={() => {
            const ids = Object.entries(optionsConfigBulkMenuPickerChecked)
              .filter(([, v]) => v)
              .map(([k]) => k)
            const labels = ids
              .map((id) => menus.find((mm) => String(mm.id) === id))
              .filter((x): x is PosMenu => !!x)
              .map(formatPosMenuBulkPickLabel)
            appendOptionsConfigBulkLabels(labels)
            setOptionsConfigBulkMenuPickerChecked({})
          }}
        >
          {(t("posOptionBulkMenuPickerAddSelected") || "선택한 메뉴를 입력란에 추가 ({n})").replace(
            "{n}",
            String(optionsConfigBulkMenuPickerSelectedCount)
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
