import { supabaseRpc, supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { bangkokYyyymmFromDate, buildExpenseDocumentNo, isExpenseDocumentNo } from '@/lib/expense-document-no'

function isMissingRpcError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('404') ||
    msg.includes('does not exist') ||
    msg.includes('pgrst202') ||
    msg.includes('could not find the function')
  )
}

async function allocateViaFallback(yyyymm: string): Promise<string> {
  const rows = (await supabaseSelectFilter('expense_document_seq', `yyyymm=eq.${yyyymm}`, {
    select: 'yyyymm,last_seq',
    limit: 1,
  })) as { yyyymm?: string; last_seq?: number }[] | null
  const current = Number(rows?.[0]?.last_seq || 0)
  const next = current + 1
  await supabaseUpsert(
    'expense_document_seq',
    [
      {
        yyyymm,
        last_seq: next,
        updated_at: new Date().toISOString(),
      },
    ],
    'yyyymm'
  )
  return buildExpenseDocumentNo(yyyymm, next)
}

/**
 * 월별 공유 순번으로 EXP 문서번호 발급.
 * RPC `allocate_expense_document_no` 우선, 없으면 테이블 fallback.
 */
export async function allocateExpenseDocumentNo(expenseDate?: string | null): Promise<string> {
  const yyyymm = bangkokYyyymmFromDate(expenseDate)
  try {
    const result = await supabaseRpc<string | string[] | { allocate_expense_document_no?: string }>(
      'allocate_expense_document_no',
      { p_yyyymm: yyyymm }
    )
    const raw =
      typeof result === 'string'
        ? result
        : Array.isArray(result)
          ? String(result[0] || '')
          : String((result as { allocate_expense_document_no?: string })?.allocate_expense_document_no || '')
    const doc = raw.trim()
    if (isExpenseDocumentNo(doc)) return doc
    if (doc) return doc
  } catch (e) {
    if (!isMissingRpcError(e)) {
      console.warn('allocate_expense_document_no RPC failed, using fallback:', e)
    }
  }
  // fallback: 재시도 2회 (동시성 충돌 완화)
  let lastErr: unknown
  for (let i = 0; i < 3; i++) {
    try {
      return await allocateViaFallback(yyyymm)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr || 'document_no allocate failed'))
}

export async function resolveDocumentNoForAccrualId(expenseAccrualId: number): Promise<string | null> {
  if (!expenseAccrualId || expenseAccrualId <= 0) return null
  const rows = (await supabaseSelectFilter('expense_accruals', `id=eq.${expenseAccrualId}`, {
    select: 'id,document_no',
    limit: 1,
  })) as { id?: number; document_no?: string | null }[] | null
  const doc = String(rows?.[0]?.document_no || '').trim()
  return doc || null
}
