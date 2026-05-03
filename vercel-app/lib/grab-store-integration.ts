import { parseGrabStoreMap } from '@/lib/grab-store-map-env'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

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

/**
 * Grab이 `partnerMerchantID`로만 보내는 `"000"` 등을 GRAB_STORE_MAP_JSON의 ERP store_code로 맞춘다.
 * 예: `"000":"HQ"` → DB·조회는 `HQ`로 통일 (메뉴 알림·주문 store_code와 일치).
 * `1040`처럼 일반 파트너 숫자는 맵에 `"1040":"이름"`이 있어도 ERP가 숫자 코드를 쓰는 경우가 많아 그대로 둔다.
 */
export function normalizePartnerMerchantIdForIntegration(partnerMerchantID: string): string {
  const raw = String(partnerMerchantID || '').trim()
  if (!raw) return raw
  if (!/^0+$/.test(raw)) return raw
  const map = parseGrabStoreMap()
  const v = String(map[raw] || '').trim()
  if (v && v !== raw) return v
  return raw
}

export async function upsertGrabStoreIntegration(
  input: UpsertGrabStoreIntegrationInput
): Promise<{ created: boolean; status: string }> {
  const grabMerchantID = String(input.grabMerchantID || '').trim()
  const partnerMerchantID = normalizePartnerMerchantIdForIntegration(
    String(input.partnerMerchantID || '').trim()
  )
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

  const samePair = (await supabaseSelectFilter(
    'pos_grab_store_integrations',
    `grab_merchant_id=eq.${encodeURIComponent(grabMerchantID)}&partner_merchant_id=eq.${encodeURIComponent(partnerMerchantID)}`,
    { limit: 1, select: 'id' }
  )) as { id?: number }[] | null

  const pairId = Number(samePair?.[0]?.id ?? 0)
  if (pairId > 0) {
    await supabaseUpdateByFilter('pos_grab_store_integrations', `id=eq.${pairId}`, row)
    return { created: false, status: integrationStatus }
  }

  const byGrab = (await supabaseSelectFilter(
    'pos_grab_store_integrations',
    `grab_merchant_id=eq.${encodeURIComponent(grabMerchantID)}`,
    { limit: 20, select: 'id,partner_merchant_id', order: 'updated_at.desc' }
  )) as { id?: number; partner_merchant_id?: string }[] | null

  const list = Array.isArray(byGrab) ? byGrab : []
  if (list.length > 0) {
    let keeperId = 0
    for (const r of list) {
      if (String(r.partner_merchant_id ?? '').trim() === partnerMerchantID) {
        keeperId = Number(r.id ?? 0)
        break
      }
    }
    if (!keeperId) keeperId = Number(list[0]?.id ?? 0)
    if (keeperId > 0) {
      for (const r of list) {
        const rid = Number(r.id ?? 0)
        if (rid > 0 && rid !== keeperId) {
          await supabaseDeleteByFilter('pos_grab_store_integrations', `id=eq.${rid}`)
        }
      }
      await supabaseUpdateByFilter('pos_grab_store_integrations', `id=eq.${keeperId}`, row)
      return { created: false, status: integrationStatus }
    }
  }

  await supabaseInsert('pos_grab_store_integrations', {
    ...row,
    created_at: now,
  })
  return { created: true, status: integrationStatus }
}
