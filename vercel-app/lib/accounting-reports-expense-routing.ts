import { storeMatchesIncomeFilter } from '@/lib/accounting-store-match'
import {
  supabaseSelect,
  supabaseSelectAllPages,
  supabaseSelectFilterAllPages,
} from '@/lib/supabase-server'
import type { FranchiseBillingPlSlice } from '@/lib/accounting-po-franchise-billing-pl'
import { PL_FRANCHISE_EXPENSE_SUBJECT_CODES } from '@/lib/accounting-po-franchise-billing-pl-shared'
import { PL_PETTY_CASH_PURCHASE_VENDOR_KEY } from '@/lib/income-statement-purchase-drill-nav'
import { safePlCashVat } from '@/lib/income-statement-cash-vat'
import {
  ACCOUNTING_ROWS_MAX,
  type IncomeStatementReport,
  isCardFeeWithdrawRow,
  isDeliveryAppFeeWithdrawRow,
  isHqAccountingStoreRow,
  round2,
} from '@/lib/accounting-reports-shared'

export function addToSubjectMap(map: Map<number | null, number>, subjectId: number | null | undefined, amount: number) {
  if (!amount) return
  const sid = subjectId != null && !isNaN(Number(subjectId)) ? Number(subjectId) : null
  map.set(sid, (map.get(sid) || 0) + amount)
}

export type AccountSubjectMetaRow = {
  code: string
  name: string
  nameEn: string | null
  nameTh: string | null
  type: string
  pAndLSection: string | null
  statementType: string | null
}

export function feeAccountSubjectIdsFromMeta(
  subjectMeta: Map<number, AccountSubjectMetaRow>
): { deliveryIds: Set<number>; cardIds: Set<number>; allIds: number[] } {
  const deliveryIds = new Set<number>()
  const cardIds = new Set<number>()
  for (const [id, meta] of subjectMeta) {
    const code = String(meta.code || '').trim()
    if (code === '5528') deliveryIds.add(id)
    if (code === '5529') cardIds.add(id)
  }
  return { deliveryIds, cardIds, allIds: [...deliveryIds, ...cardIds] }
}

export async function loadAccountSubjectMeta(): Promise<Map<number, AccountSubjectMetaRow>> {
  const out = new Map<number, AccountSubjectMetaRow>()
  try {
    const rows = (await supabaseSelect('account_subjects', {
      select: 'id,code,name,name_en,name_th,type,p_and_l_section,statement_type',
      limit: 2000,
      order: 'sort_order.asc,code.asc',
    })) as
      | {
          id?: number
          code?: string
          name?: string
          name_en?: string | null
          name_th?: string | null
          type?: string
          p_and_l_section?: string | null
          statement_type?: string | null
        }[]
      | null
    for (const r of rows || []) {
      const id = r.id != null ? Number(r.id) : NaN
      if (isNaN(id)) continue
      const code = String(r.code || '').trim()
      const name = String(r.name || '').trim()
      const ne = r.name_en != null ? String(r.name_en).trim() : ''
      const nt = r.name_th != null ? String(r.name_th).trim() : ''
      const type = String((r as { type?: string }).type || '').trim().toLowerCase()
      const pAndLSectionRaw = String((r as { p_and_l_section?: string }).p_and_l_section || '').trim()
      const statementTypeRaw = String((r as { statement_type?: string }).statement_type || '').trim()
      out.set(id, {
        code,
        name,
        nameEn: ne || null,
        nameTh: nt || null,
        type,
        pAndLSection: pAndLSectionRaw ? pAndLSectionRaw.toLowerCase() : null,
        statementType: statementTypeRaw ? statementTypeRaw.toLowerCase() : null,
      })
    }
  } catch {
    // ignore
  }
  return out
}

export async function loadItemAccountSubjectMap(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    const rows = (await supabaseSelectAllPages('items', {
      select: 'code,account_subject_id',
      order: 'id.asc',
      pageSize: 8000,
      maxRows: ACCOUNTING_ROWS_MAX,
    })) as { code?: string; account_subject_id?: number | null }[] | null
    for (const r of rows || []) {
      const code = String(r.code || '').trim()
      const sid = r.account_subject_id != null ? Number(r.account_subject_id) : NaN
      if (!code || !Number.isFinite(sid) || sid <= 0) continue
      out.set(code, sid)
    }
  } catch {
    // account_subject_id 컬럼 미배포 환경 호환
  }
  return out
}

