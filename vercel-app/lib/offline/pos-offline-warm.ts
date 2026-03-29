/**
 * 인터넷이 될 때 한 번 호출해 POS·ERP 오프라인용 로컬 캐시를 채움.
 * (메뉴/옵션/테이블/당일 주문·매출 등 — 각 API는 성공 시 IndexedDB에 저장됨)
 */

import {
  getPosDeliveryApps,
  getPosMenuCategories,
  getPosMenuOptions,
  getPosMenuScreenConfig,
  getPosMenus,
  getPosPaymentMethodItems,
  getPosPrinterSettings,
  getPosPromosWithItems,
  getPosTableLayout,
  getPosTodaySales,
  getMembers,
} from '@/lib/api-client'
import { getAppDataWithCache, getLoginDataWithCache, getStoreListWithCache } from '@/lib/offline/erp-offline'
import { getPosOrdersWithCache } from '@/lib/offline/receipts-offline'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'

export type WarmPosOfflineCacheResult = {
  ok: boolean
  /** 실패한 단계 식별자 (로그·토스트용) */
  errors: string[]
}

async function safeWarm(label: string, fn: () => Promise<unknown>, errors: string[]) {
  try {
    await fn()
  } catch {
    errors.push(label)
  }
}

/**
 * @param storeCodes — 캐시할 매장 코드 목록 (보통 현재 로그인 매장 또는 본사가 볼 수 있는 전체)
 * @param businessDate — 방콕 기준 영업일 (기본: 오늘)
 */
export async function warmPosOfflineCache(opts: {
  storeCodes: string[]
  businessDate?: string
}): Promise<WarmPosOfflineCacheResult> {
  const errors: string[] = []
  const date = opts.businessDate?.trim() || getPosBusinessDateStr()
  const stores = [...new Set((opts.storeCodes || []).map((s) => String(s || '').trim()).filter(Boolean))]

  if (!stores.length) {
    return { ok: false, errors: ['no_stores'] }
  }

  await Promise.all([
    safeWarm('menus', () => getPosMenus(), errors),
    safeWarm('categories', () => getPosMenuCategories(), errors),
    safeWarm('options', () => getPosMenuOptions(), errors),
    safeWarm('promos', () => getPosPromosWithItems(), errors),
    safeWarm('members', () => getMembers({ limit: 5000 }), errors),
  ])

  for (const storeCode of stores) {
    await Promise.all([
      safeWarm(`layout:${storeCode}`, () => getPosTableLayout({ storeCode }), errors),
      safeWarm(`printer:${storeCode}`, () => getPosPrinterSettings({ storeCode }), errors),
      safeWarm(`delivery:${storeCode}`, () => getPosDeliveryApps({ storeCode }), errors),
      safeWarm(
        `sales:${storeCode}`,
        () => getPosTodaySales({ storeCode, startStr: date, endStr: date }),
        errors
      ),
      safeWarm(`screen:${storeCode}`, () => getPosMenuScreenConfig({ storeCode }), errors),
      safeWarm(`payMethods:${storeCode}`, () => getPosPaymentMethodItems({ storeCode }), errors),
      safeWarm(
        `orders:${storeCode}`,
        () => getPosOrdersWithCache({ storeCode, startStr: date, endStr: date }),
        errors
      ),
    ])
  }

  return { ok: errors.length === 0, errors }
}

/**
 * 관리자(ERP) 화면용: POS 워밍(매장 코드가 있을 때) + 매장 목록·로그인 폼용 데이터·매장별 앱 데이터(getAppData) 캐시 갱신.
 */
export async function warmAdminOfflineCache(opts: {
  storeCodes: string[]
  businessDate?: string
}): Promise<WarmPosOfflineCacheResult> {
  const errors: string[] = []
  const stores = [...new Set((opts.storeCodes || []).map((s) => String(s || '').trim()).filter(Boolean))]

  if (stores.length > 0) {
    const posResult = await warmPosOfflineCache({ ...opts, storeCodes: stores })
    errors.push(...posResult.errors)
  }

  await safeWarm('storeList', () => getStoreListWithCache(), errors)
  await safeWarm('loginData', () => getLoginDataWithCache(), errors)

  for (const storeCode of stores) {
    await safeWarm(`appData:${storeCode}`, () => getAppDataWithCache(storeCode), errors)
  }

  return { ok: errors.length === 0, errors }
}
