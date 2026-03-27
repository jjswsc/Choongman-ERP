/** API·JSON에 따라 menuId가 숫자/문자 혼재 시 매칭 실패 방지 */
export function costAnalysisMenuIdKey(id: unknown): string {
  return String(id ?? "")
}

/** 기본 행(option 없음): null·undefined·''·'null' 문자열까지 기본으로 취급 */
export function isCostAnalysisBaseRow(r: { optionId?: string | number | null }): boolean {
  const o = r.optionId
  if (o == null) return true
  if (typeof o === "string" && (o.trim() === "" || o === "null")) return true
  return false
}

/** 목록·저장 후 갱신 시 동일 메뉴/옵션 행 매칭 (optionId 0도 안전) */
export function posCostAnalysisRowKey(r: { menuId: unknown; optionId?: string | number | null }): string {
  return isCostAnalysisBaseRow(r)
    ? costAnalysisMenuIdKey(r.menuId)
    : `${costAnalysisMenuIdKey(r.menuId)}:${String(r.optionId)}`
}
