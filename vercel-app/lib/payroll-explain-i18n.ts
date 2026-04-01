/**
 * getPayrollCalc API는 calcExplain의 reason/detail을 한국어로 보냄.
 * 급여 계산 UI 언어에 맞게 표시하기 위한 매핑.
 */

import { tryTranslatePayrollLeaveDetail } from "@/lib/leave-type-i18n"

export function i18nVar(template: string, vars: Record<string, string | number>): string {
  let s = template
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{{${k}}}`).join(String(v))
  }
  return s
}

const REASON_KEY: Record<string, string> = {
  "시급제 기본급": "pay_explain_reason_salary_hourly",
  "월급제 기본급": "pay_explain_reason_salary_monthly",
  직책수당: "pay_pos_allow",
  "주방 위험수당": "pay_explain_reason_haz_kitchen",
  "위험수당 합계": "pay_explain_reason_haz_sum",
  "생일 보너스": "pay_birth",
  "공휴일 근무수당": "pay_explain_reason_holiday_work",
  "공휴일 수당 합계": "pay_explain_reason_holiday_sum",
  "연장근무(1.5배)": "pay_explain_reason_ot_15",
  "연장근무 미인정": "pay_explain_reason_ot_not_counted",
  "OT 합계": "pay_explain_reason_ot_sum",
  "지각 공제": "pay_explain_reason_late_ded",
  "조퇴 공제": "pay_explain_reason_early_ded",
  "반차 공제": "pay_explain_reason_half_day",
  "지각/조퇴 공제 합계": "pay_explain_reason_late_early_sum",
  무급휴가: "pay_explain_reason_unpaid_leave",
  "결석 공제": "pay_explain_reason_absence",
  "기타 공제 합계": "pay_explain_reason_other_sum",
  "SSO(사회보험) 공제": "pay_explain_reason_sso",
}

export function isPayrollExplainSumRow(reason: string): boolean {
  return reason.includes("합계")
}

export function translatePayrollExplainReason(reason: string, t: (k: string) => string): string {
  const key = REASON_KEY[reason]
  return key ? t(key) : reason
}

const DETAIL_FIXED: Record<string, string> = {
  "인사 정보의 월 고정 수당": "pay_explain_d_hr_pos_fixed",
  "근무 1일분": "pay_explain_d_haz_day_work",
  "근속 1년 이상": "pay_explain_d_birth_tenure",
  "시급제 8시간분": "pay_explain_d_holiday_hourly8",
  "월급제 일당 1회분": "pay_explain_d_holiday_monthly_daily",
  "무급 결석 1일": "pay_explain_d_absence_unpaid_day",
}

export function translatePayrollExplainDetail(detail: string, t: (k: string) => string): string {
  const d = detail.trim()
  if (!d) return ""

  const fixedKey = DETAIL_FIXED[d]
  if (fixedKey) return t(fixedKey)

  let m: RegExpMatchArray | null

  m = d.match(/^근무 ([\d.]+)시간 × 시급 (\d+)$/)
  if (m) return i18nVar(t("pay_explain_d_hourly_base"), { hours: m[1], rate: m[2] })

  m = d.match(/^퇴사 (.+) 반영 일할 \(예정근무 (\d+)\/(\d+)일, 등록 월급 (\d+)\)$/)
  if (m) return i18nVar(t("pay_explain_d_resign_prorate"), { date: m[1], num: m[2], den: m[3], sal: m[4] })

  m = d.match(/^인사 등록 월급 (\d+)$/)
  if (m) return i18nVar(t("pay_explain_d_monthly_registered_sal"), { sal: m[1] })

  m = d.match(/^(\d+)일 × (\d+)$/)
  if (m) return i18nVar(t("pay_explain_d_days_times"), { days: m[1], amt: m[2] })

  m = d.match(/^(\d+)일$/)
  if (m) return i18nVar(t("pay_explain_d_n_days"), { n: m[1] })

  m = d.match(/^([\d.]+)시간 반영$/)
  if (m) return i18nVar(t("pay_explain_d_hours_applied"), { h: m[1] })

  m = d.match(/^(\d+)분 \(최소 (\d+)분 미만\)$/)
  if (m) return i18nVar(t("pay_explain_d_ot_under_min"), { raw: m[1], min: m[2] })

  m = d.match(/^([\d.]+)시간$/)
  if (m) return i18nVar(t("pay_explain_d_n_hours"), { h: m[1] })

  m = d.match(/^(\d+)분$/)
  if (m) return i18nVar(t("pay_explain_d_n_minutes"), { n: m[1] })

  m = d.match(/^10분 이상 지각 (\d+)회$/)
  if (m) return i18nVar(t("pay_explain_d_late3_detail"), { n: m[1] })

  m = d.match(/^지각 (\d+)분, 조퇴 (\d+)분$/)
  if (m) return i18nVar(t("pay_explain_d_late_early_pair"), { late: m[1], early: m[2] })

  m = d.match(/^무급휴가 (\d+)일 \+ 결석 (\d+)일$/)
  if (m) return i18nVar(t("pay_explain_d_other_sum"), { ul: m[1], ab: m[2] })

  m = d.match(/^산정기준 (.+) × 5% \(연도 상한 적용\)$/)
  if (m) return i18nVar(t("pay_explain_d_sso_formula"), { gross: m[1] })

  const leaveLine = tryTranslatePayrollLeaveDetail(d, t)
  if (leaveLine != null) return leaveLine

  return detail
}
