/**
 * 지급예정(expense_accruals) 기간 조회용 PostgREST 필터.
 * `or=(and(...))` 대신 `&` AND 조건 2회 조회 후 병합(환경별 빈 결과 방지).
 */
export function buildExpenseAccrualPlanDateFilters(startStr: string, endStr: string): string[] {
  if (startStr && endStr) {
    const s = encodeURIComponent(startStr)
    const e = encodeURIComponent(endStr)
    return [
      `expense_date=gte.${s}&expense_date=lte.${e}`,
      `due_date=gte.${s}&due_date=lte.${e}`,
    ]
  }
  if (startStr) {
    const s = encodeURIComponent(startStr)
    return [`expense_date=gte.${s}`, `due_date=gte.${s}`]
  }
  if (endStr) {
    const e = encodeURIComponent(endStr)
    return [`expense_date=lte.${e}`, `due_date=lte.${e}`]
  }
  return ['id=gt.0']
}
