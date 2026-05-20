import type { PosMenu, PosPromoWithItems } from '@/lib/api-client'

/** POS 타일용 imageUrl — 공백 제거만 (정규화는 PosMenuFillImage에서) */
export function pickMenuImageUrl(menu?: Pick<PosMenu, 'imageUrl'> | null): string {
  return String(menu?.imageUrl ?? '').trim()
}

export type PromoTileImageResolveOpts = {
  /** 매장·배달앱별 메뉴 이미지 오버라이드 (미러 메뉴 id → URL) */
  deliveryImageByMenuId?: Readonly<Record<string, string>>
}

const DELIVERY_APP_CODES_FOR_MENU_IMAGES = ['grab', 'lineman', 'shopee'] as const

export function buildDeliveryMenuImageByMenuId(
  bundles: ReadonlyArray<{ menuPolicies?: ReadonlyArray<{ menuId?: number | string; imageUrl?: string | null }> }>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const bundle of bundles) {
    for (const row of bundle.menuPolicies || []) {
      const id = String(row.menuId ?? '').trim()
      const url = String(row.imageUrl ?? '').trim()
      if (id && url && !out[id]) out[id] = url
    }
  }
  return out
}

export { DELIVERY_APP_CODES_FOR_MENU_IMAGES }

function pickDeliveryImageForMenu(opts: PromoTileImageResolveOpts | undefined, menuId: string): string {
  const byMenuId = opts?.deliveryImageByMenuId
  if (!menuId || !byMenuId) return ''
  return String(byMenuId[menuId] ?? '').trim()
}

/** 미러 image가 세트 구성품(밥·치킨 등) 메뉴 사진과 동일 URL이면 세트 전용 사진이 아님 */
export function isPromoMirrorImageCopiedFromComponent(
  imageUrl: string,
  promo: Pick<PosPromoWithItems, 'items'>,
  menusById: Map<string, PosMenu>
): boolean {
  const url = String(imageUrl ?? '').trim()
  if (!url) return false
  for (const it of promo.items || []) {
    const mid = String(it.menuId ?? '').trim()
    if (!mid) continue
    const comp = menusById.get(mid)
    if (comp && pickMenuImageUrl(comp) === url) return true
  }
  return false
}

/** @deprecated 구성품 복사 여부는 isPromoMirrorImageCopiedFromComponent 사용 */
export function isPromoMirrorImageStaleSideCopy(
  mirrorImageUrl: string,
  promo: Pick<PosPromoWithItems, 'items'>,
  menusById: Map<string, PosMenu>
): boolean {
  return isPromoMirrorImageCopiedFromComponent(mirrorImageUrl, promo, menusById)
}

/** 프로모 타일: 미러/배달에 올린 세트 전용 URL만 허용 (구성품 메뉴 사진과 동일하면 제외) */
export function shouldUsePromoTileImageUrl(
  imageUrl: string,
  promo: Pick<PosPromoWithItems, 'items'>,
  menusById: Map<string, PosMenu>
): boolean {
  const url = String(imageUrl ?? '').trim()
  if (!url) return false
  return !isPromoMirrorImageCopiedFromComponent(url, promo, menusById)
}

/**
 * 프로모 타일 썸네일 — 세트 미러 메뉴 전용만 사용한다.
 * 1) Delivery Ops 오버라이드 (미러 menu id)
 * 2) pos_menus 미러 image
 * 구성품(밥·치킨 단품) image 로는 채우지 않는다.
 */
export function resolvePromoTileImageSrc(
  promo: Pick<PosPromoWithItems, 'id' | 'items'>,
  menus: PosMenu[],
  opts?: PromoTileImageResolveOpts
): string {
  const pid = String(promo.id ?? '').trim()
  if (!pid) return ''

  const menusById = new Map<string, PosMenu>()
  for (const m of menus) {
    const id = String(m.id ?? '').trim()
    if (id) menusById.set(id, m)
  }

  const mirror = menus.find((m) => String(m.promoId ?? '').trim() === pid)
  const mirrorId = String(mirror?.id ?? '').trim()
  const mirrorCandidates = [
    pickDeliveryImageForMenu(opts, mirrorId),
    pickMenuImageUrl(mirror),
  ]
  for (const img of mirrorCandidates) {
    if (shouldUsePromoTileImageUrl(img, promo, menusById)) return img
  }

  return ''
}
