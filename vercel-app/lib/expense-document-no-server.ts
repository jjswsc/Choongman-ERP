import { supabaseRpc, supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import {
  bangkokYyyymmFromDate,
  buildExpenseDocumentNo,
  expenseDocumentPrefixForVat,
  expenseDocumentSeqKey,
  isExpenseDocumentNo,
  type ExpenseDocumentPrefix,
} from '@/lib/expense-document-no'

function isMissingRpcError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('404') ||
    msg.includes('does not exist') ||
    msg.includes('pgrst202') ||
    msg.includes('could not find the function')
  )
}

async function allocateViaFallback(prefix: ExpenseDocumentPrefix, yyyymm: string): Promise<string> {
  const key = expenseDocumentSeqKey(prefix, yyyymm)
  const rows = (await supabaseSelectFilter('expense_document_seq', `yyyymm=eq.${key}`, {
    select: 'yyyymm,last_seq',
    limit: 1,
  })) as { yyyymm?: string; last_seq?: number }[] | null
  const current = Number(rows?.[0]?.last_seq || 0)
  const next = current + 1
  await supabaseUpsert(
    'expense_document_seq',
    [
      {
        yyyymm: key,
        last_seq: next,
        updated_at: new Date().toISOString(),
      },
    ],
    'yyyymm'
  )
  return buildExpenseDocumentNo(yyyymm, next, prefix)
}

export type AllocateExpenseDocumentNoOpts = {
  vatAmount?: number | null
  /** 명시 접두 (vatAmount보다 우선) */
  prefix?: ExpenseDocumentPrefix | null
}

/**
 * 월·접두(PV/PP)별 순번으로 문서번호 발급.
 * VAT>0 → PV, 아니면 PP. RPC `allocate_voucher_document_no` 우선, 없으면 테이블 fallback.
 */
export async function allocateExpenseDocumentNo(
  expenseDate?: string | null,
  opts?: AllocateExpenseDocumentNoOpts
): Promise<string> {
  const yyyymm = bangkokYyyymmFromDate(expenseDate)
  const prefix: ExpenseDocumentPrefix =
    opts?.prefix === 'PV' || opts?.prefix === 'PP'
      ? opts.prefix
      : expenseDocumentPrefixForVat(opts?.vatAmount)

  try {
    const result = await supabaseRpc<string | string[] | { allocate_voucher_document_no?: string }>(
      'allocate_voucher_document_no',
      { p_prefix: prefix, p_yyyymm: yyyymm }
    )
    const raw =
      typeof result === 'string'
        ? result
        : Array.isArray(result)
          ? String(result[0] || '')
          : String((result as { allocate_voucher_document_no?: string })?.allocate_voucher_document_no || '')
    const doc = raw.trim()
    if (isExpenseDocumentNo(doc)) return doc
    if (doc) return doc
  } catch (e) {
    if (!isMissingRpcError(e)) {
      console.warn('allocate_voucher_document_no RPC failed, using fallback:', e)
    }
  }

  let lastErr: unknown
  for (let i = 0; i < 3; i++) {
    try {
      return await allocateViaFallback(prefix, yyyymm)
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
