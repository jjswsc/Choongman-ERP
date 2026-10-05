import 'server-only'

import {
  buildMissingPurchasePaymentInserts,
  buildMissingPurchaseWithholdingInserts,
  type BankPurchasePaymentBackfillRow,
} from '@/lib/payable-bank-backfill'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  stampSaasTenantId,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'
import { supabaseInsertMany, supabaseSelectFilterAllPages } from '@/lib/supabase-server'

const BACKFILL_TTL_MS = 120_000
const INSERT_CHUNK = 200

const inflight = new Map<string, Promise<void>>()
const doneAt = new Map<string, number>()

function scopeKey(scope?: SaasTenantScope): string {
  return scope?.enforce && scope.tenantId ? scope.tenantId : ''
}

async function loadPurchasePaymentBanks(scope?: SaasTenantScope): Promise<BankPurchasePaymentBackfillRow[]> {
  const base = 'trans_type=ilike.withdraw&category=ilike.purchase_payment&vendor_code=not.is.null'
  const filter = scope ? appendSaasTenantFilter(base, scope, 'bank_transactions') : base
  const selectWithWht = 'id,vendor_code,amount,trans_date,memo,withholding_tax_amount'
  try {
    return (await supabaseSelectFilterAllPages('bank_transactions', filter, {
      select: selectWithWht,
      order: 'id.asc',
      pageSize: 8000,
      maxRows: 500_000,
    })) as BankPurchasePaymentBackfillRow[]
  } catch (e) {
    const msg = String(e || '').toLowerCase()
    if (msg.includes('withholding_tax_amount')) {
      return (await supabaseSelectFilterAllPages('bank_transactions', filter, {
        select: 'id,vendor_code,amount,trans_date,memo',
        order: 'id.asc',
        pageSize: 8000,
        maxRows: 500_000,
      })) as BankPurchasePaymentBackfillRow[]
    }
    throw e
  }
}

async function loadLinkedBankIds(
  scope: SaasTenantScope | undefined,
  refType: 'Payment' | 'Withholding'
): Promise<Set<number>> {
  const base = `ref_type=eq.${refType}&bank_transaction_id=not.is.null`
  const filter = scope ? appendSaasTenantFilter(base, scope, 'payable_transactions') : base
  const rows = (await supabaseSelectFilterAllPages('payable_transactions', filter, {
    select: 'bank_transaction_id',
    order: 'id.asc',
    pageSize: 8000,
    maxRows: 500_000,
  })) as { bank_transaction_id?: number | null }[]
  const out = new Set<number>()
  for (const row of rows || []) {
    const id = Number(row.bank_transaction_id || 0)
    if (id > 0) out.add(id)
  }
  return out
}

async function insertChunks(rows: Record<string, unknown>[], scope?: SaasTenantScope): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK).map((row) =>
      scope ? stampSaasTenantId(row, scope, 'payable_transactions') : row
    )
    if (!chunk.length) continue
    await supabaseInsertMany('payable_transactions', chunk)
  }
}

async function runPurchasePaymentPayableBackfill(scope?: SaasTenantScope): Promise<void> {
  if (scope && isSaasTenantQueryBlocked(scope, 'payable_transactions')) return
  if (scope && isSaasTenantQueryBlocked(scope, 'bank_transactions')) return
  try {
    const banks = await loadPurchasePaymentBanks(scope)
    const [paymentIds, withholdingIds] = await Promise.all([
      loadLinkedBankIds(scope, 'Payment'),
      loadLinkedBankIds(scope, 'Withholding'),
    ])
    const payments = buildMissingPurchasePaymentInserts({ banks, existingPaymentBankIds: paymentIds })
    const withholdings = buildMissingPurchaseWithholdingInserts({
      banks,
      existingWithholdingBankIds: withholdingIds,
    })
    await insertChunks(payments, scope)
    await insertChunks(withholdings, scope)
  } catch (e) {
    if (scope?.enforce && isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('payable_transactions')
      markSaasTenantColumnMissing('bank_transactions')
      return
    }
    throw e
  }
}

/** 미지급 조회 직전 — 매입대금 통장 중 지급 행이 없는 건만 채운다. 같은 통장은 다시 만들지 않는다. */
export async function ensurePurchasePaymentPayablesBackfilled(scope?: SaasTenantScope): Promise<void> {
  const key = scopeKey(scope)
  const prev = doneAt.get(key) || 0
  if (Date.now() - prev < BACKFILL_TTL_MS) return
  const running = inflight.get(key)
  if (running) return running
  const job = runPurchasePaymentPayableBackfill(scope)
    .then(() => {
      doneAt.set(key, Date.now())
    })
    .catch((e) => {
      console.error('purchase payment payable backfill:', e)
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, job)
  return job
}
