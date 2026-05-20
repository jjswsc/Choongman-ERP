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

/**
 * 프로모 타일 썸네일:
 * 1) promo_id 연동 미러 메뉴 image
 * 2) 세트 구성 메뉴 중 첫 번째로 image 가 있는 항목
 */
export function resolvePromoTileImageSrc(
  promo: Pick<PosPromoWithItems, 'id' | 'items'>,
  menus: PosMenu[]
): string {
  const pid = String(promo.id ?? '').trim()
  if (!pid) return ''

  const mirror = menus.find((m) => String(m.promoId ?? '').trim() === pid)
  const mirrorImg = pickMenuImageUrl(mirror)
  if (mirrorImg) return mirrorImg

  const menusById = new Map<string, PosMenu>()
  for (const m of menus) {
    const id = String(m.id ?? '').trim()
    if (id) menusById.set(id, m)
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
