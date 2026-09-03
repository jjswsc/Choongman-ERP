/**
 * 통장 노란 칩(store sales QR, Line man sales 등) → 용도·채널 정산 여부.
 * 직원은 칩만 고르고 저장. 수수료 분개는 저장 시 자동, 수정만 나중에 클릭.
 */
import { isPosChannelSettlementMemo } from '@/lib/bank-import-deposit-category'
import { bankDepositLoanCategorySelectValue } from '@/lib/bank-loan-categories'
import {
  defaultBankDepositSalesDate,
  bankDepositRecognitionDate,
} from '@/lib/pos-channel-reconcile-match'
import type { PosChannelSettlementChannel } from '@/lib/pos-channel-settlement'

export type PosBankChipKind = 'qr' | 'grab' | 'lineman' | 'shopee' | 'card' | 'delivery' | 'cash' | 'oil'

export function inferPosBankChipKind(
  ...texts: Array<string | undefined | null>
): PosBankChipKind | null {
  const s = texts.map((t) => String(t || '')).join(' \n ')
  if (!s.trim()) return null
  if (/sale\s*old\s*oil|\bold\s*oil\b|น้ำมันเก่า|น้ำมันใช้แล้ว|폐유/i.test(s)) return 'oil'
  if (
    /cash\s*deposit|ฝากเงินสด|นำเงินสดเข้าบัญชี|현금시재|시재입금|현금입금/i.test(s) ||
    /^\s*(cash|현금)\s*$/i.test(s.trim())
  ) {
    return 'cash'
  }
  if (/\b(line\s*man|lineman)\b/i.test(s)) return 'lineman'
  if (/\bshopee\b/i.test(s)) return 'shopee'
  if (/grabfood|\bgrab\b/i.test(s)) return 'grab'
  if (/\b(visa|master|mastercard|unionpay|jcb|edc|credit\s*card|บัตร|카드)\b/i.test(s)) return 'card'
  if (/\b(store\s*sales?\s*qr|qr|promptpay|พร้อมเพย์|truemoney|คิวอาร์|qr결제)\b/i.test(s)) return 'qr'
  if (/\b(delivery|배달)\b/i.test(s)) return 'delivery'
  return null
}

export function depositCategoryForPosBankChip(kind: PosBankChipKind): string {
  if (kind === 'oil') return 'other_income'
  if (kind === 'cash') return 'cash_to_bank'
  return 'receivable_receive'
}

export function settlementChannelForPosBankChip(
  kind: PosBankChipKind | null
): PosChannelSettlementChannel | null {
  if (kind === 'grab') return 'grab'
  if (kind === 'lineman') return 'lineman'
  if (kind === 'shopee') return 'shopee'
  if (kind === 'card') return 'card'
  if (kind === 'delivery') return 'delivery_all'
  return null
}

export function isFeeBearingPosBankChip(kind: PosBankChipKind | null): boolean {
  return settlementChannelForPosBankChip(kind) != null
}

/** 가맹 B2B 수금(칩 아님)은 매출 수령과 채널 정산을 같이 쓰면 안 됨 */
export function channelSettlementAllowsReceivableReceive(params: {
  memo?: string | null
  note?: string | null
}): boolean {
  return isPosChannelSettlementMemo(params.memo, params.note)
}

export type BankChannelSettlementAction = 'none' | 'post' | 'edit'

export function bankChannelSettlementRowAction(params: {
  memo?: string | null
  note?: string | null
  storeName?: string | null
  isChannelSettled?: boolean
}): BankChannelSettlementAction {
  if (!String(params.storeName || '').trim()) return 'none'
  if (!isFeeBearingPosBankChip(inferPosBankChipKind(params.memo, params.note))) return 'none'
  return params.isChannelSettled ? 'edit' : 'post'
}

export const BANK_DEPOSIT_QR_CHIP_SELECT_VALUE = '__chip_qr'
export const BANK_DEPOSIT_QR_CHIP_PHRASE = 'store sales QR'

export function isBankDepositQrChipSelectValue(value: string | null | undefined): boolean {
  return String(value || '').trim() === BANK_DEPOSIT_QR_CHIP_SELECT_VALUE
}

export function appendBankChipNote(current: string, phrase: string): string {
  const cur = String(current || '').trim()
  const p = String(phrase || '').trim()
  if (!p) return cur
  if (!cur) return p
  if (cur.toLowerCase().includes(p.toLowerCase())) return cur
  return `${cur} | ${p}`
}

export function stripBankChipPhrase(current: string, phrase: string): string {
  const p = String(phrase || '').trim()
  if (!p) return String(current || '').trim()
  const parts = String(current || '')
    .split(/\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.toLowerCase() !== p.toLowerCase())
  return parts.join(' | ')
}

/** POS 매장 용도 칸: QR 은 매출 수령+칩 메모로 저장. 드롭다운에만 QR 로 보여 준다. */
export function bankDepositCategorySelectValue(params: {
  category: string | null | undefined
  hidePosRevenue?: boolean
  memo?: string | null
  note?: string | null
}): string {
  const cat = String(params.category || '').trim()
  if (
    params.hidePosRevenue &&
    (cat === 'receivable_receive' || !cat) &&
    inferPosBankChipKind(params.memo, params.note) === 'qr'
  ) {
    return BANK_DEPOSIT_QR_CHIP_SELECT_VALUE
  }
  return bankDepositLoanCategorySelectValue(cat)
}

export function applyBankDepositCategorySelect(params: {
  value: string
  transType?: string | null
  accountStore?: string | null
  currentNote?: string | null
}): { category: string; note?: string; storeName?: string } {
  const value = String(params.value || '').trim()
  const currentNote = String(params.currentNote || '')
  if (isBankDepositQrChipSelectValue(value)) {
    const chipPatch = bankChipSavePatch({
      phrase: BANK_DEPOSIT_QR_CHIP_PHRASE,
      transType: params.transType || 'deposit',
      accountStore: params.accountStore,
    })
    return {
      category: chipPatch.category || 'receivable_receive',
      note: appendBankChipNote(currentNote, BANK_DEPOSIT_QR_CHIP_PHRASE),
      ...(chipPatch.storeName ? { storeName: chipPatch.storeName } : {}),
    }
  }
  const stripped = stripBankChipPhrase(currentNote, BANK_DEPOSIT_QR_CHIP_PHRASE)
  return {
    category: value,
    ...(stripped !== currentNote ? { note: stripped } : {}),
  }
}

export function bankChipSavePatch(params: {
  phrase: string
  transType?: string | null
  accountStore?: string | null
}): { category?: string; storeName?: string } {
  if (String(params.transType || '').toLowerCase() !== 'deposit') return {}
  const kind = inferPosBankChipKind(params.phrase)
  if (!kind) return {}
  const category = depositCategoryForPosBankChip(kind)
  const store = String(params.accountStore || '').trim()
  if (category === 'receivable_receive' && store) {
    return { category, storeName: store }
  }
  return { category }
}

export function channelFeeSettleDateCandidates(params: {
  transDate?: string | null
  salesDate?: string | null
}): string[] {
  const out: string[] = []
  const push = (d: string) => {
    const ymd = String(d || '').trim().slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd) && !out.includes(ymd)) out.push(ymd)
  }
  push(String(params.salesDate || ''))
  push(bankDepositRecognitionDate({ transDate: params.transDate, salesDate: params.salesDate }))
  push(defaultBankDepositSalesDate(String(params.transDate || ''), { sameDay: true }))
  return out
}
