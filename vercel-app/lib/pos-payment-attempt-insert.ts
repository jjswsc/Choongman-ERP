import { supabaseInsertIgnoreDuplicates } from '@/lib/supabase-server'
import { buildPosPaymentAttemptRowFromLinkpos } from '@/lib/pos-payment-attempt-local-tx'

export async function insertPosPaymentAttemptFromLinkpos(params: {
  orderId: number
  linkposPayment: Record<string, unknown>
  logLabel: string
}): Promise<void> {
  try {
    await supabaseInsertIgnoreDuplicates(
      'pos_payment_attempts',
      buildPosPaymentAttemptRowFromLinkpos({
        orderId: params.orderId,
        linkposPayment: params.linkposPayment,
      }),
      'local_tx_id'
    )
  } catch (e) {
    console.error(`${params.logLabel} linkpos attempt insert:`, e)
  }
}
