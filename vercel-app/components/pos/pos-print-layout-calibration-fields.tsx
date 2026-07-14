"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  RECEIPT_CONTENT_NUDGE_LEFT_MM,
  RECEIPT_INNER_INSET_LEFT_MM,
  RECEIPT_INNER_INSET_RIGHT_MM,
} from "@/lib/pos-receipt-layout"
import {
  KITCHEN_SLIP_DEFAULT_PADDING_MM,
  resolvePosPrintLayoutCalibration,
} from "@/lib/pos-print-layout-calibration"

export type PosPrintLayoutCalibrationFieldsValue = {
  receiptInsetLeftMm: number
  receiptInsetRightMm: number
  receiptContentNudgeLeftMm: number
  kitchenSlipPaddingLeftMm: number
  kitchenSlipPaddingRightMm: number
}

type Props = {
  value: PosPrintLayoutCalibrationFieldsValue
  onChange: (next: PosPrintLayoutCalibrationFieldsValue) => void
  t: (key: string) => string
  onTestReceipt?: () => void
  onTestKitchen?: () => void
  testReceiptDisabled?: boolean
  testKitchenDisabled?: boolean
}

function LayoutSliderRow(props: {
  id: string
  label: string
  hint?: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  unit?: string
}) {
  const { id, label, hint, min, max, step, value, onChange, unit = "mm" } = props
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value.toFixed(1)}
          {unit}
        </span>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  )
}

export function defaultPosPrintLayoutCalibrationFieldsValue(): PosPrintLayoutCalibrationFieldsValue {
  const layout = resolvePosPrintLayoutCalibration(null)
  return {
    receiptInsetLeftMm: layout.receipt.insetLeftMm,
    receiptInsetRightMm: layout.receipt.insetRightMm,
    receiptContentNudgeLeftMm: layout.receipt.contentNudgeLeftMm,
    kitchenSlipPaddingLeftMm: layout.kitchen.paddingLeftMm,
    kitchenSlipPaddingRightMm: layout.kitchen.paddingRightMm,
  }
}

export function PosPrintLayoutCalibrationFields({
  value,
  onChange,
  t,
  onTestReceipt,
  onTestKitchen,
  testReceiptDisabled,
  testKitchenDisabled,
}: Props) {
  const patch = (partial: Partial<PosPrintLayoutCalibrationFieldsValue>) =>
    onChange({ ...value, ...partial })

  const resetDefaults = () => onChange(defaultPosPrintLayoutCalibrationFieldsValue())

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold">{t("posPrintLayoutCalibTitle")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("posPrintLayoutCalibHint")}</p>
      </div>

      <div className="space-y-3 rounded-md border bg-muted/20 p-3">
        <p className="text-sm font-medium">{t("posPrintLayoutCalibReceiptSection")}</p>
        <LayoutSliderRow
          id="receipt-inset-left"
          label={t("posPrintLayoutCalibReceiptLeft")}
          hint={t("posPrintLayoutCalibReceiptLeftHint")}
          min={0}
          max={15}
          step={0.5}
          value={value.receiptInsetLeftMm}
          onChange={(v) => patch({ receiptInsetLeftMm: v })}
        />
        <LayoutSliderRow
          id="receipt-inset-right"
          label={t("posPrintLayoutCalibReceiptRight")}
          hint={t("posPrintLayoutCalibReceiptRightHint")}
          min={5}
          max={25}
          step={0.5}
          value={value.receiptInsetRightMm}
          onChange={(v) => patch({ receiptInsetRightMm: v })}
        />
        <LayoutSliderRow
          id="receipt-nudge"
          label={t("posPrintLayoutCalibReceiptShift")}
          hint={t("posPrintLayoutCalibReceiptShiftHint")}
          min={0}
          max={8}
          step={0.5}
          value={value.receiptContentNudgeLeftMm}
          onChange={(v) => patch({ receiptContentNudgeLeftMm: v })}
        />
      </div>

      <div className="space-y-3 rounded-md border bg-muted/20 p-3">
        <p className="text-sm font-medium">{t("posKitchenSlipDesignSection")}</p>
        <LayoutSliderRow
          id="kitchen-padding-left"
          label={t("posPrintLayoutCalibKitchenLeft")}
          min={0}
          max={10}
          step={0.5}
          value={value.kitchenSlipPaddingLeftMm}
          onChange={(v) => patch({ kitchenSlipPaddingLeftMm: v })}
        />
        <LayoutSliderRow
          id="kitchen-padding-right"
          label={t("posPrintLayoutCalibKitchenRight")}
          min={5}
          max={22}
          step={0.5}
          value={value.kitchenSlipPaddingRightMm}
          onChange={(v) => patch({ kitchenSlipPaddingRightMm: v })}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {t("posPrintLayoutCalibDefaultNote")
          .replace("{rl}", String(RECEIPT_INNER_INSET_LEFT_MM))
          .replace("{rr}", String(RECEIPT_INNER_INSET_RIGHT_MM))
          .replace("{rn}", String(RECEIPT_CONTENT_NUDGE_LEFT_MM))
          .replace("{kl}", String(KITCHEN_SLIP_DEFAULT_PADDING_MM.l))
          .replace("{kr}", String(KITCHEN_SLIP_DEFAULT_PADDING_MM.r))}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={resetDefaults}>
          {t("posPrintLayoutCalibReset")}
        </Button>
        {onTestReceipt ? (
          <Button type="button" size="sm" variant="secondary" onClick={onTestReceipt} disabled={testReceiptDisabled}>
            {t("posPrintLayoutCalibTestReceipt")}
          </Button>
        ) : null}
        {onTestKitchen ? (
          <Button type="button" size="sm" variant="secondary" onClick={onTestKitchen} disabled={testKitchenDisabled}>
            {t("posPrintLayoutCalibTestKitchen")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
