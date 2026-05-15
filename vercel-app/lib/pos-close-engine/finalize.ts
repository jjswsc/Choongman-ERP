import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { postPosDayClearingJournal } from '@/lib/accounting-posting'
import { validatePosCloseRun, type PosCloseValidateResult } from '@/lib/pos-close-engine/validate'

export type PosCloseFinalizeResult = PosCloseValidateResult & {
  finalized: boolean
  postedJournalEntryId: number | null
}

export async function finalizePosCloseRun(params: {
  storeCode: string
  businessDate: string
  finalizedBy?: string | null
}): Promise<PosCloseFinalizeResult> {
  const validated = await validatePosCloseRun({
    storeCode: params.storeCode,
    businessDate: params.businessDate,
  })
  if (validated.status !== 'validated') {
    throw new Error('POS_CLOSE_VALIDATION_FAILED')
  }

  const settlementRows = (await supabaseSelectFilter(
    'pos_settlements',
    `store_code=eq.${encodeURIComponent(validated.storeCode)}&settle_date=eq.${encodeURIComponent(validated.businessDate)}`,
    {
      limit: 1,
      select: 'id,cash_amt,card_amt,qr_amt,delivery_app_amt,dine_in_delivery_amt,other_amt',
    }
  )) as
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

  await supabaseUpsert(
    'pos_close_runs',
    [
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
    ],
    'store_code,business_date'
  )

  return {
    ...validated,
    finalized: true,
    postedJournalEntryId: postedJournalEntryId ?? null,
  }
}
