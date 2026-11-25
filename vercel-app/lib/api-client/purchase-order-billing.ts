/**
 * PO 청구 설정 API — purchase-order.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'

export type PoBillingSettingApiRow = {
  store_name?: string
  royalty_pct?: number
  delivery_gp_pct?: number
  grab_gp_pct?: number
  label_royalty?: string | null
  label_delivery_gp?: string | null
  label_grab_gp?: string | null
  effective_from?: string | null
  updated_at?: string
}

export type PoBillingRateHistoryApiRow = {
  store_name: string
  effective_from: string
  royalty_pct: number
  delivery_gp_pct: number
  grab_gp_pct: number
  label_royalty?: string | null
  label_delivery_gp?: string | null
  label_grab_gp?: string | null
  created_at?: string | null
  created_by?: string | null
  id?: string
}

export async function getPoBillingSettings() {
  const res = await apiFetch('/api/getPoBillingSettings')
  return res.json() as Promise<{ success: boolean; list: PoBillingSettingApiRow[]; message?: string }>
}

export async function getPoBillingRateHistory(store?: string) {
  const q = store?.trim() ? `?store=${encodeURIComponent(store.trim())}` : ''
  const res = await apiFetch(`/api/accounting/po-billing-rate-history${q}`)
  return res.json() as Promise<{
    success: boolean
    list: PoBillingRateHistoryApiRow[]
    message?: string
  }>
}

export async function savePoBillingSettings(
  rows: {
    store_name: string
    royalty_pct: number
    delivery_gp_pct: number
    grab_gp_pct: number
    label_royalty?: string | null
    label_delivery_gp?: string | null
    label_grab_gp?: string | null
  }[],
  effectiveFrom?: string
): Promise<{
  success: boolean
  saved?: number
  skippedUnchanged?: number
  effective_from?: string
  message?: string
}> {
  // 오프라인 래퍼(apiFetchWithOffline)는 실패 시에도 { success: true }를 반환할 수 있어,
  // 청구 비율은 반드시 서버·DB 반영 여부를 알 수 있게 일반 fetch만 사용한다.
  const res = await apiFetch('/api/savePoBillingSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rows,
      ...(effectiveFrom ? { effective_from: effectiveFrom } : {}),
    }),
  })
  let data: {
    success?: boolean
    saved?: number
    skippedUnchanged?: number
    effective_from?: string
    message?: string
  } = {}
  try {
    data = (await res.json()) as typeof data
  } catch {
    /* empty body 등 */
  }
  if (!res.ok) {
    return {
      success: false,
      message: data.message || `저장 요청 실패 (${res.status})`,
    }
  }
  return {
    success: !!data.success,
    saved: data.saved,
    skippedUnchanged: data.skippedUnchanged,
    effective_from: data.effective_from,
    message: data.message,
  }
}

export async function getPoBillingDraft(params: {
  store: string
  startStr: string
  endStr: string
  labelRoyalty?: string
  labelDelivery?: string
  labelGrab?: string
  /** 기본 all — royalty | delivery_gp | grab_gp 는 해당 유형만 */
  mode?: 'all' | 'royalty' | 'delivery_gp' | 'grab_gp'
}) {
  const q = new URLSearchParams({
    store: params.store,
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.labelRoyalty) q.set('labelRoyalty', params.labelRoyalty)
  if (params.labelDelivery) q.set('labelDelivery', params.labelDelivery)
  if (params.labelGrab) q.set('labelGrab', params.labelGrab)
  if (params.mode && params.mode !== 'all') q.set('mode', params.mode)
  const res = await apiFetch(`/api/getPoBillingDraft?${q}`)
  return res.json() as Promise<{
    success: boolean
    snapshot?: { totalSales: number; deliverySales: number; grabSales: number }
    settings?: {
      royalty_pct: number
      delivery_gp_pct: number
      grab_gp_pct: number
      segments?: {
        startYmd: string
        endYmd: string
        royalty_pct: number
        delivery_gp_pct: number
        grab_gp_pct: number
      }[]
    }
    lines?: { code: string; name: string; price: number; qty: number; taxType: string }[]
    truncated?: boolean
    message?: string
  }>
}
