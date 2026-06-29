/** 옵션 단계 선택 다이얼로그: 건너뛴(선택) 단계는 해당 그룹 값이 비어 있는 행만 일치 */
export function posOptionRowMatchesPickerSelections(
  optionStepValues: Record<string, string> | null | undefined,
  groups: string[],
  selections: Record<string, string | undefined>,
  groupConfigByKey: Map<string, { required?: boolean } | undefined>
): boolean {
  return groups.every((g) => {
    const sel = selections[g]
    const cfg = groupConfigByKey.get(g)
    const optional = cfg?.required === false
    const rowVal = String(optionStepValues?.[g] ?? '').trim()
    if (optional && (sel === undefined || sel === null || String(sel).trim() === '')) {
      return rowVal === ''
    }
    return rowVal === String(sel ?? '').trim()
  })
}
