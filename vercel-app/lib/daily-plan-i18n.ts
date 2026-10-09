/** 일일 일정표 표시 라벨 (DB 값 → i18n 키) */

import type { DailyPlanBundle } from "@/lib/api-client/daily-plans"
import { computePlanTimeline, minToHm } from "@/lib/daily-plan-timeline"
import { I18N_DAILY_PLAN_KO, I18N_DAILY_PLAN_TH } from "@/lib/i18n-daily-plan"

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

/** 일정 분류 → 개선 과제 분류 */
const ACTION_CATEGORY_OF: Record<string, string> = {
  인원: "인력",
  시설: "시설연계",
  교육: "교육",
  "재고·발주": "재고·발주",
  청결: "청결",
  고객: "서비스",
}

/** 일정 항목에서 이동할 화면. kind=new_action 이면 그 매장 개선 과제 등록(방문 출처) */
export function dailyPlanLinkHref(
  item: { link_type: string; store_name: string; source?: string; ref_id?: string; category?: string },
  kind: "open" | "new_action" = "open"
): string | null {
  const linkType = item.link_type
  const store = item.store_name
  if (kind === "new_action") {
    const q = new URLSearchParams({ tab: "new", source: "visit" })
    if (store) q.set("store", store)
    q.set("category", ACTION_CATEGORY_OF[String(item.category || "")] || "기타")
    return `/admin/store-actions?${q}`
  }
  if (item.source === "action" && item.ref_id && /^\d+$/.test(item.ref_id)) {
    return `/admin/store-actions?id=${item.ref_id}`
  }
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

/** 저장된 제목 앞말(생성 시 한국어 고정, 중복 키에 쓰임) → 화면 언어 */
const TITLE_PREFIX_KEYS: [string, string][] = [
  ["[재확인] ", "dp_prefix_verify"],
  ["[개선] ", "dp_prefix_action"],
]

export function dailyPlanItemTitle(title: string, t: T): string {
  const s = String(title || "")
  for (const [p, k] of TITLE_PREFIX_KEYS) if (s.startsWith(p)) return `${t(k)} ${s.slice(p.length)}`
  return s
}

/** 푸시·업무일지처럼 받는 사람 언어를 모를 때 — 한국어 · 태국어 병기 */
export function koThText(k: string): string {
  return `${I18N_DAILY_PLAN_KO[k] ?? k} · ${I18N_DAILY_PLAN_TH[k] ?? k}`
}

const LINE_MARK: Record<string, string> = { done: "✅", skipped: "⏭️", doing: "▶️", todo: "▫️" }

/** 한 사람 일정 → LINE 붙여넣기 문구 (표 없이 시간순) */
export function buildDailyPlanLineText(b: DailyPlanBundle, t: T): string {
  const { plan, items, summary } = b
  const { slots } = computePlanTimeline(
    items.map((i) => ({ id: i.id, source: i.source, storeName: i.store_name, timeSlot: i.time_slot, estMinutes: i.est_minutes })),
    { shiftIn: plan.shift_in, travelMinutes: b.travelMinutes }
  )
  const lines = [`📅 **${t("dp_line_title")} ${plan.plan_date}** · ${plan.employee_name}`]
  const route = plan.route_stores || []
  if (route.length > 0) lines.push(`📍 ${route.join(" → ")}`)
  lines.push("")
  for (const it of items) {
    const s = slots.get(it.id)
    const at = s ? (s.end > s.start && it.source !== "visit" ? `${minToHm(s.start)}–${minToHm(s.end)}` : minToHm(s.start)) : ""
    if (it.source === "visit") {
      lines.push(`🚗 ${at} **${t("dp_visit_title")} ${it.title}**`)
      continue
    }
    const why = it.status === "skipped" && it.skip_reason ? ` (${it.skip_reason})` : ""
    lines.push(`${LINE_MARK[it.status] || "▫️"} ${at} ${dailyPlanItemTitle(it.title, t)}${why}`)
  }
  lines.push("", `${t("dp_col_progress")} ${summary.done}/${summary.total} (${summary.doneRate}%)`)
  return lines.join("\n")
}

export function minutesLabel(n: number, t: T): string {
  const m = Math.max(0, Math.round(n || 0))
  if (m < 60) return t("dp_min_n").replace("{n}", String(m))
  const h = Math.floor(m / 60)
  const r = m % 60
  return t("dp_hour_min").replace("{h}", String(h)).replace("{m}", String(r))
}