export function isExpenseRoutedItem(
  itemCode: string,
  itemAccountSubjectMap: Map<string, number>,
  accountSubjectMeta: Map<number, AccountSubjectMetaRow>
): { isExpense: boolean; subjectId: number | null } {
  const sid = itemAccountSubjectMap.get(String(itemCode || '').trim())
  if (!sid || !Number.isFinite(sid) || sid <= 0) return { isExpense: false, subjectId: null }
  const meta = accountSubjectMeta.get(sid)
  if (!meta) return { isExpense: false, subjectId: sid }
  const isExpenseType = meta.type === 'expense'
  const isCostSection = meta.pAndLSection === 'cost'
  return { isExpense: isExpenseType && !isCostSection, subjectId: sid }
}

/**
 * 패티캐시·통장 지출의 손익「비용」반영 — expense 계정 중 매출원가(cost)는 제외(매입).
 * 계정 미지정·메타 없는 id는 기존과 같이 비용(시인성).
 * 자산·부채·이체(1110) 등 type≠expense 는 비용이 아님(이체/BS — 매입으로도 넣지 않음).
 */
export function isPlExpenseAccountSubject(
  subjectId: number | null | undefined,
  accountSubjectMeta: Map<number, AccountSubjectMetaRow>
): boolean {
  const sid = subjectId != null && !isNaN(Number(subjectId)) ? Number(subjectId) : null
  if (!sid || sid <= 0) return true
  const meta = accountSubjectMeta.get(sid)
  if (!meta) return true
  if (meta.type !== 'expense') return false
  return meta.pAndLSection !== 'cost'
}

/**
 * 지출등록「배달앱/카드 수수료」(계정 5528/5529) 지급예정 — 손익 비용 반영.
 * 통장 지급 연결분은 linkedBankTransactionIds 로 넘기고 통장 집계에서 제외해 이중계상 방지.
 */
