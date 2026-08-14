/**
 * 고정자산 취득 → 지출관리 지급예정(expense_accruals) 생성.
 * 통장「지출관리 연결」에서 잔액·매장 일치 시 연결할 수 있게 합니다.
 */
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { postExpenseAccrualJournal, deleteJournalEntriesBySource } from '@/lib/accounting-posting'
import { allocateExpenseDocumentNo } from '@/lib/expense-document-no-server'
import {
  assertSaasTenantWritable,
  stampSaasTenantId,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'
import { resolveAccountSubjectByCodes, DEFAULT_FIXED_ASSET_ACCOUNT_CODES } from '@/lib/fixed-asset-from-expense'

export const FIXED_ASSET_ACCRUAL_MEMO_PREFIX = '[AUTO:FA:'

export function fixedAssetAccrualMemoMarker(fixedAssetId: number): string {
  return `${FIXED_ASSET_ACCRUAL_MEMO_PREFIX}${Number(fixedAssetId)}]`
}

export function buildFixedAssetAccrualMemo(params: {
  fixedAssetId: number
  assetName: string
  assetCode?: string | null
  extraMemo?: string | null
}): string {
  const marker = fixedAssetAccrualMemoMarker(params.fixedAssetId)
  const code = String(params.assetCode || '').trim()
  const name = String(params.assetName || '').trim() || '고정자산'
  const extra = String(params.extraMemo || '').trim()
  const base = `${marker} ${code ? `${code} ` : ''}${name}`
  const full = extra ? `${base} | ${extra}` : base
  return full.slice(0, 480)
}

export function encodeFixedAssetPayeeCode(assetCode: string): string {
  const code = String(assetCode || '').trim() || 'fixed_asset'
  const safe = code.replace(/\s+/g, '_').slice(0, 80)
  return `${safe}::wm::fixed_asset`
}

function isMissingExpenseAccrualIdColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('42703') || msg.includes('expense_accrual_id')
}

export async function linkFixedAssetToExpenseAccrual(
  fixedAssetId: number,
  expenseAccrualId: number
): Promise<void> {
  const id = Number(fixedAssetId || 0)
  const accrualId = Number(expenseAccrualId || 0)
  if (id <= 0 || accrualId <= 0) return
  try {
    await supabaseUpdate('fixed_assets', id, { expense_accrual_id: accrualId })
  } catch (e) {
    if (!isMissingExpenseAccrualIdColumnError(e)) throw e
  }
}

export async function findExpenseAccrualIdForFixedAsset(params: {
  fixedAssetId: number
  expenseAccrualIdOnAsset?: number | null
}): Promise<number | null> {
  const fromCol = Number(params.expenseAccrualIdOnAsset || 0)
  if (fromCol > 0) return fromCol
  const id = Number(params.fixedAssetId || 0)
  if (id <= 0) return null
  const marker = fixedAssetAccrualMemoMarker(id)
  try {
    const rows = (await supabaseSelectFilter(
      'expense_accruals',
      `memo=ilike.${encodeURIComponent(`%${marker}%`)}`,
      { select: 'id,status', order: 'id.desc', limit: 5 }
    )) as { id?: number; status?: string }[] | null
    const first = (rows || []).find((r) => Number(r.id || 0) > 0)
    return first?.id ? Number(first.id) : null
  } catch {
    return null
  }
}

export type CreateExpenseAccrualForFixedAssetParams = {
  fixedAssetId: number
  assetCode: string
  assetName: string
  storeName: string
  acquisitionDate: string
  acquisitionCost: number
  assetAccountCode?: string | null
  memo?: string | null
  createdBy?: string | null
  tenantScope: SaasTenantScope
}

export type CreateExpenseAccrualForFixedAssetResult =
  | { ok: true; expenseAccrualId: number }
  | { ok: false; message: string }

/**
 * 이미 지급예정이 있으면 재생성하지 않고 기존 ID를 반환합니다.
 */
