"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CARD_FEE_PRESETS } from "./withdrawal-management-tab-utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import type { ExpenseFeeVatMode } from "@/lib/expense-fee-vat"
import type * as React from "react"

export type WithdrawalCardFeeDialogProps = {
  applyCardFeePreset: (preset: (typeof CARD_FEE_PRESETS)[number]) => void
  cardFeeAmounts: Record<string, string>
  cardFeeDialogOpen: boolean
  cardFeeMonth: string
  cardFeeSaving: boolean
  cardFeeVatMode: ExpenseFeeVatMode
  feeAmountFieldLabel: (mode: ExpenseFeeVatMode) => string
  handleCardFeeAmountChange: (presetId: string, raw: string) => void
  handleRegisterCardFeeBatch: () => Promise<void>
  renderFeeVatModePicker: (mode: ExpenseFeeVatMode, onChange: (next: ExpenseFeeVatMode) => void) => React.JSX.Element
  setCardFeeDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setCardFeeMonth: React.Dispatch<React.SetStateAction<string>>
  setCardFeeVatMode: React.Dispatch<React.SetStateAction<ExpenseFeeVatMode>>
  tt: (key: string, fallback: string) => string
}

export function WithdrawalCardFeeDialog({
  applyCardFeePreset,
  cardFeeAmounts,
  cardFeeDialogOpen,
  cardFeeMonth,
  cardFeeSaving,
  cardFeeVatMode,
  feeAmountFieldLabel,
  handleCardFeeAmountChange,
  handleRegisterCardFeeBatch,
  renderFeeVatModePicker,
  setCardFeeDialogOpen,
  setCardFeeMonth,
  setCardFeeVatMode,
  tt,
}: WithdrawalCardFeeDialogProps) {
  return (
    <Dialog open={cardFeeDialogOpen} onOpenChange={setCardFeeDialogOpen}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tt("pL_expenseSourceCardFees", "카드 수수료")}</DialogTitle>
          <DialogDescription>
            {tt(
              "cardFeeDialogDesc",
              "유형별 빠른 입력 또는 월별 일괄 등록. 계정과목 5529(카드수수료)로 손익계산서에 반영됩니다. (나중에 지급=등록 시점, 즉시 지급=출금 등록 시점)"
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {renderFeeVatModePicker(cardFeeVatMode, setCardFeeVatMode)}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <div className="text-sm font-medium">
              {tt("cardFeePresetTitle", "카드 수수료 (빠른 입력)")}
            </div>
            <div className="flex flex-wrap gap-2">
              {CARD_FEE_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => applyCardFeePreset(preset)}
                >
                  {tt(preset.nameKey, preset.name)}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {tt(
                "cardFeePresetHint",
                "유형 버튼을 누르면 거래처·적요가 채워집니다."
              )}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="text-sm font-medium">
              {tt("cardFeeBatchTitle", "카드 수수료 (월별 일괄)")}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">
                  {tt("cardFeeBatchMonth", "대상 월")}
                </Label>
                <Input
                  type="month"
                  value={cardFeeMonth}
                  onChange={(e) => setCardFeeMonth(e.target.value)}
                  className="h-9 w-[140px] mt-1"
                />
              </div>
              <p className="text-xs text-muted-foreground pb-1">
                {tt("cardFeeBatchDateHint", "전기일은 해당 월 말일(방콕)로 자동 설정됩니다.")}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CARD_FEE_PRESETS.map((preset) => (
                <div key={`dlg-card-batch-${preset.id}`}>
                  <Label className="text-xs text-muted-foreground">
                    {tt(preset.nameKey, preset.name)} · {feeAmountFieldLabel(cardFeeVatMode)}
                  </Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={cardFeeAmounts[preset.id] || ""}
                    onChange={(e) => handleCardFeeAmountChange(preset.id, e.target.value)}
                    placeholder="0"
                    className="h-9 mt-1"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleRegisterCardFeeBatch}
                disabled={cardFeeSaving}
              >
                {cardFeeSaving
                  ? tt("loading", "처리 중...")
                  : tt("cardFeeBatchRegister", "월별 카드 수수료 등록")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
