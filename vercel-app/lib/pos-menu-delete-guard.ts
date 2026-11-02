/**
 * POS 메뉴 하드 삭제 가드 — 주문·세트·반반 등 참조가 있으면 삭제 불가.
 * 「데이터가 없는 메뉴만 삭제」운영 정책의 판정 메시지·LIKE 패턴 단일 소스.
 */

export type PosMenuDeleteBlockReason =
  | 'order'
  | 'promo_mirror'
  | 'promo_items'
  | 'banban'
  | 'additive_source'

export const POS_MENU_DELETE_BLOCK_MESSAGES: Record<PosMenuDeleteBlockReason, string> = {
  order:
    '이 메뉴가 포함된 주문 이력이 있어 삭제할 수 없습니다. 「사용 안함」으로 숨겨 주세요.',
  promo_mirror:
    '세트(프로모) 미러 메뉴입니다. 「번들 세트 조회」에서 세트를 삭제해 주세요.',
  promo_items:
    '세트 구성에 포함된 메뉴라 삭제할 수 없습니다. 세트에서 뺀 뒤 다시 시도하거나 「사용 안함」을 쓰세요.',
  banban:
    '반반 메뉴 연결에 사용 중이라 삭제할 수 없습니다. 연결을 해제한 뒤 다시 시도하세요.',
  additive_source:
    '다른 메뉴 옵션의 추가 메뉴로 연결돼 있어 삭제할 수 없습니다. 연결을 해제한 뒤 다시 시도하세요.',
}

/** items_json 텍스트 검색용 (따옴표 있는 id만 — 숫자 접두 오탐 방지) */
export function buildPosOrderMenuIdLikePatterns(menuId: string): string[] {
  const id = String(menuId || '').trim()
  if (!id || !/^\d+$/.test(id)) return []
  const keys = ['menuId', 'menuId1', 'menuId2', 'menu_id', 'menu_id1', 'menu_id2']
  const out: string[] = []
  for (const k of keys) {
    out.push(`*"${k}":"${id}"*`)
    out.push(`*"${k}": "${id}"*`)
  }
  return out
}

export function posMenuDeleteBlockMessage(reason: PosMenuDeleteBlockReason): string {
  return POS_MENU_DELETE_BLOCK_MESSAGES[reason]
}
