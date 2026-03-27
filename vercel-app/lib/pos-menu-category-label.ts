import { normalizePromotionSubcategory } from '@/lib/pos-promo-constants'

type TFn = (key: string) => string

/** POS 메뉴·프로모 소분류 라벨 (프로모션 기본 소분류는 i18n, 그 외는 원문) */
export function translatePosMenuCategoryLabel(label: string, t: TFn): string {
  const raw = String(label ?? '').trim()
  const n = normalizePromotionSubcategory(raw)
  if (n === 'Set') return t('posMenuSubPromoSet')
  if (n === 'Seasonal') return t('posMenuSubPromoSeasonal')
  if (n === 'Delivery only') return t('posMenuSubPromoDeliveryOnly')
  return raw
}