export async function createExpenseAccrualForFixedAsset(
  params: CreateExpenseAccrualForFixedAssetParams
): Promise<CreateExpenseAccrualForFixedAssetResult> {
  const fixedAssetId = Number(params.fixedAssetId || 0)
  if (fixedAssetId <= 0) {
    return { ok: false, message: '자산 ID가 필요합니다.' }
  }

  const storeName = String(params.storeName || '').trim()
  if (!storeName || storeName.toLowerCase() === 'all') {
    return {
      ok: false,
      message: '지급예정 생성에는 매장명이 필요합니다. (All 불가 — 통장 연결 시 매장 일치 필요)',
    }
  }

  const acquisitionCost = Math.round(Math.max(0, Number(params.acquisitionCost) || 0) * 100) / 100
  if (!(acquisitionCost > 0)) {
    return { ok: false, message: '취득가가 0보다 커야 지급예정을 만들 수 있습니다.' }
  }

  const acquisitionDate = String(params.acquisitionDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acquisitionDate)) {
    return { ok: false, message: '취득일 형식이 올바르지 않습니다.' }
  }

  const tenantError =
    assertSaasTenantWritable(params.tenantScope, {
      tableHint: 'expense_accruals',
      label: '지출 발생',
    }) ||
    assertSaasTenantWritable(params.tenantScope, {
      tableHint: 'payable_transactions',
      label: '미지급 거래',
    })
  if (tenantError) {
    return { ok: false, message: tenantError }
  }

  const existingId = await findExpenseAccrualIdForFixedAsset({
    fixedAssetId,
    expenseAccrualIdOnAsset: null,
  })
  if (existingId) {
    await linkFixedAssetToExpenseAccrual(fixedAssetId, existingId)
    return { ok: true, expenseAccrualId: existingId }
  }

  // 자산 행에 이미 FK가 있으면 재사용
  try {
    const assetRows = (await supabaseSelectFilter('fixed_assets', `id=eq.${fixedAssetId}`, {
      select: 'id,expense_accrual_id',
      limit: 1,
    })) as { expense_accrual_id?: number | null }[] | null
    const linked = Number(assetRows?.[0]?.expense_accrual_id || 0)
    if (linked > 0) {
      return { ok: true, expenseAccrualId: linked }
    }
  } catch (e) {
    if (!isMissingExpenseAccrualIdColumnError(e)) throw e
  }

  const assetCode = String(params.assetCode || '').trim() || `FA-${fixedAssetId}`
  const assetName = String(params.assetName || '').trim() || '고정자산'
  const assetAccountCode = String(params.assetAccountCode || '').trim()
  const subject =
    (assetAccountCode
      ? await resolveAccountSubjectByCodes([assetAccountCode, ...DEFAULT_FIXED_ASSET_ACCOUNT_CODES])
      : await resolveAccountSubjectByCodes(DEFAULT_FIXED_ASSET_ACCOUNT_CODES)) || null

  let documentNo: string | null = null
  try {
    documentNo = await allocateExpenseDocumentNo(acquisitionDate)
  } catch (docErr) {
    console.error('createExpenseAccrualForFixedAsset document_no:', docErr)
    return {
      ok: false,
      message: '문서번호 발급에 실패했습니다. expense_document_no SQL을 확인해 주세요.',
    }
  }

  const memo = buildFixedAssetAccrualMemo({
    fixedAssetId,
    assetName,
    assetCode,
    extraMemo: params.memo,
  })
  const payeeCode = encodeFixedAssetPayeeCode(assetCode)
  const subjectCode = subject?.code || assetAccountCode || '1490'
  const subjectName = subject?.name || '기타유형자산'

  const accrualRow = stampSaasTenantId<Record<string, unknown>>(
    {
      payee_code: payeeCode,
      payee_name: assetName,
      amount: acquisitionCost,
      vat_amount: null,
      withholding_tax_amount: null,
      expense_date: acquisitionDate,
      due_date: acquisitionDate,
      memo,
      store_name: storeName,
      created_by: String(params.createdBy || '').trim() || null,
      status: 'planned',
      document_no: documentNo,
      ...(subject?.id ? { account_subject_id: subject.id } : {}),
    },
    params.tenantScope,
    'expense_accruals'
  )

  const inserted = (await supabaseInsert('expense_accruals', accrualRow)) as { id?: number }[]
  const expenseAccrualId = Number(inserted?.[0]?.id || 0)
  if (!expenseAccrualId) {
    return { ok: false, message: '지출 발생 등록에 실패했습니다.' }
  }

  await supabaseInsert(
    'payable_transactions',
    stampSaasTenantId(
      {
        vendor_code: null,
        amount: acquisitionCost,
        ref_type: 'Expense',
        ref_id: null,
        trans_date: acquisitionDate,
        memo: `고정자산 취득: ${assetName}`.slice(0, 200),
        expense_accrual_id: expenseAccrualId,
        account_subject_id: subject?.id ?? null,
        expense_date: acquisitionDate,
        due_date: acquisitionDate,
      },
      params.tenantScope,
      'payable_transactions'
    )
  )

  try {
    await postExpenseAccrualJournal({
      expenseAccrualId,
      accountingDate: acquisitionDate,
      amountAbs: acquisitionCost,
      expenseAccountCode: subjectCode,
      expenseAccountName: subjectName,
      expenseAccountSubjectId: subject?.id ?? null,
      memo: `고정자산 취득 ${assetName}`,
      storeName,
      postedBy: String(params.createdBy || '').trim() || undefined,
    })
  } catch (postingErr) {
    console.error('createExpenseAccrualForFixedAsset posting:', postingErr)
  }

  await linkFixedAssetToExpenseAccrual(fixedAssetId, expenseAccrualId)
  return { ok: true, expenseAccrualId }
}

/** 자산 삭제 시: 미승인·미지급 지급예정만 함께 제거 */
export async function deletePlannedAccrualForFixedAssetIfSafe(
  fixedAssetId: number,
  expenseAccrualIdHint?: number | null
): Promise<void> {
  const accrualId =
    (await findExpenseAccrualIdForFixedAsset({
      fixedAssetId,
      expenseAccrualIdOnAsset: expenseAccrualIdHint,
    })) || 0
  if (accrualId <= 0) return

  const rows = (await supabaseSelectFilter('expense_accruals', `id=eq.${accrualId}`, {
    select: 'id,status',
    limit: 1,
  })) as { id?: number; status?: string }[] | null
  const status = String(rows?.[0]?.status || '').toLowerCase()
  if (status !== 'planned') return

  const payments = (await supabaseSelectFilter(
    'payable_transactions',
    `expense_accrual_id=eq.${accrualId}&ref_type=eq.Payment`,
    { select: 'id,bank_transaction_id,petty_cash_transaction_id', limit: 20 }
  )) as { id?: number; bank_transaction_id?: number | null; petty_cash_transaction_id?: number | null }[] | null
  const hasSettlement = (payments || []).some(
    (p) => Number(p.bank_transaction_id || 0) > 0 || Number(p.petty_cash_transaction_id || 0) > 0
  )
  if (hasSettlement) return

  try {
    await deleteJournalEntriesBySource('expense_accrual', accrualId)
  } catch (e) {
    console.warn('deletePlannedAccrualForFixedAsset journal:', e)
  }
  await supabaseDeleteByFilter('payable_transactions', `expense_accrual_id=eq.${accrualId}`)
  await supabaseDeleteByFilter('expense_accruals', `id=eq.${accrualId}`)
}
