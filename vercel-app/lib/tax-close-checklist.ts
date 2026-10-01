import { taxAmountsClose, type TaxBookRecognition } from '@/lib/tax-book'

export type TaxCloseChecklistStepId =
  | 'opening'
  | 'vat'
  | 'sales'
  | 'purchase'
  | 'payroll'
  | 'inventory'
  | 'bridge'
  | 'recognize'
  | 'close'

export type TaxCloseChecklistStep = {
  id: TaxCloseChecklistStepId
  done: boolean
  blocked: boolean
  detail?: string
}

export function buildTaxCloseChecklist(input: {
  hasOpening: boolean
  hasVatSummary: boolean
  hasSalesSummary: boolean
  hasPurchaseSummary: boolean
  hasPayroll: boolean
  hasInventoryCogs: boolean
  bridgeHoles: number
  recognition: TaxBookRecognition | null
  periodClosed: boolean
  schemaReady: boolean
  entityReady: boolean
}): TaxCloseChecklistStep[] {
  const baseBlocked = !input.schemaReady || !input.entityReady
  const recognition = input.recognition
  return [
    {
      id: 'opening',
      done: input.hasOpening || input.periodClosed,
      blocked: baseBlocked || input.periodClosed,
    },
    {
      id: 'vat',
      done: input.hasVatSummary,
      blocked: baseBlocked || input.periodClosed,
    },
    {
      id: 'sales',
      done: input.hasSalesSummary,
      blocked: baseBlocked || input.periodClosed,
    },
    {
      id: 'purchase',
      done: input.hasPurchaseSummary,
      blocked: baseBlocked || input.periodClosed,
    },
    {
      id: 'payroll',
      done: input.hasPayroll,
      blocked: baseBlocked || input.periodClosed,
    },
    {
      id: 'inventory',
      done: input.hasInventoryCogs,
      blocked: baseBlocked || input.periodClosed,
    },
    {
      id: 'bridge',
      done: input.bridgeHoles === 0 && recognition != null,
      blocked: baseBlocked,
      detail: input.bridgeHoles > 0 ? String(input.bridgeHoles) : undefined,
    },
    {
      id: 'recognize',
      done: Boolean(recognition?.recognized),
      blocked: baseBlocked,
      detail: recognition
        ? [
            recognition.trialBalanced ? 'tb' : 'tb_fail',
            recognition.outputVatTied ? 'out' : 'out_fail',
            recognition.inputVatTied ? 'in' : 'in_fail',
          ].join(',')
        : undefined,
    },
    {
      id: 'close',
      done: input.periodClosed,
      blocked: baseBlocked || !recognition?.recognized || input.periodClosed,
    },
  ]
}

export function inventoryConfirmValid(preview: number, confirmed: number): boolean {
  if (!Number.isFinite(confirmed) || confirmed < 0) return false
  if (!Number.isFinite(preview)) return confirmed >= 0
  // 미리보기와 달라도 사용자가 확정한 값을 허용한다. 0 이상만 보면 된다.
  return confirmed >= 0
}

export function amountsCloseForChecklist(a: number, b: number): boolean {
  return taxAmountsClose(a, b)
}
