/** 옵션 단계 선택 다이얼로그: 건너뛴(선택) 단계는 비교에서 제외 */
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
    if (optional && (sel === undefined || sel === null || String(sel).trim() === '')) return true
    return String(optionStepValues?.[g] ?? '').trim() === String(sel ?? '').trim()
  })
}
