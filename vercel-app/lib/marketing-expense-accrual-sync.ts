/**
 * 마케팅 실비 저장 시 지출관리 지급예정(expense_accruals, status=planned) 동기화.
 * 본사 권한(director|officer|ceo|hr)일 때만 생성/수정/삭제.
 */

import {
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdate,
  supabaseDeleteByFilter,
} from '@/lib/supabase-server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import {
  postExpenseAccrualJournal,
  deleteJournalEntriesBySource,
  assertAccountingDateOpen,
} from '@/lib/accounting-posting'

export type MarketingExpenseChannel = 'ad' | 'influencer' | 'material' | 'promo'

export type MarketingExpenseSyncResult = {
  /** undefined = FK 컬럼 변경 없음 | null = 연동 해제 | number = 연동 ID */
  linkExpenseAccrualId?: number | null
  message?: string
}

const CHANNEL_KO: Record<MarketingExpenseChannel, string> = {
  ad: '광고',
  influencer: '인플루언서',
  material: '홍보물',
  promo: '프로모션',
}

function encodeExpensePayeeCode(base: string): string {
  const b = String(base || '').trim()
  if (!b) return 'auto_expense::wm::expense'
  if (b.includes('::wm::')) return b
  return `${b}::wm::expense`
}

export function isOfficeRoleForMarketingExpenseSync(userRole: string): boolean {
  const r = String(userRole || '').toLowerCase()
  return ['director', 'officer', 'ceo', 'hr'].some((x) => r.includes(x))
}

export async function fetchCampaignMetaForExpenseMemo(campaignId: string): Promise<{
  topic: string
  campaignNo: string
} | null> {
  const rows = (await supabaseSelectFilter(
    'marketing_campaigns',
    `id=eq.${encodeURIComponent(campaignId)}`,
    { select: 'topic,campaign_no', limit: 1 }
  )) as { topic?: string; campaign_no?: string }[] | null
  const r = rows?.[0]
  if (!r) return null
  return { topic: String(r.topic || '').trim(), campaignNo: String(r.campaign_no || '').trim() }
}

function buildMemo(params: {
  channel: MarketingExpenseChannel
  campaignNo: string
  campaignTopic: string
  detailLine: string
}): string {
  const no = params.campaignNo ? `[${params.campaignNo}] ` : ''
  const topic = params.campaignTopic || '캠페인'
  const det = params.detailLine.trim()
  const base = `[마케팅·${CHANNEL_KO[params.channel]}] ${no}${topic}${det ? ` | ${det}` : ''}`
  return base.slice(0, 480)
}

type AccrualRow = {
  id?: number
  status?: string
  expense_date?: string
  payee_code?: string
  payee_name?: string | null
  store_name?: string | null
  amount?: number
  memo?: string | null
  account_subject_id?: number | null
  created_by?: string | null
}

type PayableMini = { id?: number; amount?: number }

async function deletePlannedAccrual(expenseAccrualId: number): Promise<void> {
  const rows = (await supabaseSelectFilter('expense_accruals', `id=eq.${expenseAccrualId}`, {
    select: 'id,status,expense_date',
    limit: 1,
  })) as AccrualRow[] | null
  const row = rows?.[0]
  if (!row?.id) return
  const status = String(row.status || '').toLowerCase()
  if (status !== 'planned') {
    throw new Error('이미 승인·지급 처리된 지급예정은 마케팅 화면에서 삭제할 수 없습니다. 지출 관리에서 처리해 주세요.')
  }
  await assertAccountingDateOpen(String(row.expense_date || '').slice(0, 10))
  await deleteJournalEntriesBySource('expense_accrual', expenseAccrualId)
  await supabaseDeleteByFilter('payable_transactions', `expense_accrual_id=eq.${expenseAccrualId}`)
  await supabaseDeleteByFilter('expense_accruals', `id=eq.${expenseAccrualId}`)
}

async function updatePlannedAccrual(
  expenseAccrualId: number,
  params: {
    amount: number
    expenseDate: string
    dueDate: string | null
    memo: string
    payeeCode: string
    payeeName: string
    userName?: string
  }
): Promise<void> {
  const rows = (await supabaseSelectFilter('expense_accruals', `id=eq.${expenseAccrualId}`, {
    select: 'id,status,expense_date,memo,account_subject_id,created_by,payee_name,store_name',
    limit: 1,
  })) as AccrualRow[] | null
  const row = rows?.[0]
  if (!row?.id) throw new Error('지급예정을 찾을 수 없습니다.')
  const status = String(row.status || '').toLowerCase()
  if (status !== 'planned') {
    throw new Error('승인 전(지급예정) 상태에서만 금액을 수정할 수 있습니다.')
  }
  await assertAccountingDateOpen(params.expenseDate)
  const encoded = encodeExpensePayeeCode(params.payeeCode)
  const accountSubjectId = row.account_subject_id != null ? Number(row.account_subject_id) : null

  await supabaseUpdate('expense_accruals', expenseAccrualId, {
    payee_code: encoded,
    payee_name: params.payeeName,
    amount: params.amount,
    expense_date: params.expenseDate,
    due_date: params.dueDate,
    memo: params.memo || null,
    updated_at: new Date().toISOString(),
  })

  const payables = (await supabaseSelectFilter(
    'payable_transactions',
    `expense_accrual_id=eq.${expenseAccrualId}`,
    { select: 'id,amount', limit: 50 }
  )) as PayableMini[] | null
  for (const p of payables || []) {
    if (!p.id) continue
    const a = Number(p.amount || 0)
    if (a <= 0) continue
    await supabaseUpdate('payable_transactions', p.id, {
      vendor_code: params.payeeCode.startsWith('auto_') ? null : params.payeeCode,
      amount: params.amount,
      trans_date: params.expenseDate,
      memo: params.memo ? `지출발생: ${params.memo.slice(0, 200)}` : '지출발생',
      expense_date: params.expenseDate,
      due_date: params.dueDate,
    })
  }

  let subjectCode = '5520'
  let subjectName = '기타경비'
  if (accountSubjectId && accountSubjectId > 0) {
    const subjectRows = (await supabaseSelectFilter(
      'account_subjects',
      `id=eq.${accountSubjectId}`,
      { select: 'id,code,name', limit: 1 }
    )) as { code?: string; name?: string }[] | null
    if (subjectRows?.[0]?.code) subjectCode = String(subjectRows[0].code)
    if (subjectRows?.[0]?.name) subjectName = String(subjectRows[0].name)
  }

  await deleteJournalEntriesBySource('expense_accrual', expenseAccrualId)
  await postExpenseAccrualJournal({
    expenseAccrualId,
    accountingDate: params.expenseDate,
    amountAbs: Math.abs(params.amount),
    expenseAccountCode: subjectCode,
    expenseAccountName: subjectName,
    expenseAccountSubjectId: accountSubjectId,
    memo: params.memo || `지출 발생 ${params.payeeName}`,
    storeName: String(row.store_name || '') || undefined,
    postedBy: params.userName || String(row.created_by || '').trim() || undefined,
  })
}

