/**
 * 오프라인용 데이터 프리로드
 * 로그인·화면 진입 시 백그라운드에서 호출 → 캐시 채움 → 오프라인 시 사용 가능
 */

import { isOnline } from './network'
import { getStoreListWithCache, getLoginDataWithCache } from './erp-offline'
import {
  getVendorsForPurchaseWithCache,
  getVendorsForSalesWithCache,
  getChecklistItemsWithCache,
  getAdminItemsWithCache,
  getWarehouseLocationsWithCache,
} from './erp-offline'
import {
  getPosMenusWithCache,
  getPosMenuCategoriesWithCache,
  getPosMenuOptionsWithCache,
  getPosPromosWithItemsWithCache,
  getPosDeliveryAppsWithCache,
  getPosPrinterSettingsWithCache,
  getPosPaymentSettingsWithCache,
} from './pos-offline'

/** 로그인 성공 직후 — 공통 데이터 (매장/유저 목록) */
export async function preloadCommonData(): Promise<void> {
  if (!isOnline()) return
  try {
    await Promise.all([
      getStoreListWithCache(),
      getLoginDataWithCache(),
    ])
  } catch (e) {
    console.warn('[Preload] common:', e)
  }
}

/** POS 화면 진입 시 — 메뉴·배달앱·프린터·결제설정 (storeCode 있으면 해당 매장 프린터/결제 포함) */
export async function preloadPosOfflineData(storeCode?: string): Promise<void> {
  if (!isOnline()) return
  try {
    const base = [
      getPosMenusWithCache(),
      getPosMenuCategoriesWithCache(),
      getPosMenuOptionsWithCache(),
      getPosPromosWithItemsWithCache(),
      getPosDeliveryAppsWithCache({ storeCode }),
    ]
    const extra = storeCode
      ? [
          getPosPrinterSettingsWithCache({ storeCode }),
          getPosPaymentSettingsWithCache({ storeCode }),
        ]
      : []
    await Promise.all([...base, ...extra])
  } catch (e) {
    console.warn('[Preload] POS:', e)
  }
}

/** ERP/관리자 화면 진입 시 — 거래처·점검·품목·창고 */
export async function preloadErpOfflineData(): Promise<void> {
  if (!isOnline()) return
  try {
    await Promise.all([
      getVendorsForPurchaseWithCache(),
      getVendorsForSalesWithCache(),
      getChecklistItemsWithCache(true),
      getChecklistItemsWithCache(false),
      getAdminItemsWithCache(),
      getWarehouseLocationsWithCache(),
    ])
  } catch (e) {
    console.warn('[Preload] ERP:', e)
  }
}
