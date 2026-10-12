"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { PosMenu } from "@/lib/api-client"

export interface PosMenuOptionsAddStepSectionProps {
  t: (k: string) => string
  optionsConfigNewGroupKeyInput: string
  setOptionsConfigNewGroupKeyInput: React.Dispatch<React.SetStateAction<string>>
  optionsConfigSelectedMenuId: string | null
  optionsConfigSelectedMenu: PosMenu | null | undefined
  handleAppendOptionStepKey: () => Promise<void>
}

export function PosMenuOptionsAddStepSection({
  t,
  optionsConfigNewGroupKeyInput,
  setOptionsConfigNewGroupKeyInput,
  optionsConfigSelectedMenuId,
  optionsConfigSelectedMenu,
  handleAppendOptionStepKey,
}: PosMenuOptionsAddStepSectionProps) {
  return (
    <div className="rounded border border-dashed border-border/70 bg-muted/15 p-3 space-y-2">
      <p className="text-xs font-semibold">{t("posOptionAddStepTitle") || "선택 단계 추가"}</p>
      <p className="text-[11px] text-muted-foreground">
        {t("posOptionAddStepHint") ||
          "영문 키(예: sauce, spicy). 치킨(c 코드)은 부위(part) 단계가 항상 포함됩니다. 추가 후 [단계 저장]으로 서버에 반영하세요."}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          className="h-8 min-w-[200px] max-w-sm flex-1 text-xs"
          placeholder={t("posOptionAddStepPlaceholder") || "새 단계 키 (예: sauce)"}
          value={optionsConfigNewGroupKeyInput}
          onChange={(e) => setOptionsConfigNewGroupKeyInput(e.target.value)}
          disabled={!optionsConfigSelectedMenuId || !!optionsConfigSelectedMenu?.promoId?.trim()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void handleAppendOptionStepKey()
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs"
          disabled={!optionsConfigSelectedMenuId || !!optionsConfigSelectedMenu?.promoId?.trim()}
          onClick={() => void handleAppendOptionStepKey()}
        >
          {t("posOptionAddStepButton") || "단계 추가"}
        </Button>
      </div>
    </div>
  )
}
