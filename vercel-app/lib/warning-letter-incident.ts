/**
 * 사고/이슈 행: 드롭다운 키(`eval_incident_n`)만 있고 상세·날짜·경고가 없으면
 * 저장·경고서 API에서 "내용 없음"으로 본다 (빈 행이 경고서 탭에 남는 문제 방지).
 */

export const EVAL_INCIDENT_DROPDOWN_TYPE_KEY_RE = /^eval_incident_\d+$/i

type IncidentLike = {
  type?: string
  typeOther?: string
  details?: string
  date?: string
  warningLetterUrl?: string
  warningLetterChecked?: boolean
}

/** 클라이언트 폼 행 → 저장할지 여부 */
export function evalIncidentRowHasUserContent(inc: IncidentLike): boolean {
  const url = String(inc.warningLetterUrl || "").trim()
  if (url) return true
  if (inc.warningLetterChecked) return true
  const details = String(inc.details || "").trim()
  const date = String(inc.date || "").trim()
  if (details || date) return true
  const type = String(inc.type || "").trim()
  if (type === "__기타__" || type === "기타") {
    return Boolean(String(inc.typeOther || "").trim())
  }
  if (type && !EVAL_INCIDENT_DROPDOWN_TYPE_KEY_RE.test(type)) {
    return true
  }
  return false
}

/** evaluation_results.json_data.incidents[] 한 행 (서버) */
export function evalStoredIncidentRecordHasContent(inc: Record<string, unknown> | null | undefined): boolean {
  if (!inc || typeof inc !== "object") return false
  return evalIncidentRowHasUserContent({
    type: String(inc.type ?? ""),
    typeOther: String(inc.typeOther ?? ""),
    details: String(inc.details ?? ""),
    date: String(inc.date ?? inc.incidentDate ?? ""),
    warningLetterUrl: String(inc.warningLetterUrl ?? ""),
    warningLetterChecked: Boolean(inc.warningLetterChecked),
  })
}