export async function loadDeliveryCardFeeAccrualsForPl(params: {
  startStr: string
  endStr: string
  storeFilter: string
  isHQ: boolean
  subjectMeta: Map<number, AccountSubjectMetaRow>
}): Promise<{
  bySubject: Map<number | null, number>
  bySubjectVat: Map<number | null, number>
  deliveryAppFees: number
  cardFees: number
  cashExpenseVat: number
  linkedBankTransactionIds: Set<number>
  fetched: number
  rows: {
    id: number
    expenseDate: string
    amount: number
    store: string | null
    memo: string | null
    accountSubjectId: number
  }[]
}> {
  const empty = {
    bySubject: new Map<number | null, number>(),
    bySubjectVat: new Map<number | null, number>(),
    deliveryAppFees: 0,
    cardFees: 0,
    cashExpenseVat: 0,
    linkedBankTransactionIds: new Set<number>(),
    fetched: 0,
    rows: [] as {
      id: number
      expenseDate: string
      amount: number
      store: string | null
      memo: string | null
      accountSubjectId: number
    }[],
  }
  const { deliveryIds, cardIds, allIds } = feeAccountSubjectIdsFromMeta(params.subjectMeta)
  if (allIds.length === 0) return empty

  try {
    const idList = allIds.join(',')
    const filter =
      `expense_date=gte.${params.startStr}&expense_date=lte.${params.endStr}` +
      `&account_subject_id=in.(${idList})&status=in.(approved,partial,paid)`
    const rows = (await supabaseSelectFilterAllPages('expense_accruals', filter, {
      select: 'id,amount,vat_amount,store_name,account_subject_id,payee_code,memo,status,expense_date',
      order: 'id.asc',
      pageSize: 2000,
      maxRows: ACCOUNTING_ROWS_MAX,
    })) as {
      id?: number
      amount?: number
      vat_amount?: number | null
      store_name?: string | null
      account_subject_id?: number | null
      payee_code?: string | null
      memo?: string | null
      status?: string | null
      expense_date?: string | null
    }[]

    const bySubject = new Map<number | null, number>()
    const bySubjectVat = new Map<number | null, number>()
    let deliveryAppFees = 0
    let cardFees = 0
    let cashExpenseVat = 0
    const accrualIds: number[] = []
    const detailRows: {
      id: number
      expenseDate: string
      amount: number
      store: string | null
      memo: string | null
      accountSubjectId: number
    }[] = []

    for (const r of rows || []) {
      const status = String(r.status || '').toLowerCase()
      // 승인·일부지급·지급완료만 손익 비용. planned(요청)는 제외.
      if (status !== 'approved' && status !== 'partial' && status !== 'paid') continue
      const storeName = String(r.store_name || '').trim()
      if (params.isHQ) {
        if (!isHqAccountingStoreRow(storeName)) continue
      } else if (params.storeFilter !== 'All') {
        if (!storeMatchesIncomeFilter(storeName, params.storeFilter)) continue
      }
      const sid =
        r.account_subject_id != null && !isNaN(Number(r.account_subject_id))
          ? Number(r.account_subject_id)
          : null
      if (sid == null || (!deliveryIds.has(sid) && !cardIds.has(sid))) continue
      if (!isPlExpenseAccountSubject(sid, params.subjectMeta)) continue

      const amt = Math.abs(Number(r.amount) || 0)
      if (!amt) continue
      const vat = safePlCashVat(amt, r.vat_amount).vat
      const accrualId = Number(r.id || 0)
      if (accrualId > 0) accrualIds.push(accrualId)

      addToSubjectMap(bySubject, sid, amt)
      if (vat > 0) {
        addToSubjectMap(bySubjectVat, sid, vat)
        cashExpenseVat += vat
      }
      if (deliveryIds.has(sid)) deliveryAppFees += amt
      else if (cardIds.has(sid)) cardFees += amt

      if (accrualId > 0) {
        detailRows.push({
          id: accrualId,
          expenseDate: String(r.expense_date || '').slice(0, 10),
          amount: amt,
          store: storeName || null,
          memo: r.memo != null ? String(r.memo) : null,
          accountSubjectId: sid,
        })
      }
    }

    const linkedBankTransactionIds = new Set<number>()
    if (accrualIds.length > 0) {
      const accrualList = accrualIds.join(',')
      const payables = (await supabaseSelectFilterAllPages(
        'payable_transactions',
        `expense_accrual_id=in.(${accrualList})&bank_transaction_id=not.is.null`,
        {
          select: 'bank_transaction_id,expense_accrual_id',
          order: 'id.asc',
          pageSize: 2000,
          maxRows: ACCOUNTING_ROWS_MAX,
        }
      )) as { bank_transaction_id?: number | null; expense_accrual_id?: number | null }[]
      for (const p of payables || []) {
        const bankId = Number(p.bank_transaction_id || 0)
        if (bankId > 0) linkedBankTransactionIds.add(bankId)
      }
    }

    return {
      bySubject,
      bySubjectVat,
      deliveryAppFees: round2(deliveryAppFees),
      cardFees: round2(cardFees),
      cashExpenseVat: round2(cashExpenseVat),
      linkedBankTransactionIds,
      fetched: rows?.length || 0,
      rows: detailRows,
    }
  } catch (e) {
    console.warn('loadDeliveryCardFeeAccrualsForPl:', e)
    return empty
  }
}

/** expense + p_and_l_section=cost → 손익「매입」 */
export function isPlCogsPurchaseAccountSubject(
  subjectId: number | null | undefined,
  accountSubjectMeta: Map<number, AccountSubjectMetaRow>
): boolean {
  const sid = subjectId != null && !isNaN(Number(subjectId)) ? Number(subjectId) : null
  if (!sid || sid <= 0) return false
  const meta = accountSubjectMeta.get(sid)
  if (!meta || meta.type !== 'expense') return false
  return meta.pAndLSection === 'cost'
}

