import { PREPAYMENT_ACCOUNT_CODE, parseCardAccountIdFromPayeeCode } from '@/lib/prepayment-accrual-categories'

export type BankAdvanceTargetKind = 'store' | 'vendor' | 'card' | 'unknown'

export type BankAdvanceTargetRefs = {
  storeName?: string | null
  vendorCode?: string | null
}

export type BankAdvanceLabelContext = BankAdvanceTargetRefs & {
  vendors?: { code: string; name: string }[]
  cardAccounts?: { id: number; name: string }[]
  storeLabel?: string
  vendorLabel?: string
  cardLabel?: string
}

export function resolvePrepaymentAccountSubject<
  T extends { id?: number; code: string; name: string; nameEn?: string | null },
>(subjects: T[]): T | undefined {
  const byCode = subjects.find((s) => String(s.code || '').trim() === PREPAYMENT_ACCOUNT_CODE)
  if (byCode) return byCode
  return subjects.find((s) => /전도|선급금|prepayment/i.test(`${s.name || ''} ${s.nameEn || ''}`))
}

export function classifyBankAdvanceTarget(refs: BankAdvanceTargetRefs): BankAdvanceTargetKind {
  const store = String(refs.storeName || '').trim()
  const vendorCode = String(refs.vendorCode || '').trim()
  if (store) return 'store'
  if (parseCardAccountIdFromPayeeCode(vendorCode)) return 'card'
  if (vendorCode) return 'vendor'
  return 'unknown'
}

export function resolveBankAdvanceTargetLabel(ctx: BankAdvanceLabelContext): string {
  const kind = classifyBankAdvanceTarget(ctx)
  if (kind === 'store') {
    const store = String(ctx.storeName || '').trim()
    return store ? `${ctx.storeLabel || '매장'}: ${store}` : ''
  }
  if (kind === 'card') {
    const cardId = parseCardAccountIdFromPayeeCode(ctx.vendorCode)
    const card = ctx.cardAccounts?.find((c) => c.id === cardId)
    const name = card?.name || (cardId ? `card_${cardId}` : '')
    return name ? `${ctx.cardLabel || '카드'}: ${name}` : ''
  }
  if (kind === 'vendor') {
    const vc = String(ctx.vendorCode || '').trim()
    const vendor = ctx.vendors?.find((v) => v.code === vc)
    return `${ctx.vendorLabel || '거래처'}: ${vendor?.name || vc}`
  }
  return ''
}

export function encodeBankAdvanceSelectValue(refs: BankAdvanceTargetRefs): string {
  const store = String(refs.storeName || '').trim()
  const vendorCode = String(refs.vendorCode || '').trim()
  if (store) return `store:${store}`
  if (vendorCode) return `vendor:${vendorCode}`
  return '__none__'
}

export function decodeBankAdvanceSelectValue(value: string): BankAdvanceTargetRefs {
  if (!value || value === '__none__') return { storeName: '', vendorCode: '' }
  if (value.startsWith('store:')) return { storeName: value.slice(6), vendorCode: '' }
  if (value.startsWith('vendor:')) return { vendorCode: value.slice(7), storeName: '' }
  return { storeName: '', vendorCode: '' }
}

export function formatBankAdvanceAccountSubjectLabel(
  prepaymentSubject: { code: string; name: string; nameEn?: string | null } | null | undefined,
  targetLabel: string
): string {
  const base = prepaymentSubject
    ? `${prepaymentSubject.code} ${prepaymentSubject.name}`.trim()
    : `${PREPAYMENT_ACCOUNT_CODE} 선급금`
  if (!targetLabel) return base
  return `${base} · ${targetLabel}`
}
