import type { PosMenu, PosPromoWithItems } from '@/lib/api-client'

/** POS 타일용 imageUrl — 공백 제거만 (정규화는 PosMenuFillImage에서) */
export function pickMenuImageUrl(menu?: Pick<PosMenu, 'imageUrl'> | null): string {
  return String(menu?.imageUrl ?? '').trim()
}

function isLikelySideOrDrinkMenu(menu?: Pick<PosMenu, 'code' | 'name' | 'category' | 'categoryMain'> | null): boolean {
  const hay = [
    String(menu?.code ?? ''),
    String(menu?.name ?? ''),
    String(menu?.category ?? ''),
    String(menu?.categoryMain ?? ''),
  ]
    .join(' ')
    .toLowerCase()
  if (!hay.trim()) return false
  return /(side|drink|beverage|rice|무|치킨무|pickled radish|radish|kimchi|drink|음료|사이드|ข้าว|เครื่องดื่ม|กิมจิ|หัวไชเท้า)/i.test(
    hay
  )
}

/** 미러 image가 세트 구성 중 사이드/밥 메뉴 사진과 같으면 잘못 복사된 것으로 본다 */
export function isPromoMirrorImageStaleSideCopy(
  mirrorImageUrl: string,
  promo: Pick<PosPromoWithItems, 'items'>,
  menusById: Map<string, PosMenu>
): boolean {
  const mirrorImg = String(mirrorImageUrl ?? '').trim()
  if (!mirrorImg) return false
  for (const it of promo.items || []) {
    const mid = String(it.menuId ?? '').trim()
    if (!mid) continue
    const comp = menusById.get(mid)
    if (!comp || !isLikelySideOrDrinkMenu(comp)) continue
    if (pickMenuImageUrl(comp) === mirrorImg) return true
  }
  return false
}

/**
 * 프로모 타일 썸네일:
 * 1) promo_id 연동 미러 메뉴 image (단, 밥/사이드 구성품과 동일 URL이면 무시)
 * 2) 세트 구성 메뉴 중 사이드/음료가 아닌 메뉴 image 우선
 * 3) 없으면 구성 메뉴 중 첫 image
 */
export function resolvePromoTileImageSrc(
  promo: Pick<PosPromoWithItems, 'id' | 'items'>,
  menus: PosMenu[]
): string {
  const pid = String(promo.id ?? '').trim()
  if (!pid) return ''

  const menusById = new Map<string, PosMenu>()
  for (const m of menus) {
    const id = String(m.id ?? '').trim()
    if (id) menusById.set(id, m)
  }

  const mirror = menus.find((m) => String(m.promoId ?? '').trim() === pid)
  const mirrorImg = pickMenuImageUrl(mirror)
  if (mirrorImg && !isPromoMirrorImageStaleSideCopy(mirrorImg, promo, menusById)) {
    return mirrorImg
  }

  // fallback 1) 구성 메뉴 중 "사이드/음료"가 아닌 대표 이미지 우선
  for (const it of promo.items || []) {
    const mid = String(it.menuId ?? '').trim()
    if (!mid) continue
    const m = menusById.get(mid)
    if (!m || isLikelySideOrDrinkMenu(m)) continue
    const compImg = pickMenuImageUrl(m)
    if (compImg) return compImg
  }

  // fallback 2) 없으면 기존 규칙대로 첫 이미지 사용
  for (const it of promo.items || []) {
    const mid = String(it.menuId ?? '').trim()
    if (!mid) continue
    const compImg = pickMenuImageUrl(menusById.get(mid))
    if (compImg) return compImg
  }
  return ''
}
