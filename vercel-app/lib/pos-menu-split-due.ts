/** 메뉴 기준 더치페이: 인원별 결제 대상 금액(할인·세금 반영) */
export function computeMenuSplitDueByPerson(params: {
  total: number
  subtotal: number
  baseByPerson: number[]
  round2?: (n: number) => number
}): number[] {
  const round2 = params.round2 ?? ((n: number) => Math.round(n * 100) / 100)
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
