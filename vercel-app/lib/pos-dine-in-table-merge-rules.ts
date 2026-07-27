/**
 * 홀 테이블 **이동(move)** · **합석(merge)** 비즈니스 규칙 (서버·문서 단일 기준)
 *
 * ## 이동(move)
 * - `order_type`이 매장(홀, dine_in)인 주문만.
 * - 상태가 완료·취소·환불이 아닐 것.
 * - 목적지 `table_name`에 **다른 활성 주문**이 없을 것(있으면 합석 사용).
 * - DB에서는 해당 주문의 `table_name`만 변경(품목·금액 불변).
 * - 선불(paid) 등 결제가 반영된 주문도 **이동은 허용**(자리 옮김).
 *
 * ## 합석(merge)
 * - 기준(keep)은 반드시 `dine_in`. 흡수(absorb)는 `dine_in` 또는 `takeout`(포장 → 이 테이블 청구서로만).
 * - 같은 `store_code`, 둘 다 완료/취소 아님.
 * - **양쪽 모두 결제 합계 0**(현금·카드·QR·기타)일 때만. 한쪽이라도 결제 반영 시 합석 불가 → 이동만.
 * - `keep` 주문 한 건에 품목·할인·쿠폰할인·손님 수·메모·회원·포인트 사용 등을 합침.
 * - `absorb` 주문은 `cancelled` + memo `[ORDER_MERGED … keep_id=…]` 스탬프(실제 취소·매출 집계와 구분).
 * - `keep` 주문 memo에 `[ORDER_MERGE_KEEP … absorb_id=…]` 스탬프를 남겨 Realtime/폴링이 추가주문으로 오인·재인쇄하지 않게 한다.
 * - 쿠폰 코드가 서로 다르면 keep 우선, 상대 코드는 메모에 `[합석] 보조 쿠폰: …` 로 남김.
 *
 * ## 합석 시 품목 줄(라인) 규칙
 * 1. **순서**: 기준(keep) 주문의 줄을 먼저, 이어서 흡수(absorb) 주문 줄.
 * 2. **동일 줄**: 아래가 모두 같으면 “같은 메뉴 줄”로 본다.
 *    - `name`(trim), `price`, `note`(trim)
 *    - `promoId`, `promoCode`, `orderType`, `deliveryAppCode`(문자열화)
 *    - `promoItems`는 안정 JSON 문자열로 비교(키 정렬)
 * 3. **수량 합산**: 위 “동일 줄”이면서 **양쪽 모두 미서빙**(`servedAt` 없음·빈 문자열)일 때만 `qty`를 더해 한 줄로 합친다.
 * 4. **서빙됨**: 한쪽이라도 `servedAt`이 있으면 동일 메뉴라도 **줄을 나눠 유지**(서빙·주방 이력 혼선 방지).
 * 5. 합친 줄의 `id`는 **먼저 남은 줄(앞쪽)** 의 id를 유지한다.
 * 6. 자동 주방/영수증 재출력은 하지 않는다(필요 시 POS에서 수동).
 */

function stableStringify(value: unknown): string {
  if (value == null) return ''
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`
  }
  const o = value as Record<string, unknown>
  const keys = Object.keys(o).sort()
  const parts: string[] = []
  for (const k of keys) {
    parts.push(`${JSON.stringify(k)}:${stableStringify(o[k])}`)
  }
  return `{${parts.join(',')}}`
}

/** 합석 시 “같은 메뉴 줄” 판별용 키 (서빙 여부는 제외) */
export function posMergeLineIdentityKey(line: Record<string, unknown>): string {
  const name = String(line.name ?? '').trim()
  const price = Number(line.price ?? 0) || 0
  const note = String(line.note ?? '').trim()
  const promoId = String(line.promoId ?? '')
  const promoCode = String(line.promoCode ?? '')
  const orderType = String(line.orderType ?? '')
  const deliveryAppCode = String(line.deliveryAppCode ?? '')
  const promoItems = stableStringify(line.promoItems)
  const sep = '\u001f'
  return [name, price, note, promoId, promoCode, orderType, deliveryAppCode, promoItems].join(sep)
}

export function posMergeLineIsUnserved(line: Record<string, unknown>): boolean {
  const s = line.servedAt
  if (s == null) return true
  if (typeof s === 'string' && !String(s).trim()) return true
  return false
}

/**
 * keep → absorb 순으로 이어 붙인 줄 배열에서, 규칙에 따라 미서빙 동일 메뉴만 수량 합산.
 */
function lineQty(raw: Record<string, unknown>): number {
  const q = Number(raw.qty ?? raw.quantity ?? 1) || 1
  return Math.max(0.01, q)
}

function cloneLineForOutput(line: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...line }
  if (copy.qty == null && copy.quantity != null) {
    copy.qty = copy.quantity
  }
  delete copy.quantity
  return copy
}

export function consolidatePosOrderLinesAfterMerge(
  linesInOrder: Record<string, unknown>[]
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const line of linesInOrder) {
    const key = posMergeLineIdentityKey(line)
    const unserved = posMergeLineIsUnserved(line)
    if (unserved) {
      const idx = out.findIndex((o) => posMergeLineIsUnserved(o) && posMergeLineIdentityKey(o) === key)
      if (idx >= 0) {
        const prev = out[idx]
        const qty = Math.round((lineQty(prev) + lineQty(line)) * 1000) / 1000
        const merged = { ...prev, qty }
        delete (merged as { quantity?: unknown }).quantity
        out[idx] = merged
        continue
      }
    }
    out.push(cloneLineForOutput(line))
  }
  return out
}
