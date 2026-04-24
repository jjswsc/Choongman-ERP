import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

type UpsertGrabStoreIntegrationInput = {
  grabMerchantID: string
  partnerMerchantID: string
  integrationStatus: string
  requestID?: string
  message?: string
  payload?: unknown
}

function normalizeStatus(value: string): string {
  const s = String(value || '').trim().toUpperCase()
  if (!s) return 'UNKNOWN'
  return s
}

export async function upsertGrabStoreIntegration(
  input: UpsertGrabStoreIntegrationInput
): Promise<{ created: boolean; status: string }> {
  const grabMerchantID = String(input.grabMerchantID || '').trim()
  const partnerMerchantID = String(input.partnerMerchantID || '').trim()
  if (!grabMerchantID || !partnerMerchantID) {
    throw new Error('missing_grab_or_partner_merchant_id')
  }
  const integrationStatus = normalizeStatus(input.integrationStatus)
  const now = new Date().toISOString()
  const row = {
    grab_merchant_id: grabMerchantID,
    partner_merchant_id: partnerMerchantID,
    integration_status: integrationStatus,
    last_request_id: String(input.requestID || '').trim() || null,
    last_message: String(input.message || '').trim() || null,
    payload_json: input.payload ?? null,
    updated_at: now,
  }

  const existing = (await supabaseSelectFilter(
    'pos_grab_store_integrations',
    `grab_merchant_id=eq.${encodeURIComponent(grabMerchantID)}&partner_merchant_id=eq.${encodeURIComponent(partnerMerchantID)}`,
    { limit: 1, select: 'id' }
  )) as { id?: number }[] | null

  const id = Number(existing?.[0]?.id ?? 0)
  if (id > 0) {
    await supabaseUpdateByFilter('pos_grab_store_integrations', `id=eq.${id}`, row)
    return { created: false, status: integrationStatus }
  }

  await supabaseInsert('pos_grab_store_integrations', {
    ...row,
    created_at: now,
  })
  return { created: true, status: integrationStatus }
}