export function addPettyCashRowToPl(params: {
  row: {
    amount?: number
    vat_amount?: number | null
    trans_type?: string
    account_subject_id?: number | null
    vendor_code?: string | null
  }
  subjectMeta: Map<number, AccountSubjectMetaRow>
  purchaseVendorMap: Record<string, number>
  purchaseVendorVatMap: Record<string, number>
  expenseBySubjectMap: Map<number | null, number>
  expenseVatBySubjectMap: Map<number | null, number>
  onExpense: (amt: number) => void
  onExpenseVat?: (vat: number) => void
  onPurchase: (amt: number) => void
  onPurchaseVat?: (vat: number) => void
  onSkippedNonPl?: (amt: number) => void
  /** 매입에 넣은 거래처 — 화면에서는 통장 총액(cash_gross)으로 표시 */
  cashVendorKeys?: Set<string>
}) {
  if ((params.row.trans_type || '').toLowerCase() !== 'expense') return
  const amt = Math.abs(Number(params.row.amount) || 0)
  if (!amt) return
  const vat = safePlCashVat(amt, params.row.vat_amount).vat
  if (isPlExpenseAccountSubject(params.row.account_subject_id, params.subjectMeta)) {
    params.onExpense(amt)
    addToSubjectMap(params.expenseBySubjectMap, params.row.account_subject_id, amt)
    if (vat > 0) {
      params.onExpenseVat?.(vat)
      addToSubjectMap(params.expenseVatBySubjectMap, params.row.account_subject_id, vat)
    }
    return
  }
  if (isPlCogsPurchaseAccountSubject(params.row.account_subject_id, params.subjectMeta)) {
    params.onPurchase(amt)
    const vKey = String(params.row.vendor_code || '').trim() || PL_PETTY_CASH_PURCHASE_VENDOR_KEY
    params.cashVendorKeys?.add(vKey)
    params.purchaseVendorMap[vKey] = (params.purchaseVendorMap[vKey] || 0) + amt
    if (vat > 0) {
      params.onPurchaseVat?.(vat)
      params.purchaseVendorVatMap[vKey] = (params.purchaseVendorVatMap[vKey] || 0) + vat
    }
    return
  }
  params.onSkippedNonPl?.(amt)
}

export function addBankExpenseWithdrawToPl(params: {
  row: {
    amount?: number
    vat_amount?: number | null
    account_subject_id?: number | null
    vendor_code?: string | null
    memo?: string | null
  }
  subjectMeta: Map<number, AccountSubjectMetaRow>
  purchaseVendorMap: Record<string, number>
  purchaseVendorVatMap: Record<string, number>
  expenseBySubjectMap: Map<number | null, number>
  expenseVatBySubjectMap: Map<number | null, number>
  resolvedVat?: number
  onExpense: (amt: number) => void
  onExpenseVat?: (vat: number) => void
  onPurchase: (amt: number) => void
  onPurchaseVat?: (vat: number) => void
  onDeliveryFee?: (amt: number) => void
  onCardFee?: (amt: number) => void
  onSkippedNonPl?: (amt: number) => void
  cashVendorKeys?: Set<string>
}) {
  const amt = Math.abs(Number(params.row.amount) || 0)
  if (!amt) return
  const vat =
    params.resolvedVat != null
      ? safePlCashVat(amt, params.resolvedVat).vat
      : safePlCashVat(amt, params.row.vat_amount).vat
  if (isPlExpenseAccountSubject(params.row.account_subject_id, params.subjectMeta)) {
    params.onExpense(amt)
    if (params.onDeliveryFee && isDeliveryAppFeeWithdrawRow(params.row)) params.onDeliveryFee(amt)
    if (params.onCardFee && isCardFeeWithdrawRow(params.row)) params.onCardFee(amt)
    addToSubjectMap(params.expenseBySubjectMap, params.row.account_subject_id, amt)
    if (vat > 0) {
      params.onExpenseVat?.(vat)
      addToSubjectMap(params.expenseVatBySubjectMap, params.row.account_subject_id, vat)
    }
    return
  }
  if (isPlCogsPurchaseAccountSubject(params.row.account_subject_id, params.subjectMeta)) {
    params.onPurchase(amt)
    const vKey = String(params.row.vendor_code || '').trim() || '__pl_vendor_unknown__'
    params.cashVendorKeys?.add(vKey)
    params.purchaseVendorMap[vKey] = (params.purchaseVendorMap[vKey] || 0) + amt
    if (vat > 0) {
      params.onPurchaseVat?.(vat)
      params.purchaseVendorVatMap[vKey] = (params.purchaseVendorVatMap[vKey] || 0) + vat
    }
    return
  }
  params.onSkippedNonPl?.(amt)
}

export function mergeExpenseSubjectMaps(
  target: Map<number | null, number>,
  source: Map<number | null, number>
) {
  for (const [k, v] of source) {
    target.set(k, (target.get(k) || 0) + v)
  }
}

/** 계정별 비용 맵 합계 — 펼침 행 합과 손익 비용 총액을 일치시킴 */
export function sumExpenseSubjectAmounts(map: Map<number | null, number>): number {
  let total = 0
  for (const v of map.values()) total += Number(v) || 0
  return round2(total)
}

