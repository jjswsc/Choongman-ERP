/** 일일 업무표 표시 라벨 (DB 값 → i18n 키) */

type T = (k: string) => string

const ROLE_KEYS: Record<string, string> = {
  supervisor: "dp_role_supervisor",
  manager: "dp_role_manager",
  staff: "dp_role_staff",
}

const ITEM_STATUS_KEYS: Record<string, string> = {
  todo: "dp_item_todo",
  doing: "dp_item_doing",
  done: "dp_item_done",
  skipped: "dp_item_skipped",
}

const PLAN_STATUS_KEYS: Record<string, string> = {
  planned: "dp_plan_planned",
  in_progress: "dp_plan_in_progress",
  closed: "dp_plan_closed",
}

const TEMPLATE_STATUS_KEYS: Record<string, string> = {
  draft: "dp_tpl_draft",
  pilot: "dp_tpl_pilot",
  active: "dp_tpl_active",
  archived: "dp_tpl_archived",
}

const SOURCE_KEYS: Record<string, string> = {
  routine: "dp_src_routine",
  hq_task: "dp_src_hq_task",
  action: "dp_src_action",
  carry: "dp_src_carry",
  visit: "dp_src_visit",
}

const LINK_KEYS: Record<string, string> = {
  none: "dp_link_none",
  store_check: "dp_link_store_check",
  store_visit: "dp_link_store_visit",
  store_actions: "dp_link_store_actions",
  schedule: "dp_link_schedule",
  stock_take: "dp_link_stock_take",
}

const POSITION_KEYS: Record<string, string> = {
  all: "dp_pos_all",
  service: "dp_pos_service",
  kitchen: "dp_pos_kitchen",
  office: "dp_pos_office",
}

const CATEGORY_KEYS: Record<string, string> = {
  인원: "dp_cat_people",
  시설: "dp_cat_facility",
  교육: "dp_cat_training",
  "재고·발주": "dp_cat_stock",
  청결: "dp_cat_clean",
  "당일 과제": "dp_cat_today",
  고객: "dp_cat_customer",
  기타: "dp_cat_etc",
}

function lookup(map: Record<string, string>, t: T, v: string): string {
  const k = map[String(v || "")]
  if (!k) return String(v || "")
  const s = t(k)
  return s && s !== k ? s : String(v || "")
}

export function dailyPlanLabelers(t: T) {
  return {
    role: (v: string) => lookup(ROLE_KEYS, t, v),
    itemStatus: (v: string) => lookup(ITEM_STATUS_KEYS, t, v),
    planStatus: (v: string) => lookup(PLAN_STATUS_KEYS, t, v),
    templateStatus: (v: string) => lookup(TEMPLATE_STATUS_KEYS, t, v),
    source: (v: string) => lookup(SOURCE_KEYS, t, v),
    link: (v: string) => lookup(LINK_KEYS, t, v),
    position: (v: string) => lookup(POSITION_KEYS, t, v),
    category: (v: string) => lookup(CATEGORY_KEYS, t, v),
  }
}

/** 업무 항목에서 이동할 화면 — 모바일은 탭 전환, 관리자는 경로 */
export function dailyPlanLinkHref(linkType: string, store: string): string | null {
  const q = store ? `?store=${encodeURIComponent(store)}` : ""
  switch (linkType) {
    case "store_check":
      return `/admin/store-check${q}`
    case "store_visit":
      return `/admin/store-visit`
    case "store_actions":
      return `/admin/store-actions${store ? `?store=${encodeURIComponent(store)}&tab=list` : ""}`
    case "schedule":
      return `/admin/attendance`
    case "stock_take":
      return `/admin/stock`
    default:
      return null
  }
}

export function minutesLabel(n: number, t: T): string {
  const m = Math.max(0, Math.round(n || 0))
  if (m < 60) return t("dp_min_n").replace("{n}", String(m))
  const h = Math.floor(m / 60)
  const r = m % 60
  return t("dp_hour_min").replace("{h}", String(h)).replace("{m}", String(r))
}
