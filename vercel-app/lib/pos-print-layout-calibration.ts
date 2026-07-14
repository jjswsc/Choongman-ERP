import {
  RECEIPT_CONTENT_NUDGE_LEFT_MM,
  RECEIPT_INNER_INSET_LEFT_MM,
  RECEIPT_INNER_INSET_RIGHT_MM,
  RECEIPT_TRAILING_BOTTOM_MM,
} from '@/lib/pos-receipt-layout'

/** 주방 슬립 기본 패딩 — pos-kitchen-slip-html 과 동기화 */
export const KITCHEN_SLIP_DEFAULT_PADDING_MM = { t: 1, r: 14, b: 1, l: 2 } as const

export type ReceiptPrintLayout = {
  insetLeftMm: number
  insetRightMm: number
  contentNudgeLeftMm: number
  trailingBottomMm: number
}

export type KitchenSlipPrintLayout = {
  paddingTopMm: number
  paddingRightMm: number
  paddingBottomMm: number
  paddingLeftMm: number
}

export type PosPrintLayoutCalibration = {
  receipt: ReceiptPrintLayout
  kitchen: KitchenSlipPrintLayout
}

export type PosPrintLayoutCalibrationInput = {
  receiptInsetLeftMm?: number | null
  receiptInsetRightMm?: number | null
  receiptContentNudgeLeftMm?: number | null
  kitchenSlipPaddingLeftMm?: number | null
  kitchenSlipPaddingRightMm?: number | null
}

function clampMm(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value * 10) / 10))
}

function readOptionalMm(raw: unknown, fallback: number, min: number, max: number): number {
  if (raw === null || raw === undefined || raw === '') return fallback
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n)) return fallback
  return clampMm(n, min, max)
}

export function resolveReceiptPrintLayout(input?: PosPrintLayoutCalibrationInput | null): ReceiptPrintLayout {
  return {
    insetLeftMm: readOptionalMm(input?.receiptInsetLeftMm, RECEIPT_INNER_INSET_LEFT_MM, 0, 15),
    insetRightMm: readOptionalMm(input?.receiptInsetRightMm, RECEIPT_INNER_INSET_RIGHT_MM, 5, 25),
    contentNudgeLeftMm: readOptionalMm(
      input?.receiptContentNudgeLeftMm,
      RECEIPT_CONTENT_NUDGE_LEFT_MM,
      0,
      8
    ),
    trailingBottomMm: RECEIPT_TRAILING_BOTTOM_MM,
  }
}

export function resolveKitchenSlipPrintLayout(input?: PosPrintLayoutCalibrationInput | null): KitchenSlipPrintLayout {
  return {
    paddingTopMm: KITCHEN_SLIP_DEFAULT_PADDING_MM.t,
    paddingBottomMm: KITCHEN_SLIP_DEFAULT_PADDING_MM.b,
    paddingLeftMm: readOptionalMm(
      input?.kitchenSlipPaddingLeftMm,
      KITCHEN_SLIP_DEFAULT_PADDING_MM.l,
      0,
      10
    ),
    paddingRightMm: readOptionalMm(
      input?.kitchenSlipPaddingRightMm,
      KITCHEN_SLIP_DEFAULT_PADDING_MM.r,
      5,
      22
    ),
  }
}

export function resolvePosPrintLayoutCalibration(
  input?: PosPrintLayoutCalibrationInput | null
): PosPrintLayoutCalibration {
  return {
    receipt: resolveReceiptPrintLayout(input),
    kitchen: resolveKitchenSlipPrintLayout(input),
  }
}

export function isDefaultReceiptPrintLayout(input?: PosPrintLayoutCalibrationInput | null): boolean {
  const r = resolveReceiptPrintLayout(input)
  return (
    r.insetLeftMm === RECEIPT_INNER_INSET_LEFT_MM &&
    r.insetRightMm === RECEIPT_INNER_INSET_RIGHT_MM &&
    r.contentNudgeLeftMm === RECEIPT_CONTENT_NUDGE_LEFT_MM
  )
}

export function isDefaultKitchenSlipPrintLayout(input?: PosPrintLayoutCalibrationInput | null): boolean {
  const k = resolveKitchenSlipPrintLayout(input)
  return (
    k.paddingLeftMm === KITCHEN_SLIP_DEFAULT_PADDING_MM.l &&
    k.paddingRightMm === KITCHEN_SLIP_DEFAULT_PADDING_MM.r
  )
}
