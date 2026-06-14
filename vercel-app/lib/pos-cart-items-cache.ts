import type { OrderItem } from '@/lib/pos-types'

type CartItem = OrderItem

const CART_ITEMS_CACHE = new Map<string, CartItem[]>()

const cloneCartItems = (items: CartItem[]): CartItem[] =>
  items.map((i) => ({
    ...i,
    promoItems: i.promoItems ? i.promoItems.map((p) => ({ ...p })) : undefined,
  }))

/** 터미널 탭 전환 시 홀/포장 장바구니 스냅샷 (배달 알림으로 탭이 바뀌어도 복원) */
export function readPosCartItemsCache(key: string): CartItem[] {
  return cloneCartItems(CART_ITEMS_CACHE.get(key) ?? [])
}

export function writePosCartItemsCache(key: string, items: CartItem[]): void {
  CART_ITEMS_CACHE.set(key, cloneCartItems(items))
}

/** cart-panel 내부: Map 직접 접근 대신 사용 */
export function peekPosCartItemsCache(key: string): CartItem[] | undefined {
  const hit = CART_ITEMS_CACHE.get(key)
  return hit ? cloneCartItems(hit) : undefined
}

export function replacePosCartItemsCache(key: string, items: CartItem[]): void {
  CART_ITEMS_CACHE.set(key, cloneCartItems(items))
}

export function clonePosCartItems(items: CartItem[]): CartItem[] {
  return cloneCartItems(items)
}
