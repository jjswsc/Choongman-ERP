/**
 * leave_requests.type 등 DB에 저장되는 휴가 종류 문자열 → UI 언어 표시.
 * (직원 앱 hr-tab은 value로 한국어·ลากิจ 를 저장함 — getPayrollCalc 동일 소스)
 */

/** DB에 저장되는 휴가 유형 → i18n 키 (annual, half, sick, unpaid, lakij) */
export const LEAVE_TYPE_DB_TO_KEY: Record<string, string> = {
  연차: "annual",
  반차: "half",
  병가: "sick",
  무급휴가: "unpaid",
  ลากิจ: "lakij",
  /** 스케줄 편집 등 레거시/영문 값 */
  Annual: "annual",
  Half: "half",
  Sick: "sick",
  Unpaid: "unpaid",
  Lakij: "lakij",
}

/** getPayrollCalc에서 무급 처리 시 붙는 비고 (한국어 고정) */
export const PAYROLL_LEAVE_NOTE_UNDER_ONE_YEAR_KO = "입사 1년 미만 연차·반차 → 무급 처리"

const COMPOUND_UNPAID_HALF_KO = "무급휴가(반차)"

export function translateLeaveTypeFromDb(type: string, t: (k: string) => string): string {
  const s = type.trim()
  const key = LEAVE_TYPE_DB_TO_KEY[s]
  if (key) return t(key)
  if (s === COMPOUND_UNPAID_HALF_KO) {
    return `${t("unpaid")} (${t("half")})`
  }
  return type
}

/**
 * 급여 산출 상세(otherDed) 무급휴가 행: detail = `${type}` 또는 `${type} (${note})`
 * 알려진 패턴만 번역하고, 그 외(직원 사유 등)는 그대로 둠.
 */
export function tryTranslatePayrollLeaveDetail(detail: string, t: (k: string) => string): string | null {
  const d = detail.trim()
  if (!d) return null

  const paren = d.match(/^(.+?) \((.+)\)$/)
  if (paren) {
    const left = translateLeaveTypeFromDb(paren[1].trim(), t)
    const inner = paren[2].trim()
    const right =
      inner === PAYROLL_LEAVE_NOTE_UNDER_ONE_YEAR_KO
        ? t("pay_explain_leave_note_under_one_year")
        : inner
    return `${left} (${right})`
  }

  if (LEAVE_TYPE_DB_TO_KEY[d] || d === COMPOUND_UNPAID_HALF_KO) {
    return translateLeaveTypeFromDb(d, t)
  }

  return null
}
