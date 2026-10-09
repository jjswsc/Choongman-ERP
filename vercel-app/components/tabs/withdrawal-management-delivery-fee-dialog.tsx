"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DELIVERY_APP_FEE_PRESETS } from "./withdrawal-management-tab-utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import type { ExpenseFeeVatMode } from "@/lib/expense-fee-vat"
import type * as React from "react"

export type WithdrawalDeliveryFeeDialogProps = {
  applyDeliveryFeePreset: (preset: (typeof DELIVERY_APP_FEE_PRESETS)[number]) => void
  deliveryFeeAmounts: Record<string, string>
  deliveryFeeDialogOpen: boolean
  deliveryFeeMonth: string
  deliveryFeeSaving: boolean
  deliveryFeeVatMode: ExpenseFeeVatMode
  feeAmountFieldLabel: (mode: ExpenseFeeVatMode) => string
  handleDeliveryFeeAmountChange: (presetId: string, raw: string) => void
  handleRegisterDeliveryFeeBatch: () => Promise<void>
  renderFeeVatModePicker: (mode: ExpenseFeeVatMode, onChange: (next: ExpenseFeeVatMode) => void) => React.JSX.Element
  setDeliveryFeeDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setDeliveryFeeMonth: React.Dispatch<React.SetStateAction<string>>
  setDeliveryFeeVatMode: React.Dispatch<React.SetStateAction<ExpenseFeeVatMode>>
  tt: (key: string, fallback: string) => string
}

export function WithdrawalDeliveryFeeDialog({
  applyDeliveryFeePreset,
  deliveryFeeAmounts,
  deliveryFeeDialogOpen,
  deliveryFeeMonth,
  deliveryFeeSaving,
  deliveryFeeVatMode,
  feeAmountFieldLabel,
  handleDeliveryFeeAmountChange,
  handleRegisterDeliveryFeeBatch,
  renderFeeVatModePicker,
  setDeliveryFeeDialogOpen,
  setDeliveryFeeMonth,
  setDeliveryFeeVatMode,
  tt,
}: WithdrawalDeliveryFeeDialogProps) {
  return (
    <Dialog open={deliveryFeeDialogOpen} onOpenChange={setDeliveryFeeDialogOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tt("pL_expenseSourceDeliveryApps", "배달앱 수수료")}</DialogTitle>
          <DialogDescription>
            {tt(
              "deliveryFeeDialogDesc",
              "앱별 빠른 입력 또는 월별 일괄 등록. 계정과목 5528(배달앱수수료)로 손익계산서에 반영됩니다. (나중에 지급=등록 시점, 즉시 지급=출금 등록 시점)"
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {renderFeeVatModePicker(deliveryFeeVatMode, setDeliveryFeeVatMode)}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <div className="text-sm font-medium">
              {tt("deliveryFeePresetTitle", "배달앱 수수료 (빠른 입력)")}
            </div>
            <div className="flex flex-wrap gap-2">
              {DELIVERY_APP_FEE_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => applyDeliveryFeePreset(preset)}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {tt(
                "deliveryFeePresetHint",
                "앱 버튼을 누르면 거래처·적요가 채워집니다. 금액 입력 후 아래 출금 등록을 진행하세요."
              )}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="text-sm font-medium">
              {tt("deliveryFeeBatchTitle", "배달앱 수수료 (월별 일괄)")}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">
                  {tt("deliveryFeeBatchMonth", "대상 월")}
                </Label>
                <Input
                  type="month"
                  value={deliveryFeeMonth}
                  onChange={(e) => setDeliveryFeeMonth(e.target.value)}
                  className="h-9 w-[140px] mt-1"
                />
              </div>
              <p className="text-xs text-muted-foreground pb-1">
                {tt("deliveryFeeBatchDateHint", "전기일은 해당 월 말일(방콕)로 자동 설정됩니다.")}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DELIVERY_APP_FEE_PRESETS.map((preset) => (
                <div key={`dlg-batch-${preset.id}`}>
                  <Label className="text-xs text-muted-foreground">
                    {preset.name} · {feeAmountFieldLabel(deliveryFeeVatMode)}
                  </Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={deliveryFeeAmounts[preset.id] || ""}
                    onChange={(e) => handleDeliveryFeeAmountChange(preset.id, e.target.value)}
                    placeholder="0"
                    className="h-9 mt-1"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleRegisterDeliveryFeeBatch}
                disabled={deliveryFeeSaving}
              >
                {deliveryFeeSaving
                  ? tt("loading", "처리 중...")
                  : tt("deliveryFeeBatchRegister", "월별 배달앱 수수료 등록")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
