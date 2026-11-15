/**
 * 매장 매출 보너스 — 설정·조회 API 클라이언트
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'

export type SalesBonusTierDto = { threshold: number; amount: number }

export type StoreSalesBonusSettingsDto = {
  storeCode: string
  enabled: boolean
  absencePenaltyPctPerDay: number
  managerMultiplier: number
  staffMultiplier: number
  tiers: SalesBonusTierDto[]
  updatedAt?: string
}

export type SalesBonusPreviewEmployeeDto = {
  employeeId: number
  employeeCode: string
  store: string
  name: string
  role: string
  absenceDays: number
  result: {
    baseAmount: number
    multiplier: number
    roleAmount: number
    absenceDays: number
    penaltyPct: number
    penaltyAmount: number
    finalAmount: number
    appliedTiers?: SalesBonusTierDto[]
  }
}

export type SalesBonusStorePreviewDto = {
  storeCode: string
  settings: StoreSalesBonusSettingsDto
  salesTotal: number
  period: { month: string; start: string; end: string; payYmd: string }
  employees: SalesBonusPreviewEmployeeDto[]
}

export async function getSalesBonusSettings(store?: string): Promise<{
  settings?: StoreSalesBonusSettingsDto
  list?: StoreSalesBonusSettingsDto[]
}> {
  const q = store ? `?store=${encodeURIComponent(store)}` : ''
  const res = await apiFetch(`/api/hr/sales-bonus/settings${q}`)
  const data = (await res.json()) as {
    success?: boolean
    settings?: StoreSalesBonusSettingsDto
    list?: StoreSalesBonusSettingsDto[]
    msg?: string
  }
  if (!res.ok || data.success === false) {
    throw new Error(data.msg || '매출 보너스 설정을 불러오지 못했습니다.')
  }
  return { settings: data.settings, list: data.list }
}

export async function saveSalesBonusSettings(
  input: StoreSalesBonusSettingsDto
): Promise<StoreSalesBonusSettingsDto> {
  const res = await apiFetchWithOffline('/api/hr/sales-bonus/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = (await res.json()) as {
    success?: boolean
    settings?: StoreSalesBonusSettingsDto
    msg?: string
  }
  if (!res.ok || data.success === false || !data.settings) {
    throw new Error(data.msg || '매출 보너스 설정 저장에 실패했습니다.')
  }
  return data.settings
}

export async function getSalesBonusPreview(params: {
  month: string
  store?: string
  stores?: string[]
}): Promise<SalesBonusStorePreviewDto[]> {
  const q = new URLSearchParams({ month: params.month })
  if (params.store) q.set('store', params.store)
  if (params.stores && params.stores.length > 0) q.set('stores', params.stores.join(','))
  const res = await apiFetch(`/api/hr/sales-bonus/preview?${q}`)
  const data = (await res.json()) as {
    success?: boolean
    stores?: SalesBonusStorePreviewDto[]
    msg?: string
  }
  if (!res.ok || data.success === false) {
    throw new Error(data.msg || '매출 보너스 미리보기에 실패했습니다.')
  }
  return data.stores || []
}