async function createPlannedAccrual(params: {
  payeeCode: string
  payeeName: string
  amount: number
  expenseDate: string
  dueDate: string | null
  memo: string
  userName?: string
}): Promise<number> {
  const encoded = encodeExpensePayeeCode(params.payeeCode)
  const inserted = (await supabaseInsert('expense_accruals', {
    payee_code: encoded,
    payee_name: params.payeeName,
    amount: params.amount,
    expense_date: params.expenseDate,
    due_date: params.dueDate,
    memo: params.memo || null,
    store_name: null,
    created_by: params.userName || null,
    status: 'planned',
  })) as { id?: number }[]
  const expenseAccrualId = Number(inserted?.[0]?.id || 0)
  if (!expenseAccrualId) throw new Error('지급예정 등록에 실패했습니다.')

  await supabaseInsert('payable_transactions', {
    vendor_code: params.payeeCode.startsWith('auto_') ? null : params.payeeCode,
    amount: Math.abs(params.amount),
    ref_type: 'Expense',
    ref_id: null,
    trans_date: params.expenseDate,
    memo: params.memo ? `지출발생: ${params.memo.slice(0, 200)}` : '지출발생',
    expense_accrual_id: expenseAccrualId,
    account_subject_id: null,
    expense_date: params.expenseDate,
    due_date: params.dueDate,
  })

  try {
    await postExpenseAccrualJournal({
      expenseAccrualId,
      accountingDate: params.expenseDate,
      amountAbs: params.amount,
      expenseAccountCode: '5520',
      expenseAccountName: '기타경비',
      expenseAccountSubjectId: null,
      memo: params.memo || `지출 발생 ${params.payeeName}`,
      postedBy: params.userName || undefined,
    })
  } catch (e) {
    console.error('createPlannedAccrual journal:', e)
  }

  return expenseAccrualId
}

/**
 * @param amount 실제 비용 (0이면 연동된 지급예정이 요청 상태면 삭제)
 */
export async function syncMarketingExpenseAccrual(params: {
  userRole?: string
  userName?: string
  campaignId: string
  campaignTopic: string
  campaignNo: string
  channel: MarketingExpenseChannel
  recordId: string
  amount: number
  expenseDate: string
  dueDate?: string | null
  detailLine: string
  existingExpenseAccrualId?: number | null
}): Promise<MarketingExpenseSyncResult> {
  if (!isOfficeRoleForMarketingExpenseSync(params.userRole || '')) {
    return {
      message:
        params.amount > 0
          ? '본사 권한 계정으로 저장하면 실비가 지출관리 지급예정에 자동 반영됩니다.'
          : undefined,
    }
  }

  const amt = Math.abs(Number(params.amount) || 0)
  let expenseDate = String(params.expenseDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
    expenseDate = getBangkokTodayDateString()
  }
  const dueDate =
    params.dueDate != null && String(params.dueDate).trim()
      ? String(params.dueDate).slice(0, 10)
      : null

  const payeeCode = `mkt_${params.channel}_${params.recordId}`
  const payeeName = `마케팅·${CHANNEL_KO[params.channel]}`
  const memo = buildMemo({
    channel: params.channel,
    campaignNo: params.campaignNo,
    campaignTopic: params.campaignTopic,
    detailLine: params.detailLine,
  })

  const existingId =
    params.existingExpenseAccrualId != null && params.existingExpenseAccrualId > 0
      ? Number(params.existingExpenseAccrualId)
      : null

  try {
    if (amt <= 0) {
      if (existingId) {
        await deletePlannedAccrual(existingId)
        return { linkExpenseAccrualId: null, message: '지급예정에서 제거되었습니다.' }
      }
      return {}
    }

    await assertAccountingDateOpen(expenseDate)

    if (existingId) {
      await updatePlannedAccrual(existingId, {
        amount: amt,
        expenseDate,
        dueDate,
        memo,
        payeeCode,
        payeeName,
        userName: params.userName,
      })
      return { linkExpenseAccrualId: existingId, message: '지급예정이 갱신되었습니다.' }
    }

    const newId = await createPlannedAccrual({
      payeeCode,
      payeeName,
      amount: amt,
      expenseDate,
      dueDate,
      memo,
      userName: params.userName,
    })
    return { linkExpenseAccrualId: newId, message: '지출관리 지급예정에 등록되었습니다.' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('syncMarketingExpenseAccrual:', e)
    return { message: `지급예정 연동: ${msg}` }
  }
}
