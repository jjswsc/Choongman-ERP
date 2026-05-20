import {
  buildDeliveryMenuImageByMenuId,
  DELIVERY_APP_CODES_FOR_MENU_IMAGES,
} from '@/lib/pos-menu-display-image'
import { getPosDeliveryAppPolicies, type DeliveryAppCode } from '@/lib/api-client'

/** 매장 배달 정책에서 메뉴별 이미지 URL 맵 (프로모 미러 타일용) */
export async function loadPosDeliveryMenuImageByMenuId(storeCode: string): Promise<Record<string, string>> {
  const sc = String(storeCode ?? '').trim()
  if (!sc) return {}
  const bundles = await Promise.all(
    DELIVERY_APP_CODES_FOR_MENU_IMAGES.map(async (appCode) => {
      try {
        const res = await getPosDeliveryAppPolicies({ storeCode: sc, appCode: appCode as DeliveryAppCode })
        if (!res?.success) return { menuPolicies: [] }
        return { menuPolicies: res.menuPolicies || [] }
      } catch {
        return { menuPolicies: [] }
      }
    })
  )
  return buildDeliveryMenuImageByMenuId(bundles)
}
