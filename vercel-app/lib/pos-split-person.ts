/** 분리결제(แยกบิล) — 인원별 멤버·협업 참여. UI는 기존 회원 검색창을 현재 손님에 연결 */

export function padSplitPersonIds(values: string[] | undefined, count: number): string[] {
  const n = Math.max(0, Math.trunc(Number(count) || 0))
  const src = Array.isArray(values) ? values : []
  return Array.from({ length: n }, (_, i) => String(src[i] ?? '').trim())
}

export function padSplitPersonFlags(
  values: boolean[] | undefined,
  count: number,
  fill = true
): boolean[] {
  const n = Math.max(0, Math.trunc(Number(count) || 0))
  const src = Array.isArray(values) ? values : []
  return Array.from({ length: n }, (_, i) => (i < src.length ? src[i] !== false : fill))
}

/** 주문 member_id — 분리 중이면 첫 멤버, 없으면 0 */
export function pickPrimarySplitMemberId(
  memberIds: Array<string | number | null | undefined>
): number {
  for (const raw of memberIds || []) {
    const id = Math.max(0, Math.trunc(Number(raw) || 0))
    if (id > 0) return id
  }
  return 0
}

export function joiningAssignedQtyByPerson(
  assignedQtyByPerson: number[],
  joinByPerson: boolean[]
): number[] {
  const assigned = Array.isArray(assignedQtyByPerson) ? assignedQtyByPerson : []
  return assigned.map((qty, i) => (joinByPerson[i] === false ? 0 : Math.max(0, Number(qty) || 0)))
}

/**
 * 협업 할인에 넣을 줄 수량.
 * 메뉴 분리: 참여 인원에게 배정된 수량만. 금액 분리: 한 명이라도 참여하면 전량(할인은 due에서 참여 인원만 부담).
 */
export function collabAssignedQtyForLine(params: {
  showSplit: boolean
  splitMode: 'menu' | 'amount'
  lineQty: number
  assignedQtyByPerson: number[]
  joinByPerson: boolean[]
}): number {
  const lineQty = Math.max(0, Number(params.lineQty) || 0)
  if (!params.showSplit) return lineQty
  if (params.splitMode === 'amount') {
    return (params.joinByPerson || []).some((j) => j !== false) ? lineQty : 0
  }
  const joinQty = joiningAssignedQtyByPerson(params.assignedQtyByPerson, params.joinByPerson).reduce(
    (sum, qty) => sum + qty,
    0
  )
  return Math.min(lineQty, joinQty)
}

function round2Default(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * 금액 균등 분리: 협업 할인 D는 참여 인원만 나눠 부담. 미참여는 할인 전 1/N.
 * 전원 참여면 기존처럼 total/N.
 */
export function computeAmountSplitDueWithCollabJoin(params: {
  total: number
  collabDiscountAmt: number
  joinByPerson: boolean[]
  round2?: (n: number) => number
}): number[] {
  const round2 = params.round2 ?? round2Default
  const n = (params.joinByPerson || []).length
  const due = Array.from({ length: n }, () => 0)
  const total = round2(Math.max(0, Number(params.total) || 0))
  if (n <= 0) return due
  const collab = round2(Math.max(0, Number(params.collabDiscountAmt) || 0))
  const joinIdx = (params.joinByPerson || [])
    .map((joined, idx) => (joined !== false ? idx : -1))
    .filter((idx) => idx >= 0)
  if (total <= 0) return due
  if (collab <= 0.0001 || joinIdx.length === 0 || joinIdx.length === n) {
    let acc = 0
    for (let i = 0; i < n; i += 1) {
      if (i === n - 1) {
        due[i] = round2(Math.max(0, total - acc))
      } else {
        const one = round2(total / n)
        due[i] = one
        acc = round2(acc + one)
      }
    }
    return due
  }
  const preCollab = round2(total + collab)
  const joinCount = joinIdx.length
  let acc = 0
  for (let i = 0; i < n; i += 1) {
    if (i === n - 1) {
      due[i] = round2(Math.max(0, total - acc))
      break
    }
    const base = round2(preCollab / n)
    const share = joinIdx.includes(i) ? round2(Math.max(0, base - collab / joinCount)) : base
    due[i] = share
    acc = round2(acc + share)
  }
  return due
}

export function allocateAmountByWeights(weights: number[], amount: number): number[] {
  const round2 = round2Default
  const n = weights.length
  const amt = round2(Math.max(0, Number(amount) || 0))
  if (n <= 0) return []
  const safe = weights.map((w) => Math.max(0, Number(w) || 0))
  const sum = safe.reduce((s, v) => s + v, 0)
  if (amt <= 0.0001 || sum <= 0.0001) return safe.map(() => 0)
  const out = safe.map(() => 0)
  const positiveIdx = safe.map((w, i) => (w > 0.0001 ? i : -1)).filter((i) => i >= 0)
  let used = 0
  for (let k = 0; k < positiveIdx.length; k += 1) {
    const i = positiveIdx[k]
    if (k === positiveIdx.length - 1) {
      out[i] = round2(Math.max(0, amt - used))
      break
    }
    const share = round2((amt * safe[i]) / sum)
    out[i] = share
    used = round2(used + share)
  }
  return out
}