export function buildExpenseByAccountList(
  map: Map<number | null, number>,
  meta: Map<number, AccountSubjectMetaRow>,
  vatMap?: Map<number | null, number>
): IncomeStatementReport['expenseByAccountSubject'] {
  const rows: NonNullable<IncomeStatementReport['expenseByAccountSubject']> = []
  for (const [sid, amt] of map) {
    if (!amt) continue
    const vatAmt = Math.max(0, Number(vatMap?.get(sid)) || 0)
    if (sid == null) {
      rows.push({
        accountSubjectId: null,
        code: '',
        name: '',
        nameEn: null,
        nameTh: null,
        amount: amt,
        ...(vatAmt > 0 ? { vatAmount: round2(vatAmt) } : {}),
      })
      continue
    }
    const m = meta.get(sid)
    rows.push({
      accountSubjectId: sid,
      code: m?.code ?? '',
      name: m?.name ?? '',
      nameEn: m?.nameEn ?? null,
      nameTh: m?.nameTh ?? null,
      amount: amt,
      ...(vatAmt > 0 ? { vatAmount: round2(vatAmt) } : {}),
    })
  }
  rows.sort((a, b) => b.amount - a.amount)
  return rows
}

/** 승인 회계 PO 가맹 청구 — 계정과목 펼침에 보이도록 합성 행 추가(5528 플랫폼 수수료와 분리) */
export function appendFranchiseBillingExpenseSubjects(
  rows: NonNullable<IncomeStatementReport['expenseByAccountSubject']> | undefined,
  franchise: FranchiseBillingPlSlice
): NonNullable<IncomeStatementReport['expenseByAccountSubject']> {
  const base = [...(rows || [])]
  const extras: NonNullable<IncomeStatementReport['expenseByAccountSubject']> = []
  const push = (
    code: string,
    amount: number,
    name: string,
    nameEn: string,
    nameTh: string
  ) => {
    if (amount <= 0) return
    extras.push({
      accountSubjectId: null,
      code,
      name,
      nameEn,
      nameTh,
      amount: round2(amount),
    })
  }
  push(
    PL_FRANCHISE_EXPENSE_SUBJECT_CODES.royalty,
    franchise.royaltyGross,
    '본사 로열티 청구 (승인 회계 PO)',
    'HQ royalty billing (approved accounting PO)',
    'ค่าสิทธิ์จากสำนักงานใหญ่ (PO บัญชีที่อนุมัติ)'
  )
  push(
    PL_FRANCHISE_EXPENSE_SUBJECT_CODES.deliveryGp,
    franchise.deliveryGpGross,
    '본사 배달 GP 청구 (승인 회계 PO)',
    'HQ delivery GP billing (approved accounting PO)',
    'Delivery GP จากสำนักงานใหญ่ (PO ที่อนุมัติ)'
  )
  push(
    PL_FRANCHISE_EXPENSE_SUBJECT_CODES.grabGp,
    franchise.grabGpGross,
    '본사 Grab GP 청구 (승인 회계 PO·추가 %)',
    'HQ Grab GP billing (approved PO · extra %)',
    'Grab GP จากสำนักงานใหญ่ (PO ที่อนุมัติ · % เพิ่ม)'
  )
  push(
    PL_FRANCHISE_EXPENSE_SUBJECT_CODES.combined,
    franchise.combinedGross,
    '본사 가맹 청구 합산 (승인 회계 PO)',
    'HQ franchise billing combined (approved PO)',
    'เรียกเก็บแฟรนไชส์รวม (PO ที่อนุมัติ)'
  )
  if (extras.length === 0) return base
  return [...base, ...extras].sort((a, b) => b.amount - a.amount)
}

const BANK_PL_EXCLUDED_WITHDRAW_CATEGORIES = new Set([
  'transfer',
  'correction',
  'loan',
  'advance',
  'unclassified',
  'purchase_payment',
])

export function bankWithdrawCountsTowardPlExpense(category: string | null | undefined): boolean {
  return !BANK_PL_EXCLUDED_WITHDRAW_CATEGORIES.has(String(category || 'expense').toLowerCase())
}

/** 인식일이 있으면 그 달, 없으면 출금일. 비용·매입 대금 공통 */
export function bankExpenseInPlPeriod(
  transDate: string,
  expenseDate: string | null | undefined,
  startStr: string,
  endStr: string
): boolean {
  const expDate = expenseDate ? String(expenseDate).slice(0, 10) : null
  const td = String(transDate || '').slice(0, 10)
  const inRange = (d: string) => d >= startStr && d <= endStr
  return (expDate != null && inRange(expDate)) || (!expDate && inRange(td))
}
