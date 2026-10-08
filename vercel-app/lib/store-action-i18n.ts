/** 개선 과제 상태·카테고리·우선순위·이력 이벤트 → i18n 키 */

export const STORE_ACTION_STATUS_I18N: Record<string, string> = {
  open: "action_st_open",
  in_progress: "action_st_in_progress",
  pending_verify: "action_st_pending_verify",
  completed: "action_st_completed",
  cancelled: "action_st_cancelled",
}

export const STORE_ACTION_CAT_I18N: Record<string, string> = {
  인력: "action_cat_staff",
  교육: "action_cat_training",
  청결: "action_cat_clean",
  "재고·발주": "action_cat_stock",
  "레시피·품질": "action_cat_recipe",
  서비스: "action_cat_service",
  시설연계: "action_cat_facility_link",
  기타: "action_cat_etc",
}

/** 카테고리별 조치 계획 템플릿 키 */
export const STORE_ACTION_CAT_TEMPLATE_I18N: Record<string, string> = {
  인력: "action_tpl_staff",
  교육: "action_tpl_training",
  청결: "action_tpl_clean",
  "재고·발주": "action_tpl_stock",
  "레시피·품질": "action_tpl_recipe",
  서비스: "action_tpl_service",
  시설연계: "action_tpl_facility_link",
  기타: "action_tpl_etc",
}

export const STORE_ACTION_PRI_I18N: Record<string, string> = {
  긴급: "action_pri_urgent",
  보통: "action_pri_normal",
  낮음: "action_pri_low",
}

export const STORE_ACTION_EVENT_I18N: Record<string, string> = {
  create: "action_ev_create",
  update: "action_ev_update",
  status: "action_ev_status",
  request_verify: "action_ev_request_verify",
  verify_pass: "action_ev_verify_pass",
  verify_reject: "action_ev_verify_reject",
  reassign: "action_ev_reassign",
}

export function storeActionLabelers(t: (k: string) => string) {
  return {
    status: (s: string) => t(STORE_ACTION_STATUS_I18N[s] || "action_st_open") || s,
    category: (c: string) => t(STORE_ACTION_CAT_I18N[c] || "action_cat_etc") || c,
    priority: (p: string) => t(STORE_ACTION_PRI_I18N[p] || "action_pri_normal") || p,
    event: (e: string) => t(STORE_ACTION_EVENT_I18N[e] || "action_ev_update") || e,
  }
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00+07:00`)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}
