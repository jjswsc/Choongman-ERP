function round2Default(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * 메뉴 기준 더치페이 — 줄 할인액을 배정 수량 비율로 나눔.
 * 전량 배정이면 마지막 인원에 잔액을 주어 합이 원 할인액과 같다.
 */
export function allocateLineDiscountByAssignedQty(params: {
  lineDiscountAmt: number
  lineQty: number
  assignedQtyByPerson: number[]
  round2?: (n: number) => number
}): number[] {
  const round2 = params.round2 ?? round2Default
  const discount = Math.max(0, Number(params.lineDiscountAmt) || 0)
  const lineQty = Math.max(0, Number(params.lineQty) || 0)
  const assigned = (params.assignedQtyByPerson || []).map((q) => Math.max(0, Number(q) || 0))
  if (assigned.length === 0) return []
  if (discount <= 0.0001 || lineQty <= 0.0001) return assigned.map(() => 0)

  const assignedSum = assigned.reduce((s, v) => s + v, 0)
  if (assignedSum <= 0.0001) return assigned.map(() => 0)

  const positiveIdx = assigned
    .map((qty, idx) => (qty > 0.0001 ? idx : -1))
    .filter((idx) => idx >= 0)
  const fullyAssigned = assignedSum + 0.0001 >= lineQty
  const out = assigned.map(() => 0)
  let used = 0
  for (let k = 0; k < positiveIdx.length; k += 1) {
    const i = positiveIdx[k]
    if (fullyAssigned && k === positiveIdx.length - 1) {
      out[i] = round2(Math.max(0, discount - used))
      break
    }
    const share = round2((discount * assigned[i]) / lineQty)
    out[i] = share
    used = round2(used + share)
  }
  return out
}

/** 메뉴 정가 합(baseSum)에 주문 할인·최종합계 비율을 적용한 결제 대상 금액 */
export function computeMenuSplitDueFromBaseSum(params: {
  total: number
  subtotal: number
  baseSum: number
  round2?: (n: number) => number
}): number {
  const round2 = params.round2 ?? round2Default
  const { total, subtotal, baseSum } = params
  const safeBase = Math.max(0, Number(baseSum) || 0)
  if (safeBase <= 0.009) return 0
  if (total <= 0 || subtotal <= 0.009) return round2(safeBase)
  return round2((total * safeBase) / subtotal)
}

/** 메뉴 기준 더치페이: 인원별 결제 대상 금액(할인·세금 반영) */
export function computeMenuSplitDueByPerson(params: {
  total: number
  subtotal: number
  baseByPerson: number[]
  round2?: (n: number) => number
}): number[] {
  const round2 = params.round2 ?? round2Default
  const { total, subtotal, baseByPerson } = params
  const count = baseByPerson.length
  const dueByPerson = Array.from({ length: count }, () => 0)
  if (total <= 0 || subtotal <= 0 || count === 0) return dueByPerson
  const baseSum = baseByPerson.reduce((s, v) => s + Math.max(0, Number(v) || 0), 0)
  if (baseSum <= 0.009) return dueByPerson
  const assignedIndices = baseByPerson
    .map((base, idx) => (Math.max(0, Number(base) || 0) > 0.009 ? idx : -1))
    .filter((idx) => idx >= 0)
  if (assignedIndices.length === 0) return dueByPerson
  const allocatableTotal = round2((total * baseSum) / subtotal)
  let acc = 0
  for (let k = 0; k < assignedIndices.length; k += 1) {
    const i = assignedIndices[k]
    if (k === assignedIndices.length - 1) {
      dueByPerson[i] = round2(Math.max(0, allocatableTotal - acc))
    } else {
      const raw = (allocatableTotal * Math.max(0, baseByPerson[i] || 0)) / baseSum
      const rounded = round2(raw)
      dueByPerson[i] = rounded
      acc = round2(acc + rounded)
    }
  }
  return dueByPerson
}
