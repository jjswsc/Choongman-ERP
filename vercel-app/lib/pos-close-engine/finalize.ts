import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { postPosDayClearingJournal } from '@/lib/accounting-posting'
import { validatePosCloseRun, type PosCloseValidateResult } from '@/lib/pos-close-engine/validate'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  saasTenantStoreConflictTarget,
  stampSaasTenantIdForUniqueKey,
  type SaasTenantScope,
  LEGACY_SAAS_TENANT_SCOPE,
} from '@/lib/saas-tenant-scope'

export type PosCloseFinalizeResult = PosCloseValidateResult & {
  finalized: boolean
  postedJournalEntryId: number | null
}

export async function finalizePosCloseRun(params: {
  storeCode: string
  businessDate: string
  finalizedBy?: string | null
  tenantScope?: SaasTenantScope
}): Promise<PosCloseFinalizeResult> {
  const tenantScope = params.tenantScope || LEGACY_SAAS_TENANT_SCOPE
  const writeErr = assertSaasTenantWritable(tenantScope, {
    tableHint: 'pos_close_runs',
    label: 'POS 마감',
  })
  if (writeErr) throw new Error(writeErr)

  const validated = await validatePosCloseRun({
    storeCode: params.storeCode,
    businessDate: params.businessDate,
    tenantScope,
  })
  if (validated.status !== 'validated') {
    throw new Error('POS_CLOSE_VALIDATION_FAILED')
  }

  const settlementFilter = appendSaasTenantFilter(
    `store_code=eq.${encodeURIComponent(validated.storeCode)}&settle_date=eq.${encodeURIComponent(validated.businessDate)}`,
    tenantScope,
    'pos_settlements'
  )
  const settlementRows = (await supabaseSelectFilter('pos_settlements', settlementFilter, {
    limit: 1,
    select: 'id,cash_amt,card_amt,qr_amt,delivery_app_amt,dine_in_delivery_amt,other_amt',
  })) as
    | {
        id?: number
        cash_amt?: number
        card_amt?: number
        qr_amt?: number
        delivery_app_amt?: number
        dine_in_delivery_amt?: number
        other_amt?: number
      }[]
    | null
  const settlement = settlementRows?.[0]

  const postedJournalEntryId = await postPosDayClearingJournal({
    storeCode: validated.storeCode,
    businessDate: validated.businessDate,
    systemTotal: validated.systemTotal,
    settlementTotal: validated.settlementTotal,
    diffTotal: validated.diffTotal,
  })

  const row = stampSaasTenantIdForUniqueKey(
    {
      store_code: validated.storeCode,
      business_date: validated.businessDate,
      status: postedJournalEntryId ? 'posted' : 'locked',
      checks_json: validated.checks,
      totals_json: {
        systemTotal: validated.systemTotal,
        settlementTotal: validated.settlementTotal,
        diffTotal: validated.diffTotal,
      },
      settlement_ref: settlement?.id ?? null,
      posted_journal_entry_id: postedJournalEntryId ?? null,
      finalized_by: String(params.finalizedBy || '').trim() || null,
      finalized_at: new Date().toISOString(),
    },
    tenantScope
  )
  try {
    await supabaseUpsert(
      'pos_close_runs',
      [row],
      saasTenantStoreConflictTarget(tenantScope, 'store_code,business_date')
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/on conflict|42P10|unique|tenant_id/i.test(msg)) {
      const { tenant_id: _t, ...legacy } = row
      await supabaseUpsert('pos_close_runs', [legacy], 'store_code,business_date')
    } else {
      throw e
    }
  }

  return {
    ...validated,
    finalized: true,
    postedJournalEntryId: postedJournalEntryId ?? null,
  }
}
