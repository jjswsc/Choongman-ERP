"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm, appPrompt } from "@/lib/app-message"

import * as React from "react"
import { Receipt, Search, ChevronDown, Pencil, Plus, Trash2, Printer, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLang } from "@/lib/lang-context"
import { useT, tr as i18nTr } from "@/lib/i18n"
import {
  getPosOrders,
  getPosPaymentAttempts,
  getPosLinkposTenderRules,
  executeLinkposPaymentServer,
  savePosLinkposTenderRule,
  deletePosLinkposTenderRule,
  getPosMenus,
  getPosPrinterSettings,
  getPosDeliveryApps,
  getGrabStoreIntegrations,
  getPosOrderAuditTrail,
  updatePosOrder,
  updatePosOrderStatus,
  useStoreList,
  type PosOrderAuditTrailRow,
  type PosOrder,
  type PosPaymentAttempt,
  type PosLinkposTenderRule,
  type PosMenu,
  type PosDeliveryApp,
  type GrabStoreIntegrationSnapshot,
} from "@/lib/api-client"
import {
  getPosDeliveryPlatformName,
  formatPosOrderTypeChannelSuffix,
  getPosChannelOrderNoDisplay,
} from "@/lib/pos-delivery-platform"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import {
  adminTabsContentFlushCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn, escapeHtml } from "@/lib/utils"
import {
  ADMIN_BADGE_BASE_CN,
  ADMIN_BADGE_DANGER_CN,
  ADMIN_BADGE_NEUTRAL_CN,
  ADMIN_BADGE_SUCCESS_CN,
  ADMIN_BADGE_WARNING_CN,
  ADMIN_BTN_XS_CN,
  ADMIN_DIALOG_SCROLL_CN,
} from "@/lib/admin-ui-standards"
import { formatPosDateTimeMedium } from "@/lib/pos-datetime-locale"
import { kitchenSlipPrintI18n } from "@/lib/pos-kitchen-slip-print-i18n"
import {
  buildKitchenSlipGroupOpts,
  buildKitchenSlipGroups,
  preparePosOrderItemsForKitchenSlip,
} from "@/lib/pos-kitchen-slip-routing"
import { mapKitchenSlipGroupItemsForPrint } from "@/lib/pos-kitchen-slip-display"
import { buildKitchenSlipDocumentHtml, resolveKitchenSlipDesign } from "@/lib/pos-kitchen-slip-html"
import { parsePosOrderMemo } from "@/lib/pos-tax-invoice"
import {
  displayPosCancelReasonKey,
  normalizePosCancelReasonKey,
} from "@/lib/pos-cancel-reason-key"
import {
  isPosOrderMergedAbsorbRow,
  isPosOrderStatsCancellation,
  parsePosOrderMergedKeepRef,
} from "@/lib/pos-order-merge"
import { translatePosMenuLineForReceipt } from "@/lib/pos-print-translate"
import {
  POS_PRINT_DOCUMENT_UNAVAILABLE_MESSAGE,
  POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS,
  printPosHtmlDocument,
  type PrintPosHtmlDocumentOptions,
} from "@/lib/pos-print-html"
import { resolveEscPosCutOverride } from "@/lib/pos-thermal-escpos-cut"
import {
  buildKitchenPrintTrackingId,
  clearKitchenPrintFailure,
  extractOrderTokenFromKitchenPrintTrackingId,
  getKitchenPrintFailure,
  markKitchenPrintFailure,
  subscribeKitchenPrintFailureChanges,
  toKitchenPrintTrackingToken,
} from "@/lib/pos-kitchen-print-tracking"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

type CookCompareKey = "unset" | "ok" | "warn" | "late"

const COOK_VERDICT_I18N: Record<CookCompareKey, string> = {
  unset: "posCookAnalysisUnset",
  ok: "posCookAnalysisOnTime",
  warn: "posCookAnalysisWarn",
  late: "posCookAnalysisLate",
}

function bangkokDisplayLocale(lang: string): string {
  const m: Record<string, string> = {
    ko: "ko-KR",
    en: "en-GB",
    th: "th-TH",
    mm: "my-MM",
    la: "lo-LA",
    kh: "km-KH",
    vi: "vi-VN",
    ms: "ms-MY",
  }
  return m[lang] || "en-GB"
}

function formatPosOrderGuestCount(o: PosOrder): string {
  if (o.orderType !== "dine_in") return "—"
  const n = Math.max(0, Math.trunc(Number(o.guestCount) || 0))
  return String(n)
}

function formatBangkokDateTime(value: string | null | undefined, locale = "en-GB") {
  if (!value) return "-"
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return "-"
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(dt)
}

function formatAuditValue(v: unknown): string {
  if (v == null || v === "") return "-"
  if (typeof v === "number") return Number.isFinite(v) ? v.toLocaleString() : "-"
  if (typeof v === "boolean") return v ? "true" : "false"
  if (typeof v === "string") return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function extractOrderCancelReasonFromMemo(memo: string): string {
  const src = String(memo || "")
  const lines = src.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim()
    const m = /^\[ORDER_(?:CANCELLED|REFUNDED)\s+[^\]]+\]\s*(.+)$/.exec(line)
    if (m?.[1]) return m[1].trim()
  }
  return ""
}

function lineCancelReasonKeys(o: PosOrder): string[] {
  const out = new Set<string>()
  for (const raw of o.items || []) {
    const it = raw as { cancelledAt?: string | null; cancelReason?: string | null }
    if (!String(it.cancelledAt || "").trim()) continue
    out.add(normalizePosCancelReasonKey(String(it.cancelReason || "")))
  }
  return Array.from(out)
}

function orderCancelReasonKey(o: PosOrder): string | null {
  if (isPosOrderMergedAbsorbRow(o)) return null
  if (o.status !== "cancelled" && o.status !== "refunded") return null
  return normalizePosCancelReasonKey(extractOrderCancelReasonFromMemo(String(o.memo || "")))
}

function buildRetryReference1(original: string): string {
  const normalized = String(original || "").trim().replace(/\s+/g, "")
  const baseRaw = normalized || `R${Date.now().toString(36).toUpperCase()}`
  const base = baseRaw.replace(/-R[A-Z0-9]{4,}$/i, "").slice(0, 12) || "RTRY"
  const suffix = `R${Date.now().toString(36).toUpperCase().slice(-6)}`
  return `${base}-${suffix}`.slice(0, 20)
}

function getTargetCookingTimeMin(
  item: { id?: string; name?: string },
  menuById: Map<string, PosMenu>,
  menuByName: Map<string, PosMenu>
): number | null {
  const rawId = String(item.id || "").trim()
  const rawName = String(item.name || "").trim()
  const menuIds = Array.from(menuById.keys()).sort((a, b) => b.length - a.length)

  const fromMenu = (m?: PosMenu) =>
    m && m.cookingTimeMin != null && Number(m.cookingTimeMin) > 0
      ? Number(m.cookingTimeMin)
      : null

  const resolveByIdPrefix = (id: string): number | null => {
    if (!id) return null
    const exact = fromMenu(menuById.get(id))
    if (exact != null) return exact
    for (const menuId of menuIds) {
      if (id.startsWith(`${menuId}-`)) {
        const v = fromMenu(menuById.get(menuId))
        if (v != null) return v
      }
    }
    return null
  }

  let target = resolveByIdPrefix(rawId)
  if (target != null) return target

  if (rawId.startsWith("cart-existing-")) {
    const stripped = rawId.replace(/^cart-existing-\d+-/, "")
    target = resolveByIdPrefix(stripped)
    if (target != null) return target
  }

  if (rawId.startsWith("promo-")) {
    const promoId = rawId.slice("promo-".length)
    target = fromMenu(menuById.get(promoId))
    if (target != null) return target
  }

  if (rawId.startsWith("banban-")) {
    const m = rawName.match(/\((.+?)\s*\/\s*(.+?)\)/)
    if (m) {
      const left = fromMenu(menuByName.get(m[1].trim())) ?? 0
      const right = fromMenu(menuByName.get(m[2].trim())) ?? 0
      const v = Math.max(left, right)
      if (v > 0) return v
    }
  }

  const mainName = rawName.replace(/\s*\(.+\)\s*$/, "").trim()
  target = fromMenu(menuByName.get(mainName))
  if (target != null) return target

  return null
}

export default function PosOrdersPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { posStores: stores } = useStoreList()
  const [orders, setOrders] = React.useState<PosOrder[]>([])
  const [loading, setLoading] = React.useState(false)
  const [startStr, setStartStr] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [endStr, setEndStr] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [storeFilter, setStoreFilter] = React.useState("All")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [channelFilter, setChannelFilter] = React.useState("all")
  const [cancelReasonFilter, setCancelReasonFilter] = React.useState("all")
  const [cancelScopeFilter, setCancelScopeFilter] = React.useState<"all" | "line" | "order">("all")
  const [expandedId, setExpandedId] = React.useState<number | null>(null)
  const [activeTab, setActiveTab] = React.useState<"orders" | "cookTime" | "linkposFailed" | "grabIntegration" | "auditTrail">("orders")
  const [attempts, setAttempts] = React.useState<PosPaymentAttempt[]>([])
  const [attemptsLoading, setAttemptsLoading] = React.useState(false)
  const [attemptStatusFilter, setAttemptStatusFilter] = React.useState<"failed" | "all" | "approved" | "declined">("failed")
  const [attemptSearchTerm, setAttemptSearchTerm] = React.useState("")
  const [retryingAttemptId, setRetryingAttemptId] = React.useState<number | null>(null)
  const [chainDialogAttemptId, setChainDialogAttemptId] = React.useState<number | null>(null)
  const [tenderRules, setTenderRules] = React.useState<PosLinkposTenderRule[]>([])
  const [rulesLoading, setRulesLoading] = React.useState(false)
  const [ruleScope, setRuleScope] = React.useState<"shared" | "store">("shared")
  const [ruleKeyword, setRuleKeyword] = React.useState("")
  const [ruleGroup, setRuleGroup] = React.useState<"card" | "qr">("card")
  const [ruleKey, setRuleKey] = React.useState("")
  const [rulePriority, setRulePriority] = React.useState("100")
  const [ruleSaving, setRuleSaving] = React.useState(false)
  const [dragRuleId, setDragRuleId] = React.useState<number | null>(null)
  const [dropRuleId, setDropRuleId] = React.useState<number | null>(null)
  const [reorderingRules, setReorderingRules] = React.useState(false)
  const [updatingId, setUpdatingId] = React.useState<number | null>(null)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [editOrder, setEditOrder] = React.useState<PosOrder | null>(null)
  const [editItems, setEditItems] = React.useState<{ id: string; name: string; price: number; qty: number }[]>([])
  const [editTableName, setEditTableName] = React.useState("")
  const [editMemo, setEditMemo] = React.useState("")
  const [editDiscountAmt, setEditDiscountAmt] = React.useState("")
  const [editDiscountReason, setEditDiscountReason] = React.useState("")
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [addMenuId, setAddMenuId] = React.useState("")
  const [deliveryAppsByStore, setDeliveryAppsByStore] = React.useState<
    Record<string, PosDeliveryApp[]>
  >({})
  const [grabIntegrations, setGrabIntegrations] = React.useState<GrabStoreIntegrationSnapshot[]>([])
  const [auditRows, setAuditRows] = React.useState<PosOrderAuditTrailRow[]>([])
  const [auditLoading, setAuditLoading] = React.useState(false)
  const [auditStartStr, setAuditStartStr] = React.useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
  )
  const [auditEndStr, setAuditEndStr] = React.useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
  )
  const [auditEmployeeFilter, setAuditEmployeeFilter] = React.useState("")
  const [auditOrderNoFilter, setAuditOrderNoFilter] = React.useState("")
  const [expandedAuditRows, setExpandedAuditRows] = React.useState<Record<number, boolean>>({})
  const [auditQuickSearchTick, setAuditQuickSearchTick] = React.useState(0)
  const auditEscArmedAtRef = React.useRef(0)
  const [, setKitchenPrintFailureVersion] = React.useState(0)
  const [traceCopyToast, setTraceCopyToast] = React.useState<{
    tone: "success" | "error"
    message: string
  } | null>(null)
  const [grabLoading, setGrabLoading] = React.useState(false)
  const [grabStatusFilter, setGrabStatusFilter] = React.useState("all")
  const [grabPartnerMerchantFilter, setGrabPartnerMerchantFilter] = React.useState("")
  const [hasSearchedOrders, setHasSearchedOrders] = React.useState(false)
  const [hasSearchedAttempts, setHasSearchedAttempts] = React.useState(false)
  const [hasSearchedGrab, setHasSearchedGrab] = React.useState(false)
  const [hasSearchedAudit, setHasSearchedAudit] = React.useState(false)
  const urlDrilldownSearchedRef = React.useRef(false)

  React.useEffect(() => {
    const qStart = String(searchParams.get("start") || "").trim()
    const qEnd = String(searchParams.get("end") || "").trim()
    const qStatus = String(searchParams.get("status") || "").trim().toLowerCase()
    const qCancelReason = String(searchParams.get("cancelReason") || "").trim()
    const qScopeRaw = String(searchParams.get("cancelScope") || "")
      .trim()
      .toLowerCase()
    const qCancelScope: "all" | "line" | "order" =
      qScopeRaw === "line" || qScopeRaw === "order" ? qScopeRaw : "all"
    const qTab = String(searchParams.get("tab") || "").trim()
    const qAuditStart = String(searchParams.get("auditStart") || "").trim()
    const qAuditEnd = String(searchParams.get("auditEnd") || "").trim()
    const qAuditEmployee = String(searchParams.get("auditEmployee") || "").trim()
    const qAuditOrderNo = String(searchParams.get("auditOrderNo") || "").trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(qStart)) setStartStr(qStart)
    if (/^\d{4}-\d{2}-\d{2}$/.test(qEnd)) setEndStr(qEnd)
    if (qStatus && ["all", "pending", "cooking", "ready", "completed", "paid", "cancelled"].includes(qStatus)) {
      setStatusFilter(qStatus)
    }
    setCancelScopeFilter(qCancelScope)
    setCancelReasonFilter(qCancelReason || "all")
    if (["orders", "cookTime", "linkposFailed", "grabIntegration", "auditTrail"].includes(qTab)) {
      setActiveTab(qTab as "orders" | "cookTime" | "linkposFailed" | "grabIntegration" | "auditTrail")
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(qAuditStart)) setAuditStartStr(qAuditStart)
    if (/^\d{4}-\d{2}-\d{2}$/.test(qAuditEnd)) setAuditEndStr(qAuditEnd)
    setAuditEmployeeFilter(qAuditEmployee)
    setAuditOrderNoFilter(qAuditOrderNo)
  }, [searchParams])

  React.useEffect(() => {
    const next = new URLSearchParams(searchParams.toString())
    const prevQs = searchParams.toString()
    if (activeTab === "orders") next.delete("tab")
    else next.set("tab", activeTab)

    if (/^\d{4}-\d{2}-\d{2}$/.test(auditStartStr)) next.set("auditStart", auditStartStr)
    else next.delete("auditStart")
    if (/^\d{4}-\d{2}-\d{2}$/.test(auditEndStr)) next.set("auditEnd", auditEndStr)
    else next.delete("auditEnd")

    if (auditEmployeeFilter.trim()) next.set("auditEmployee", auditEmployeeFilter.trim())
    else next.delete("auditEmployee")
    if (auditOrderNoFilter.trim()) next.set("auditOrderNo", auditOrderNoFilter.trim())
    else next.delete("auditOrderNo")

    const nextQs = next.toString()
    if (nextQs === prevQs) return
    router.replace(nextQs ? `${pathname}?${nextQs}` : pathname, { scroll: false })
  }, [
    activeTab,
    auditStartStr,
    auditEndStr,
    auditEmployeeFilter,
    auditOrderNoFilter,
    searchParams,
    router,
    pathname,
  ])

  const canSearchAll = isOfficeRole(auth?.role || "")
  /** 목록 API에 넘길 매장: 본사(오피스)는 선택값·「전체」는 미지정, 매니저/가맹점주 등은 로그인 매장 고정 */
  const orderListStoreCode = React.useMemo(() => {
    if (canSearchAll) {
      if (storeFilter && storeFilter !== "All") return storeFilter.trim()
      return undefined
    }
    const s = (auth?.store || "").trim()
    return s || undefined
  }, [canSearchAll, auth?.store, storeFilter])

  const currentStoreCode = canSearchAll
    ? (storeFilter && storeFilter !== "All" ? storeFilter : "")
    : (auth?.store || "")

  const orderTypeLabels = React.useMemo(
    () => ({
      dine_in: t("posOrderTypeDineIn"),
      takeout: t("posOrderTypeTakeout"),
      delivery: t("posOrderTypeDelivery"),
    }),
    [t]
  )

  const statusLabels = React.useMemo(
    () => ({
      pending: t("posAdminStatusPending"),
      paid: t("posAdminStatusPaid"),
      cooking: t("posOrderStatusPreparing"),
      ready: t("posOrderStatusReady"),
      completed: t("posOrderStatusCompleted"),
      cancelled: t("posCancel"),
    }),
    [t]
  )

  const attemptStatusLabels = React.useMemo(
    () => ({
      failed: t("posStatusFailed") || "실패",
      declined: t("posStatusDeclined") || "거절",
      approved: t("posStatusApproved") || "승인",
      all: t("posStatusAll") || "전체",
    }),
    [t]
  )

  const formatListOrderType = React.useCallback(
    (o: PosOrder) => {
      const base = orderTypeLabels[o.orderType as keyof typeof orderTypeLabels] || o.orderType
      const channelSuffix =
        o.orderType === "delivery" || o.orderType === "takeout"
          ? formatPosOrderTypeChannelSuffix(o)
          : ""
      if (o.orderType !== "delivery") return `${base}${channelSuffix}`
      const s = String(o.storeCode || "").trim()
      const apps =
        (s && deliveryAppsByStore[s]?.length ? deliveryAppsByStore[s] : null) ||
        deliveryAppsByStore.__default__ ||
        []
      const platform = getPosDeliveryPlatformName(o, apps)
      const mid = platform ? `${base} · ${platform}` : base
      return `${mid}${channelSuffix}`
    },
    [deliveryAppsByStore, orderTypeLabels]
  )

  const cancelReasonOptions = React.useMemo(() => {
    const bucket = new Set<string>()
    const notSetLabel = t("posCancelReasonNotSet") || "사유 미입력"
    for (const o of orders) {
      if (cancelScopeFilter === "all" || cancelScopeFilter === "line") {
        lineCancelReasonKeys(o).forEach((r) => bucket.add(r))
      }
      if (cancelScopeFilter === "all" || cancelScopeFilter === "order") {
        const k = orderCancelReasonKey(o)
        if (k) bucket.add(k)
      }
    }
    return Array.from(bucket).sort((a, b) =>
      displayPosCancelReasonKey(a, notSetLabel).localeCompare(displayPosCancelReasonKey(b, notSetLabel))
    )
  }, [orders, cancelScopeFilter, t])

  const filteredOrders = React.useMemo(() => {
    const byChannel =
      channelFilter === "all"
        ? orders
        : orders.filter((o) => {
            const channel = String(o.deliveryPaymentChannel || o.orderType || "").trim().toLowerCase()
            if (channelFilter === "delivery") return channel === "delivery" || o.orderType === "delivery"
            return channel === channelFilter
          })
    const byCancelReason =
      cancelReasonFilter === "all"
        ? byChannel
        : byChannel.filter((o) => {
            const lineHit = lineCancelReasonKeys(o).includes(cancelReasonFilter)
            const orderHit = orderCancelReasonKey(o) === cancelReasonFilter
            if (cancelScopeFilter === "line") return lineHit
            if (cancelScopeFilter === "order") return orderHit
            return lineHit || orderHit
          })
    if (!searchTerm.trim()) return byCancelReason
    const term = searchTerm.trim().toLowerCase()
    return byCancelReason.filter(
      (o) =>
        o.orderNo.toLowerCase().includes(term) ||
        (o.tableName && o.tableName.toLowerCase().includes(term)) ||
        (o.memo && o.memo.toLowerCase().includes(term)) ||
        o.items.some(
          (it: { name?: string }) =>
            it.name && String(it.name).toLowerCase().includes(term)
        )
    )
  }, [orders, searchTerm, channelFilter, cancelReasonFilter, cancelScopeFilter, t])

  const filteredAttempts = React.useMemo(() => {
    if (!attemptSearchTerm.trim()) return attempts
    const term = attemptSearchTerm.trim().toLowerCase()
    return attempts.filter((a) =>
      [
        a.orderNo,
        a.localTxId,
        a.approvalCode,
        a.traceNo,
        a.retryOfLocalTxId,
        a.responseCode,
        a.errorReason,
        a.responseText,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    )
  }, [attempts, attemptSearchTerm])

  const retryStatsByAttemptId = React.useMemo(() => {
    const byId = new Map<number, PosPaymentAttempt>()
    const children = new Map<number, number[]>()
    for (const a of attempts) {
      byId.set(a.id, a)
    }
    for (const a of attempts) {
      const parentId = Number(a.retryOfAttemptId || 0)
      if (parentId > 0 && byId.has(parentId)) {
        const arr = children.get(parentId) || []
        arr.push(a.id)
        children.set(parentId, arr)
      }
    }
    const memo = new Map<number, number>()
    const visiting = new Set<number>()
    const countDescendants = (id: number): number => {
      if (memo.has(id)) return memo.get(id) || 0
      if (visiting.has(id)) return 0
      visiting.add(id)
      const direct = children.get(id) || []
      let total = direct.length
      for (const childId of direct) total += countDescendants(childId)
      visiting.delete(id)
      memo.set(id, total)
      return total
    }
    const result = new Map<number, { direct: number; total: number }>()
    for (const a of attempts) {
      const direct = (children.get(a.id) || []).length
      const total = countDescendants(a.id)
      result.set(a.id, { direct, total })
    }
    return result
  }, [attempts])

  const chainRows = React.useMemo(() => {
    if (!chainDialogAttemptId) return [] as Array<PosPaymentAttempt & { depth: number }>
    const byId = new Map<number, PosPaymentAttempt>()
    const children = new Map<number, PosPaymentAttempt[]>()
    for (const a of attempts) byId.set(a.id, a)
    for (const a of attempts) {
      const parentId = Number(a.retryOfAttemptId || 0)
      if (parentId > 0 && byId.has(parentId)) {
        const arr = children.get(parentId) || []
        arr.push(a)
        children.set(parentId, arr)
      }
    }
    // 현재 선택 건에서 루트(원시도)까지 역추적
    let rootId = chainDialogAttemptId
    const seen = new Set<number>()
    while (true) {
      if (seen.has(rootId)) break
      seen.add(rootId)
      const cur = byId.get(rootId)
      const parentId = Number(cur?.retryOfAttemptId || 0)
      if (!(parentId > 0 && byId.has(parentId))) break
      rootId = parentId
    }
    const root = byId.get(rootId)
    if (!root) return [] as Array<PosPaymentAttempt & { depth: number }>
    const rows: Array<PosPaymentAttempt & { depth: number }> = []
    const walk = (node: PosPaymentAttempt, depth: number) => {
      rows.push({ ...node, depth })
      const next = [...(children.get(node.id) || [])].sort((a, b) => {
        const ta = new Date(a.createdAt || "").getTime()
        const tb = new Date(b.createdAt || "").getTime()
        return ta - tb
      })
      for (const child of next) {
        walk(child, depth + 1)
      }
    }
    walk(root, 0)
    return rows
  }, [attempts, chainDialogAttemptId])

  const copyOrderNo = (orderNo: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(orderNo).then(
      () => {
        void appAlert(t("posOrderNoCopied"))
      },
      () => {}
    )
  }

  const EDITABLE_STATUSES = ["pending", "paid"]

  const handleOpenEdit = (o: PosOrder) => {
    if (!EDITABLE_STATUSES.includes(o.status)) return
    setEditOrder(o)
    setEditItems(
      (o.items || []).map((it: { id?: string; name?: string; price?: number; qty?: number }) => ({
        id: String(it.id ?? ""),
        name: String(it.name ?? ""),
        price: Number(it.price ?? 0),
        qty: Number(it.qty ?? 1),
      }))
    )
    setEditTableName(o.tableName ?? "")
    setEditMemo(o.memo ?? "")
    setEditDiscountAmt(String(o.discountAmt ?? 0))
    setEditDiscountReason(o.discountReason ?? "")
    setAddMenuId("")
    getPosMenus({ fresh: true }).then(setMenus).catch(() => setMenus([]))
  }

  const handleSaveEdit = async () => {
    if (!editOrder) return
    if (editItems.length === 0) {
      await appAlert(t("posEditItemsRequired"))
      return
    }
    setUpdatingId(editOrder.id)
    try {
      const res = await updatePosOrder({
        id: editOrder.id,
        items: editItems,
        tableName: editOrder.orderType === "dine_in" ? editTableName : "",
        memo: editMemo || undefined,
        discountAmt: Number(editDiscountAmt) || 0,
        discountReason: editDiscountReason || undefined,
      })
      if (res.success) {
        setOrders((prev) =>
          prev.map((order) => {
            if (order.id !== editOrder.id) return order
            const subtotal = editItems.reduce((s, it) => s + it.price * it.qty, 0)
            const discount = Number(editDiscountAmt) || 0
            const total = Math.max(0, subtotal - discount)
            return {
              ...order,
              items: editItems,
              tableName: editTableName,
              memo: editMemo,
              discountAmt: discount,
              discountReason: editDiscountReason,
              subtotal,
              total,
            }
          })
        )
        setEditOrder(null)
      } else {
        await appAlert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      await appAlert(i18nTr(t, "posUnexpectedErrorDetail", { detail: String(e) }))
    } finally {
      setUpdatingId(null)
    }
  }

  const handleEditItemQty = (idx: number, delta: number) => {
    setEditItems((prev) => {
      const n = [...prev]
      const q = (n[idx].qty || 1) + delta
      if (q <= 0) return prev.filter((_, i) => i !== idx)
      n[idx] = { ...n[idx], qty: q }
      return n
    })
  }

  const handleRemoveEditItem = (idx: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleAddEditItem = () => {
    const m = menus.find((x) => x.id === addMenuId)
    if (!m) return
    setEditItems((prev) => [...prev, { id: m.id, name: m.name, price: m.price, qty: 1 }])
    setAddMenuId("")
  }

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    let memoAppend: string | undefined
    if (newStatus === "cancelled") {
      if (!(await appConfirm(t("posCancelConfirm")))) return
      const reasonRaw = await appPrompt(t("posCancelReasonPrompt"))
      const reason = String(reasonRaw ?? "").trim()
      if (reason.length < 2) {
        await appAlert(t("posReceiptPayCorrectReasonShort"))
        return
      }
      memoAppend = reason
    }
    setUpdatingId(orderId)
    try {
      const res = await updatePosOrderStatus({
        id: orderId,
        status: newStatus,
        ...(memoAppend ? { memoAppend } : {}),
      })
      if (res.success) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
        )
      } else {
        await appAlert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      await appAlert(i18nTr(t, "posUnexpectedErrorDetail", { detail: String(e) }))
    } finally {
      setUpdatingId(null)
    }
  }

  const printHtmlWithPosEngine = React.useCallback(
    (
      fullHtml: string,
      title: string,
      thermal?: Pick<
        PrintPosHtmlDocumentOptions,
        | "printRole"
        | "printReceiptKind"
        | "kitchenStation"
        | "escPosCutOverride"
        | "onShellPrintResult"
      >
    ) => printPosHtmlDocument(fullHtml, {
      title,
      printDelayMs: 0,
      fallbackCleanupMs: 120_000,
      ...thermal,
    }),
    [t]
  )

  React.useEffect(() => {
    return subscribeKitchenPrintFailureChanges(() => {
      setKitchenPrintFailureVersion((v) => v + 1)
    })
  }, [])

  const resolveKitchenPrintOrderRef = React.useCallback((o: Pick<PosOrder, "id" | "orderNo">) => {
    const orderNo = String(o.orderNo ?? "").trim()
    if (orderNo) return orderNo
    const orderId = Number(o.id ?? 0)
    return orderId > 0 ? `id:${orderId}` : "UNKNOWN"
  }, [])

  const jumpToOrderByTraceId = React.useCallback(
    (traceId: string) => {
      const token = extractOrderTokenFromKitchenPrintTrackingId(traceId)
      if (!token) return
      const found = orders.find((o) => {
        const orderRef = resolveKitchenPrintOrderRef(o)
        return toKitchenPrintTrackingToken(orderRef) === token
      })
      if (!found) return
      setSearchTerm(String(found.orderNo || ""))
      setExpandedId(found.id)
      if (typeof document !== "undefined") {
        window.setTimeout(() => {
          const el = document.getElementById(`admin-pos-order-row-${found.id}`)
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
        }, 120)
      }
    },
    [orders, resolveKitchenPrintOrderRef]
  )

  const jumpToOrderByOrderNo = React.useCallback(
    (orderNo: string, orderId?: number) => {
      const targetNo = String(orderNo || "").trim()
      const targetId = Number(orderId || 0)
      const found = orders.find((o) => {
        if (targetId > 0 && o.id === targetId) return true
        return targetNo ? String(o.orderNo || "").trim() === targetNo : false
      })
      if (!found) return
      setActiveTab("orders")
      setSearchTerm(String(found.orderNo || ""))
      setExpandedId(found.id)
      if (typeof document !== "undefined") {
        window.setTimeout(() => {
          const el = document.getElementById(`admin-pos-order-row-${found.id}`)
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
        }, 120)
      }
    },
    [orders]
  )

  const formatTraceIdTail = React.useCallback((traceId: string) => {
    const raw = String(traceId || "").trim()
    if (!raw) return "-"
    return raw.length <= 8 ? raw : `...${raw.slice(-8)}`
  }, [])

  const copyTraceId = React.useCallback(
    (traceId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      const raw = String(traceId || "").trim()
      if (!raw) return
      navigator.clipboard.writeText(raw).then(
        () => {
          setTraceCopyToast({
            tone: "success",
            message: t("adminPosOrdersTraceIdCopied") || "Trace ID를 복사했습니다.",
          })
          window.setTimeout(() => setTraceCopyToast(null), 1400)
        },
        () => {
          setTraceCopyToast({
            tone: "error",
            message: t("adminPosOrdersTraceIdCopyFailed") || "Trace ID 복사에 실패했습니다.",
          })
          window.setTimeout(() => setTraceCopyToast(null), 1600)
        },
      )
    },
    [t]
  )

  const handlePrintKitchenSlip = async (o: PosOrder) => {
    const storeCode = (o.storeCode ?? "").trim()
    if (!storeCode || !o.items?.length) {
      await appAlert(t("posPrintUnavailable"))
      return
    }
    let lastTrackingId = ""
    try {
      const settings = await getPosPrinterSettings({ storeCode })
      const ki = kitchenSlipPrintI18n(settings, lang)
      const items = preparePosOrderItemsForKitchenSlip(
        (o.items || []) as Parameters<typeof preparePosOrderItemsForKitchenSlip>[0],
        { menus }
      )
      const slips = buildKitchenSlipGroups(items, buildKitchenSlipGroupOpts(settings, menus, ki.kLabels))
      if (!slips.length) {
        await appAlert(t("posKitchenNoItemsToPrint"))
        return
      }
      const slipDesign = resolveKitchenSlipDesign(settings)
      const kitchenMemo = parsePosOrderMemo(o.memo).plainMemo
      const memoLine = kitchenMemo.trim()
        ? `${ki.t("posCustomerMemo") || "메모"}: ${kitchenMemo.trim()}`
        : ""
      const dateStr = o.createdAt ? formatPosDateTimeMedium(new Date(o.createdAt), ki.lang) : "—"
      let shellIssueDetected = false
      const formatKitchenOrderType = () => {
        const base = ki.orderTypeLabels[String(o.orderType || "").toLowerCase()] || String(o.orderType || "")
        const channelSuffix =
          o.orderType === "delivery" || o.orderType === "takeout" ? formatPosOrderTypeChannelSuffix(o) : ""
        if (o.orderType !== "delivery") return `${base}${channelSuffix}`
        const s = String(o.storeCode || "").trim()
        const apps =
          (s && deliveryAppsByStore[s]?.length ? deliveryAppsByStore[s] : null) ||
          deliveryAppsByStore.__default__ ||
          []
        const platform = getPosDeliveryPlatformName(o, apps)
        const mid = platform ? `${base} · ${platform}` : base
        return `${mid}${channelSuffix}`
      }
      const printOne = async (idx: number): Promise<void> => {
        if (idx >= slips.length) return
        const slip = slips[idx]
          const printTrackingId = buildKitchenPrintTrackingId({
            orderRef: resolveKitchenPrintOrderRef(o),
            station: slip.station,
            label: slip.label,
          })
          lastTrackingId = printTrackingId
        const tablePart =
          o.tableName && o.orderType !== "delivery"
            ? ` · ${ki.t("posTable") || "테이블"}: ${o.tableName}`
            : ""
        const html = buildKitchenSlipDocumentHtml({
          label: slip.label,
          orderNo: String(o.orderNo ?? ""),
          storeCode,
          orderTypeLabel: formatKitchenOrderType(),
          tablePart,
          dateStr,
            printTrackingId,
          items: mapKitchenSlipGroupItemsForPrint(slip.items, {
            orderItems: items,
            translateName: (name) => translatePosMenuLineForReceipt(name, ki.t),
          }),
          memoLine: memoLine || null,
          escapeHtml,
          design: slipDesign,
          printColorAdjust: "economy",
        })
        await printHtmlWithPosEngine(html, slip.label, {
          printRole: "kitchen",
          kitchenStation: slip.station,
          escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: "kitchen" }),
          onShellPrintResult: (r) => {
            if (r?.ok === false || r?.cutOk === false) shellIssueDetected = true
          },
        })
        if (idx + 1 < slips.length) {
          await new Promise((resolve) => setTimeout(resolve, POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS))
          await printOne(idx + 1)
        }
      }
      await printOne(0)
      if (shellIssueDetected) {
        markKitchenPrintFailure({
          orderRef: resolveKitchenPrintOrderRef(o),
          reason: "shell_print_or_cut_failed",
          ...(lastTrackingId ? { trackingId: lastTrackingId } : {}),
        })
      } else {
        clearKitchenPrintFailure(resolveKitchenPrintOrderRef(o))
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      markKitchenPrintFailure({
        orderRef: resolveKitchenPrintOrderRef(o),
        reason: msg || "print_failed",
        ...(lastTrackingId ? { trackingId: lastTrackingId } : {}),
      })
      if (msg === POS_PRINT_DOCUMENT_UNAVAILABLE_MESSAGE) {
        await appAlert(t("posPrintBlockedBrowser"))
        return
      }
      await appAlert(i18nTr(t, "posUnexpectedErrorDetail", { detail: msg }))
    }
  }

  const loadOrders = React.useCallback(() => {
    setLoading(true)
    getPosOrders({
      startStr,
      endStr,
      storeCode: orderListStoreCode,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    })
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }, [startStr, endStr, orderListStoreCode, statusFilter])

  const loadAttempts = React.useCallback(() => {
    setAttemptsLoading(true)
    getPosPaymentAttempts({
      startStr,
      endStr,
      storeCode: orderListStoreCode,
      status: attemptStatusFilter,
      limit: 2000,
    })
      .then(setAttempts)
      .catch(() => setAttempts([]))
      .finally(() => setAttemptsLoading(false))
  }, [startStr, endStr, orderListStoreCode, attemptStatusFilter])

  const loadTenderRules = React.useCallback(() => {
    setRulesLoading(true)
    getPosLinkposTenderRules({
      storeCode: currentStoreCode || undefined,
      includeShared: true,
    })
      .then(setTenderRules)
      .catch(() => setTenderRules([]))
      .finally(() => setRulesLoading(false))
  }, [currentStoreCode])

  const loadGrabIntegrations = React.useCallback(() => {
    setGrabLoading(true)
    getGrabStoreIntegrations({
      status: grabStatusFilter !== "all" ? grabStatusFilter : undefined,
      partnerMerchantID: grabPartnerMerchantFilter.trim() || undefined,
      limit: 500,
    })
      .then((rows) => setGrabIntegrations(Array.isArray(rows) ? rows : []))
      .catch(() => setGrabIntegrations([]))
      .finally(() => setGrabLoading(false))
  }, [grabStatusFilter, grabPartnerMerchantFilter])

  const loadAuditTrail = React.useCallback(() => {
    setAuditLoading(true)
    getPosOrderAuditTrail({
      startStr: auditStartStr,
      endStr: auditEndStr,
      employee: auditEmployeeFilter.trim() || undefined,
      orderNo: auditOrderNoFilter.trim() || undefined,
      store: orderListStoreCode || undefined,
      limit: 1200,
    })
      .then((rows) => setAuditRows(Array.isArray(rows) ? rows : []))
      .catch(() => setAuditRows([]))
      .finally(() => setAuditLoading(false))
  }, [auditStartStr, auditEndStr, auditEmployeeFilter, auditOrderNoFilter, orderListStoreCode])

  const handleSearchClick = React.useCallback(() => {
    if (activeTab === "linkposFailed") {
      setHasSearchedAttempts(true)
      loadAttempts()
      loadTenderRules()
      return
    }
    if (activeTab === "grabIntegration") {
      setHasSearchedGrab(true)
      loadGrabIntegrations()
      return
    }
    if (activeTab === "auditTrail") {
      setHasSearchedAudit(true)
      loadAuditTrail()
      return
    }
    setHasSearchedOrders(true)
    loadOrders()
  }, [
    activeTab,
    loadAttempts,
    loadAuditTrail,
    loadGrabIntegrations,
    loadOrders,
    loadTenderRules,
  ])

  const handleAuditFilterKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, clearField: () => void) => {
      const now = Date.now()
      if (e.key === "Enter") {
        e.preventDefault()
        setHasSearchedAudit(true)
        loadAuditTrail()
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        const currentValue = String(e.currentTarget?.value ?? "").trim()
        if (!currentValue && now - auditEscArmedAtRef.current <= 700) {
          const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
          setAuditStartStr(today)
          setAuditEndStr(today)
          setAuditEmployeeFilter("")
          setAuditOrderNoFilter("")
          setAuditQuickSearchTick((v) => v + 1)
          auditEscArmedAtRef.current = 0
          return
        }
        clearField()
        setAuditQuickSearchTick((v) => v + 1)
        auditEscArmedAtRef.current = now
      }
    },
    [loadAuditTrail]
  )

  const applyAuditQuickFilter = React.useCallback(
    (params: { employee?: string; orderNo?: string }) => {
      if (params.employee != null) setAuditEmployeeFilter(params.employee)
      if (params.orderNo != null) setAuditOrderNoFilter(params.orderNo)
      setActiveTab("auditTrail")
      setAuditQuickSearchTick((v) => v + 1)
    },
    []
  )

  const toggleAuditExpanded = React.useCallback((rowId: number) => {
    setExpandedAuditRows((prev) => ({
      ...prev,
      [rowId]: !prev[rowId],
    }))
  }, [])

  const handleSaveTenderRule = React.useCallback(async () => {
    const keyword = ruleKeyword.trim().toLowerCase().replace(/\s+/g, "")
    const tenderKey = ruleKey.trim()
    if (!keyword) {
      await appAlert(t("posLinkposMatchKeywordRequired"))
      return
    }
    if (!tenderKey) {
      await appAlert(t("posLinkposTenderKeyRequired"))
      return
    }
    const targetStoreCode =
      ruleScope === "shared"
        ? "__shared__"
        : (currentStoreCode || "").trim()
    if (ruleScope === "store" && !targetStoreCode) {
      await appAlert(t("posLinkposRuleStoreRequiredFirst"))
      return
    }
    setRuleSaving(true)
    try {
      const res = await savePosLinkposTenderRule({
        storeCode: targetStoreCode,
        matchKeyword: keyword,
        tenderGroup: ruleGroup,
        tenderKey,
        priority: Number(rulePriority) || 100,
        isActive: true,
      })
      if (!res.success) {
        await appAlert(res.message || t("posLinkposRuleSaveFailed"))
        return
      }
      setRuleKeyword("")
      setRuleKey("")
      setRulePriority("100")
      loadTenderRules()
    } catch (e) {
      await appAlert(i18nTr(t, "posUnexpectedErrorDetail", { detail: String(e) }))
    } finally {
      setRuleSaving(false)
    }
  }, [ruleKeyword, ruleKey, ruleScope, currentStoreCode, ruleGroup, rulePriority, loadTenderRules, t])

  const handleToggleTenderRule = React.useCallback(async (rule: PosLinkposTenderRule) => {
    try {
      const res = await savePosLinkposTenderRule({
        id: rule.id,
        storeCode: rule.storeCode,
        matchKeyword: rule.matchKeyword,
        tenderGroup: rule.tenderGroup,
        tenderKey: rule.tenderKey,
        priority: rule.priority,
        isActive: !rule.isActive,
      })
      if (!res.success) {
        await appAlert(res.message || t("posLinkposRuleStatusFailed"))
        return
      }
      loadTenderRules()
    } catch (e) {
      await appAlert(i18nTr(t, "posUnexpectedErrorDetail", { detail: String(e) }))
    }
  }, [loadTenderRules, t])

  const handleDeleteTenderRule = React.useCallback(async (rule: PosLinkposTenderRule) => {
    const ok = await appConfirm(
      i18nTr(t, "posLinkposRuleDeleteConfirm", {
        storeCode: rule.storeCode,
        matchKeyword: rule.matchKeyword,
        tenderKey: rule.tenderKey,
      })
    )
    if (!ok) return
    try {
      const res = await deletePosLinkposTenderRule({ id: rule.id })
      if (!res.success) {
        await appAlert(res.message || t("posLinkposRuleDeleteFailed"))
        return
      }
      loadTenderRules()
    } catch (e) {
      await appAlert(i18nTr(t, "posUnexpectedErrorDetail", { detail: String(e) }))
    }
  }, [loadTenderRules, t])

  const handleRuleDrop = React.useCallback(async (target: PosLinkposTenderRule) => {
    const sourceId = dragRuleId
    if (!sourceId || sourceId === target.id) {
      setDragRuleId(null)
      setDropRuleId(null)
      return
    }
    const source = tenderRules.find((r) => r.id === sourceId)
    if (!source) {
      setDragRuleId(null)
      setDropRuleId(null)
      return
    }
    if (source.storeCode !== target.storeCode) {
      await appAlert(t("posLinkposDragSameScopeOnly"))
      setDragRuleId(null)
      setDropRuleId(null)
      return
    }
    const scoped = tenderRules
      .filter((r) => r.storeCode === source.storeCode)
      .sort((a, b) => a.priority - b.priority || a.id - b.id)
    const from = scoped.findIndex((r) => r.id === source.id)
    const to = scoped.findIndex((r) => r.id === target.id)
    if (from < 0 || to < 0 || from === to) {
      setDragRuleId(null)
      setDropRuleId(null)
      return
    }
    const reordered = [...scoped]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    const changed = reordered.map((r, idx) => ({ ...r, priority: (idx + 1) * 10 }))

    setTenderRules((prev) => {
      const map = new Map(changed.map((r) => [r.id, r.priority]))
      return prev.map((r) => (map.has(r.id) ? { ...r, priority: Number(map.get(r.id)) } : r))
    })
    setReorderingRules(true)
    try {
      for (const r of changed) {
        const res = await savePosLinkposTenderRule({
          id: r.id,
          storeCode: r.storeCode,
          matchKeyword: r.matchKeyword,
          tenderGroup: r.tenderGroup,
          tenderKey: r.tenderKey,
          priority: r.priority,
          isActive: r.isActive,
        })
        if (!res.success) throw new Error(res.message || "priority_update_failed")
      }
    } catch (e) {
      await appAlert(i18nTr(t, "posUnexpectedErrorDetail", { detail: String(e) }))
      loadTenderRules()
    } finally {
      setReorderingRules(false)
      setDragRuleId(null)
      setDropRuleId(null)
    }
  }, [dragRuleId, tenderRules, loadTenderRules, t])

  const handleRetryAttempt = React.useCallback(
    async (attempt: PosPaymentAttempt) => {
      const amount = Number(attempt.requestAmount || 0)
      if (amount <= 0) {
        await appAlert(t("posLinkposRetryAmountZero"))
        return
      }
      const newReference1 = buildRetryReference1(attempt.localTxId)
      if (!newReference1 || newReference1 === String(attempt.localTxId || "").trim()) {
        await appAlert(t("posLinkposRetryR1Failed"))
        return
      }
      const ok = await appConfirm(
        i18nTr(t, "posLinkposRetryConfirmBody", {
          existingR1: String(attempt.localTxId || "-"),
          newR1: newReference1,
        })
      )
      if (!ok) return

      setRetryingAttemptId(attempt.id)
      try {
        const res = await executeLinkposPaymentServer({
          amount,
          bankId: String(attempt.bankId || ""),
          reference1: newReference1,
          reference2: String(attempt.orderNo || ""),
          storeCode: String(attempt.storeCode || ""),
          orderId: attempt.orderId ?? undefined,
          retryOfAttemptId: attempt.id,
          retryOfLocalTxId: String(attempt.localTxId || ""),
          timeoutMs: 15000,
        })
        if (res.success) {
          await appAlert(
            i18nTr(t, "posLinkposRetryApprovedBody", {
              r1: newReference1,
              responseCode: String(res.payment?.responseCode || "00"),
              approvalCode: String(res.payment?.approvalCode || "-"),
            })
          )
        } else {
          await appAlert(
            i18nTr(t, "posLinkposRetryFailedWithReason", {
              message: String(res.message || "unknown_error"),
            })
          )
        }
        loadAttempts()
        if (attempt.orderId) {
          setHasSearchedOrders(true)
          loadOrders()
        }
      } catch (e) {
        await appAlert(i18nTr(t, "posUnexpectedErrorDetail", { detail: String(e) }))
      } finally {
        setRetryingAttemptId(null)
      }
    },
    [loadAttempts, loadOrders, t]
  )

  React.useEffect(() => {
    if (urlDrilldownSearchedRef.current) return
    const qCancelReason = String(searchParams.get("cancelReason") || "").trim()
    const qStart = String(searchParams.get("start") || "").trim()
    const qEnd = String(searchParams.get("end") || "").trim()
    const qStatus = String(searchParams.get("status") || "").trim().toLowerCase()
    if (!qCancelReason || !/^\d{4}-\d{2}-\d{2}$/.test(qStart) || !/^\d{4}-\d{2}-\d{2}$/.test(qEnd)) return
    urlDrilldownSearchedRef.current = true
    setHasSearchedOrders(true)
    setLoading(true)
    getPosOrders({
      startStr: qStart,
      endStr: qEnd,
      storeCode: orderListStoreCode,
      status: qStatus && qStatus !== "all" ? qStatus : undefined,
    })
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }, [searchParams, orderListStoreCode])

  React.useEffect(() => {
    if (activeTab !== "auditTrail") return
    if (auditQuickSearchTick <= 0) return
    setHasSearchedAudit(true)
    const timer = window.setTimeout(() => {
      loadAuditTrail()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [activeTab, auditQuickSearchTick, loadAuditTrail])

  React.useEffect(() => {
    getPosMenus({ fresh: true }).then(setMenus).catch(() => setMenus([]))
  }, [])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const globalApps = await getPosDeliveryApps({ includeDisabled: true })
        if (cancelled) return
        const stores = [
          ...new Set(
            orders
              .map((o) => String(o.storeCode || "").trim())
              .filter(Boolean)
          ),
        ]
        const storeLists = await Promise.all(
          stores.map((s) =>
            getPosDeliveryApps({ storeCode: s, includeDisabled: true })
          )
        )
        if (cancelled) return
        const next: Record<string, PosDeliveryApp[]> = {
          __default__: globalApps,
        }
        stores.forEach((s, i) => {
          next[s] = storeLists[i]
        })
        setDeliveryAppsByStore(next)
      } catch {
        if (!cancelled) setDeliveryAppsByStore({ __default__: [] })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orders])

  const todayStr = new Date().toISOString().slice(0, 10)
  const isToday = startStr === todayStr && endStr === todayStr && statusFilter === "all"
  const todaySummary = React.useMemo(() => {
    if (!isToday || orders.length === 0) return null
    const completed = orders.filter((o) =>
      ['completed', 'paid', 'ready'].includes(o.status)
    )
    const pending = orders.filter((o) =>
      ['pending', 'cooking'].includes(o.status)
    )
    const cancelled = orders.filter((o) => isPosOrderStatsCancellation(o))
    return {
      completedCount: completed.length,
      completedTotal: completed.reduce((s, o) => s + (o.total ?? 0), 0),
      pendingCount: pending.length,
      cancelledCount: cancelled.length,
      cancelledTotal: cancelled.reduce((s, o) => s + (o.total ?? 0), 0),
    }
  }, [isToday, orders, statusFilter])

  const cancelledLineReasonSummary = React.useMemo(() => {
    const bucket = new Map<string, { count: number; amount: number }>()
    for (const o of filteredOrders) {
      for (const raw of o.items || []) {
        const it = raw as {
          cancelledAt?: string | null
          cancelReason?: string | null
          price?: number
          qty?: number
        }
        if (!String(it.cancelledAt || "").trim()) continue
        const reason = normalizePosCancelReasonKey(String(it.cancelReason || ""))
        const prev = bucket.get(reason) || { count: 0, amount: 0 }
        prev.count += 1
        prev.amount += (Number(it.price ?? 0) || 0) * (Number(it.qty ?? 1) || 1)
        bucket.set(reason, prev)
      }
    }
    return Array.from(bucket.entries())
      .map(([reason, v]) => ({ reason, count: v.count, amount: v.amount }))
      .sort((a, b) => b.count - a.count || b.amount - a.amount)
  }, [filteredOrders])

  const cancelledOrderReasonSummary = React.useMemo(() => {
    const bucket = new Map<string, { count: number; amount: number }>()
    for (const o of filteredOrders) {
      if (!isPosOrderStatsCancellation(o)) continue
      const reason = normalizePosCancelReasonKey(extractOrderCancelReasonFromMemo(String(o.memo || "")))
      const prev = bucket.get(reason) || { count: 0, amount: 0 }
      prev.count += 1
      prev.amount += Number(o.total ?? 0) || 0
      bucket.set(reason, prev)
    }
    return Array.from(bucket.entries())
      .map(([reason, v]) => ({ reason, count: v.count, amount: v.amount }))
      .sort((a, b) => b.count - a.count || b.amount - a.amount)
  }, [filteredOrders])

  const cookingRows = React.useMemo(() => {
    const menuById = new Map(menus.map((m) => [String(m.id), m]))
    const menuByName = new Map(menus.map((m) => [String(m.name).trim(), m]))
    const rows: Array<{
      orderId: number
      orderNo: string
      storeCode: string
      tableName: string
      orderCreatedAt: string
      itemId: string
      itemName: string
      qty: number
      servedAt: string
      elapsedMin: number
      targetMin: number | null
      diffMin: number | null
      compareKey: CookCompareKey
    }> = []

    for (const o of filteredOrders) {
      const orderTs = new Date(o.createdAt || "")
      if (Number.isNaN(orderTs.getTime())) continue
      for (const it of o.items || []) {
        const servedAt = String((it as { servedAt?: string | null })?.servedAt || "").trim()
        if (!servedAt) continue
        const servedTs = new Date(servedAt)
        if (Number.isNaN(servedTs.getTime())) continue
        const elapsedMin = Math.max(0, Math.round((servedTs.getTime() - orderTs.getTime()) / 60000))
        const itemId = String((it as { id?: string })?.id || "")
        const itemName = String((it as { name?: string })?.name || "-")
        const targetMin = getTargetCookingTimeMin(
          { id: itemId, name: itemName },
          menuById,
          menuByName
        )
        const diffMin = targetMin != null ? elapsedMin - targetMin : null
        const compareKey: CookCompareKey =
          targetMin == null
            ? "unset"
            : (elapsedMin - targetMin) <= 0
              ? "ok"
              : (elapsedMin - targetMin) <= 5
                ? "warn"
                : "late"
        rows.push({
          orderId: o.id,
          orderNo: o.orderNo,
          storeCode: o.storeCode,
          tableName: o.tableName || "-",
          orderCreatedAt: o.createdAt,
          itemId,
          itemName,
          qty: Number((it as { qty?: number })?.qty ?? 1) || 1,
          servedAt,
          elapsedMin,
          targetMin,
          diffMin,
          compareKey,
        })
      }
    }

    rows.sort((a, b) => b.servedAt.localeCompare(a.servedAt))
    return rows
  }, [filteredOrders, menus])

  const cookSummary = React.useMemo(() => {
    if (cookingRows.length === 0) return { avgMin: 0, maxMin: 0, minMin: 0 }
    const mins = cookingRows.map((r) => r.elapsedMin)
    const sum = mins.reduce((s, n) => s + n, 0)
    return {
      avgMin: Math.round(sum / mins.length),
      maxMin: Math.max(...mins),
      minMin: Math.min(...mins),
    }
  }, [cookingRows])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Receipt className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("posOrderList") || "POS 주문 내역"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("posOrderListSub") || "매장 POS 주문을 조회합니다."}
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              className="h-9 w-40 text-sm"
            />
            <span className="text-muted-foreground">~</span>
            <Input
              type="date"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              className="h-9 w-40 text-sm"
            />
            <Button
              variant={isToday ? "secondary" : "outline"}
              size="sm"
              className="h-9 px-3 text-xs"
              onClick={() => {
                const d = new Date().toISOString().slice(0, 10)
                setStartStr(d)
                setEndStr(d)
              }}
            >
              {t("posToday") || "오늘"}
            </Button>
          </div>
          {canSearchAll && (
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="h-9 w-[min(12rem,42vw)] min-w-[7rem] text-sm">
                <SelectValue placeholder={t("store") || "매장"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("posStatusAll") || "전체"}</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!canSearchAll && (auth?.store || "").trim() ? (
            <span className="inline-flex max-w-[min(20rem,55vw)] items-center gap-1 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
              <span className="shrink-0">{t("posOrdersStoreScope") || "조회 매장"}:</span>
              <span className="min-w-0 truncate font-medium text-foreground">{auth?.store}</span>
            </span>
          ) : null}
          {activeTab !== "linkposFailed" && activeTab !== "grabIntegration" && activeTab !== "auditTrail" && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-32 text-sm">
                <SelectValue placeholder={t("posStatus") || "상태"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("posStatusAll") || "전체"}</SelectItem>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {activeTab !== "linkposFailed" && activeTab !== "grabIntegration" && activeTab !== "auditTrail" && (
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="h-9 w-36 text-sm">
                <SelectValue placeholder={t("채널") || "채널"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("posStatusAll") || "전체"}</SelectItem>
                <SelectItem value="delivery">{t("posOrderTypeDelivery") || "배달"}</SelectItem>
                <SelectItem value="grab">Grab</SelectItem>
                <SelectItem value="lineman">LineMan</SelectItem>
                <SelectItem value="shopee">Shopee</SelectItem>
                <SelectItem value="dine_in">{t("posOrderTypeDineIn") || "매장"}</SelectItem>
              </SelectContent>
            </Select>
          )}
          {activeTab !== "linkposFailed" && activeTab !== "grabIntegration" && activeTab !== "auditTrail" && (
            <Select
              value={cancelScopeFilter}
              onValueChange={(v) => {
                setCancelScopeFilter(v as "all" | "line" | "order")
                setCancelReasonFilter("all")
              }}
            >
              <SelectTrigger className="h-9 w-[min(10rem,40vw)] text-sm">
                <SelectValue placeholder={t("posCancelReasonScopeLabel") || "취소 구분"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("posCancelReasonScopeAll") || "품목·전체 모두"}</SelectItem>
                <SelectItem value="line">{t("posCancelReasonScopeLine") || "품목 취소만"}</SelectItem>
                <SelectItem value="order">{t("posCancelReasonScopeOrder") || "주문 전체 취소만"}</SelectItem>
              </SelectContent>
            </Select>
          )}
          {activeTab !== "linkposFailed" && activeTab !== "grabIntegration" && activeTab !== "auditTrail" && (
            <Select value={cancelReasonFilter} onValueChange={setCancelReasonFilter}>
              <SelectTrigger className="h-9 w-[min(16rem,60vw)] text-sm">
                <SelectValue placeholder={t("posCancelReasonSummaryTitle") || "취소 사유"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("posStatusAll") || "전체"}</SelectItem>
                {cancelReasonOptions.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {displayPosCancelReasonKey(reason, t("posCancelReasonNotSet") || "사유 미입력")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {activeTab === "linkposFailed" && (
            <Select
              value={attemptStatusFilter}
              onValueChange={(v) =>
                setAttemptStatusFilter(v as "failed" | "all" | "approved" | "declined")
              }
            >
              <SelectTrigger className="h-9 w-32 text-sm">
                <SelectValue placeholder={t("posStatus") || "상태"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="failed">{attemptStatusLabels.failed}</SelectItem>
                <SelectItem value="declined">{attemptStatusLabels.declined}</SelectItem>
                <SelectItem value="approved">{attemptStatusLabels.approved}</SelectItem>
                <SelectItem value="all">{attemptStatusLabels.all}</SelectItem>
              </SelectContent>
            </Select>
          )}
          {activeTab === "grabIntegration" && (
            <Select value={grabStatusFilter} onValueChange={setGrabStatusFilter}>
              <SelectTrigger className="h-9 w-36 text-sm">
                <SelectValue placeholder="Integration status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("posStatusAll") || "전체"}</SelectItem>
                <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                <SelectItem value="SYNCING">SYNCING</SelectItem>
                <SelectItem value="FAILED">FAILED</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            className="h-9 gap-1.5 px-4"
            onClick={handleSearchClick}
          >
            <Search className="h-4 w-4" />
            {t("itemsBtnSearch") || "조회"}
          </Button>
          {activeTab === "linkposFailed" ? (
            <Input
              placeholder={"R1, 주문번호, 승인번호, 추적번호, 응답코드 검색"}
              value={attemptSearchTerm}
              onChange={(e) => setAttemptSearchTerm(e.target.value)}
              className="h-9 flex-1 min-w-[200px] text-sm"
            />
          ) : activeTab === "grabIntegration" ? (
            <Input
              placeholder="partnerMerchantID 검색"
              value={grabPartnerMerchantFilter}
              onChange={(e) => setGrabPartnerMerchantFilter(e.target.value)}
              className="h-9 flex-1 min-w-[200px] text-sm"
            />
          ) : activeTab === "auditTrail" ? (
            <div className="flex flex-1 min-w-[360px] flex-wrap gap-2">
              <Input
                type="date"
                value={auditStartStr}
                onChange={(e) => setAuditStartStr(e.target.value)}
                onKeyDown={(e) => handleAuditFilterKeyDown(e, () => setAuditStartStr(""))}
                className="h-9 w-[150px] text-sm"
              />
              <Input
                type="date"
                value={auditEndStr}
                onChange={(e) => setAuditEndStr(e.target.value)}
                onKeyDown={(e) => handleAuditFilterKeyDown(e, () => setAuditEndStr(""))}
                className="h-9 w-[150px] text-sm"
              />
              <Input
                placeholder="직원명/사번"
                value={auditEmployeeFilter}
                onChange={(e) => setAuditEmployeeFilter(e.target.value)}
                onKeyDown={(e) => handleAuditFilterKeyDown(e, () => setAuditEmployeeFilter(""))}
                className="h-9 w-[160px] text-sm"
              />
              <Input
                placeholder={t("posOrderNo") || "주문번호"}
                value={auditOrderNoFilter}
                onChange={(e) => setAuditOrderNoFilter(e.target.value)}
                onKeyDown={(e) => handleAuditFilterKeyDown(e, () => setAuditOrderNoFilter(""))}
                className="h-9 w-[160px] text-sm"
              />
            </div>
          ) : (
            <Input
              placeholder={t("posSearchPh") || "주문번호, 테이블, 메뉴 검색"}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 flex-1 min-w-[160px] text-sm"
            />
          )}
        </div>

        {(loading || attemptsLoading || grabLoading || auditLoading) && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        {activeTab !== "linkposFailed" && activeTab !== "grabIntegration" && activeTab !== "auditTrail" && hasSearchedOrders && todaySummary && (
          <div className="mb-4 flex gap-4 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t("posTodayCompleted") || "오늘 완료"}:
              </span>
              <span className="font-bold text-amber-600">
                {todaySummary.completedCount}
                {t("posCount") || "건"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t("posInputTotal") || "합계"}:
              </span>
              <span className="font-bold tabular-nums">
                {todaySummary.completedTotal.toLocaleString()} ฿
              </span>
            </div>
            {todaySummary.pendingCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {t("posPending") || "대기"}: {todaySummary.pendingCount}
                {t("posCount") || "건"}
              </div>
            )}
            {todaySummary.cancelledCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-rose-700">
                <span>
                  {t("posTodayCancelled") || "오늘 취소"}: {todaySummary.cancelledCount}
                  {t("posCount") || "건"}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  ({todaySummary.cancelledTotal.toLocaleString()} ฿)
                </span>
              </div>
            )}
          </div>
        )}
        {activeTab !== "linkposFailed" && activeTab !== "grabIntegration" && activeTab !== "auditTrail" && hasSearchedOrders && cancelledLineReasonSummary.length > 0 && (
          <div className="mb-3 rounded-lg border border-rose-200/70 bg-rose-50/30 p-3">
            <div className="mb-2 text-xs font-semibold text-rose-700">
              {t("posCancelReasonLineSummaryTitle") || "품목 취소 사유 집계"}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {cancelledLineReasonSummary.slice(0, 8).map((row) => (
                <span key={row.reason} className="rounded border border-rose-300/70 bg-white/80 px-2 py-1 text-rose-700">
                  {displayPosCancelReasonKey(row.reason, t("posCancelReasonNotSet") || "사유 미입력")}: {row.count}
                  {t("posCount") || "건"} ({row.amount.toLocaleString()} ฿)
                </span>
              ))}
            </div>
          </div>
        )}
        {activeTab !== "linkposFailed" && activeTab !== "grabIntegration" && activeTab !== "auditTrail" && hasSearchedOrders && cancelledOrderReasonSummary.length > 0 && (
          <div className="mb-4 rounded-lg border border-rose-200/70 bg-rose-50/30 p-3">
            <div className="mb-2 text-xs font-semibold text-rose-700">
              {t("posCancelReasonOrderSummaryTitle") || "주문 전체 취소 사유 집계"}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {cancelledOrderReasonSummary.slice(0, 8).map((row) => (
                <span key={row.reason} className="rounded border border-rose-300/70 bg-white/80 px-2 py-1 text-rose-700">
                  {displayPosCancelReasonKey(row.reason, t("posCancelReasonNotSet") || "사유 미입력")}: {row.count}
                  {t("posCount") || "건"} ({row.amount.toLocaleString()} ฿)
                </span>
              ))}
            </div>
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "orders" | "cookTime" | "linkposFailed" | "grabIntegration" | "auditTrail")}
          className={adminTabsRootCn}
        >
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="orders" className={adminTabsTriggerCn}>
                  {t("posOrderList") || "POS 주문 내역"}
                </TabsTrigger>
                <TabsTrigger value="cookTime" className={adminTabsTriggerCn}>
                  {t("posCookTimeAnalysisTab")}
                </TabsTrigger>
                <TabsTrigger value="linkposFailed" className={adminTabsTriggerCn}>
                  LINKPOS 실패 관리
                </TabsTrigger>
                <TabsTrigger value="grabIntegration" className={adminTabsTriggerCn}>
                  Grab 연동 상태
                </TabsTrigger>
                <TabsTrigger value="auditTrail" className={adminTabsTriggerCn}>
                  감사로그
                </TabsTrigger>
              </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="orders" className={adminTabsContentFlushCn}>
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-20">
                        {t("posOrderNo") || "주문번호"}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-20">
                        {t("store")}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-20">
                        {t("posOrderType") || "유형"}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-16">
                        {t("posTable") || "테이블"}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-14">
                        {t("posOrderGuestCount") || "손님 수"}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-24">
                        {t("posInputTotal")}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-24">
                        {t("posStatus") || "상태"}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-36">
                        {t("posOrderOrderedAt")}
                      </th>
                      <th className="px-5 py-3 text-[11px] font-bold text-center w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {!hasSearchedOrders ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-5 py-12 text-center text-muted-foreground"
                        >
                          {t("posOrderListSearchHint") || "기간·매장·상태를 선택한 뒤 [조회] 버튼을 눌러 주세요."}
                        </td>
                      </tr>
                    ) : filteredOrders.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-5 py-12 text-center text-muted-foreground"
                        >
                          {t("itemsNoResults") || "조회된 내역이 없습니다."}
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((o) => (
                        <React.Fragment key={o.id}>
                          <tr
                            id={`admin-pos-order-row-${o.id}`}
                            className={cn(
                              "border-b cursor-pointer hover:bg-muted/20",
                              expandedId === o.id && "bg-muted/20",
                              o.status === "cancelled" &&
                                !isPosOrderMergedAbsorbRow(o) &&
                                "bg-rose-50/60 hover:bg-rose-50/80 dark:bg-rose-950/25 dark:hover:bg-rose-950/35"
                            )}
                            onClick={() =>
                              setExpandedId((prev) => (prev === o.id ? null : o.id))
                            }
                          >
                            <td className="px-5 py-3">
                              <button
                                type="button"
                                onClick={(e) => copyOrderNo(o.orderNo, e)}
                                className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/20 transition"
                                title={t("posCopyOrderNo") || "복사"}
                              >
                                {o.orderNo}
                              </button>
                            </td>
                            <td className="px-5 py-3 text-center">{o.storeCode || "-"}</td>
                            <td className="px-5 py-3 text-center whitespace-nowrap">
                              {formatListOrderType(o)}
                            </td>
                            <td className="px-5 py-3 text-center text-muted-foreground">
                              {o.orderType === "dine_in" && o.tableName ? (
                                o.tableName
                              ) : o.orderType === "delivery" || o.orderType === "takeout" ? (
                                (() => {
                                  const { text, usedHash } = getPosChannelOrderNoDisplay(o)
                                  if (!text) return "-"
                                  return usedHash ? `#${text}` : text
                                })()
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="px-5 py-3 text-center tabular-nums text-muted-foreground">
                              {formatPosOrderGuestCount(o)}
                            </td>
                            <td className="px-5 py-3 text-right font-bold tabular-nums">
                              {o.total?.toLocaleString()} ฿
                            </td>
                            <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                              {isPosOrderMergedAbsorbRow(o) ? (
                                <span
                                  className={cn(
                                    ADMIN_BADGE_BASE_CN,
                                    ADMIN_BADGE_NEUTRAL_CN,
                                    "inline-flex max-w-[110px] justify-center"
                                  )}
                                  title={(() => {
                                    const ref = parsePosOrderMergedKeepRef(o.memo)
                                    const target =
                                      ref?.keepOrderNo ||
                                      (ref?.keepOrderId ? `#${ref.keepOrderId}` : "")
                                    if (!target) return t("posOrderStatusMergedAbsorb") || "합석 흡수"
                                    return (
                                      i18nTr(t, "posOrderMergedInto", { orderNo: target }) ||
                                      `→ ${target}에 합침`
                                    )
                                  })()}
                                >
                                  {t("posOrderStatusMergedAbsorb") || "합석 흡수"}
                                </span>
                              ) : (
                              <Select
                                value={o.status}
                                onValueChange={(v) => handleStatusChange(o.id, v)}
                                disabled={updatingId === o.id}
                              >
                                <SelectTrigger
                                  className={cn(
                                    "h-8 w-full max-w-[110px] border-0 shadow-none focus:ring-0",
                                    o.status === "completed" && "text-green-600",
                                    o.status === "cancelled" &&
                                      "text-rose-800 bg-rose-100/80 dark:bg-rose-950/40 dark:text-rose-200"
                                  )}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(statusLabels).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>
                                      {v}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              )}
                            </td>
                            <td className="px-5 py-3 text-center text-muted-foreground">
                              {o.createdAt
                                ? formatBangkokDateTime(o.createdAt, bangkokDisplayLocale(lang))
                                : "-"}
                            </td>
                            <td className="px-5 py-3">
                              <ChevronDown
                                className={cn(
                                  "h-4 w-4 transition",
                                  expandedId === o.id && "rotate-180"
                                )}
                              />
                            </td>
                          </tr>
                          {expandedId === o.id && (
                            <tr className="border-b bg-muted/10">
                              <td colSpan={9} className="px-5 py-4">
                                <div className="space-y-2 text-xs">
                                  {(o.tableName ||
                                    o.orderType === "dine_in" ||
                                    o.memo ||
                                    (o.discountAmt && o.discountAmt > 0) ||
                                    (o.deliveryFee ?? 0) > 0 ||
                                    (o.packagingFee ?? 0) > 0 ||
                                    (o.paymentCash ?? 0) +
                                      (o.paymentCard ?? 0) +
                                      (o.paymentQr ?? 0) +
                                      (o.paymentOther ?? 0) +
                                      (o.paymentDeliveryApp ?? 0) >
                                      0) && (
                                    <div className="mb-2 pb-2 border-b">
                                      {o.tableName && o.orderType !== "delivery" && (
                                        <div className="text-muted-foreground">
                                          {t("posTable") || "테이블"}: {o.tableName}
                                        </div>
                                      )}
                                      {o.orderType === "dine_in" && (
                                        <div className="text-muted-foreground mt-0.5">
                                          {t("posOrderGuestCount") || "손님 수"}:{" "}
                                          {formatPosOrderGuestCount(o)}
                                        </div>
                                      )}
                                      {o.memo && (
                                        <div className="text-muted-foreground mt-0.5">
                                          {t("posCustomerMemo") || "메모"}: {o.memo}
                                        </div>
                                      )}
                                      {(o.status === "cancelled" || o.status === "refunded") && (
                                        <div
                                          className={cn(
                                            "mt-0.5 text-rose-700",
                                            cancelReasonFilter !== "all" &&
                                              (cancelScopeFilter === "all" || cancelScopeFilter === "order") &&
                                              orderCancelReasonKey(o) === cancelReasonFilter &&
                                              "rounded bg-rose-100/70 px-1.5 py-0.5 font-semibold dark:bg-rose-950/35"
                                          )}
                                        >
                                          {t("posOrderCancelFull") || "전체 취소"}:{" "}
                                          {displayPosCancelReasonKey(
                                            orderCancelReasonKey(o) as string,
                                            t("posCancelReasonNotSet") || "사유 미입력"
                                          )}
                                        </div>
                                      )}
                                      {o.discountAmt && o.discountAmt > 0 && (
                                        <div className="text-green-600 mt-0.5">
                                          {t("posDiscount") || "할인"}: -{o.discountAmt.toLocaleString()} ฿
                                          {o.discountReason && ` (${o.discountReason})`}
                                        </div>
                                      )}
                                      {(o.deliveryFee ?? 0) > 0 && (
                                        <div className="text-muted-foreground mt-0.5">
                                          {t("posDeliveryFee") || "배달 수수료"}: +{(o.deliveryFee ?? 0).toLocaleString()} ฿
                                        </div>
                                      )}
                                      {(o.packagingFee ?? 0) > 0 && (
                                        <div className="text-muted-foreground mt-0.5">
                                          {t("posPackagingFee") || "포장 수수료"}: +{(o.packagingFee ?? 0).toLocaleString()} ฿
                                        </div>
                                      )}
                                      {((o.paymentCash ?? 0) +
                                        (o.paymentCard ?? 0) +
                                        (o.paymentQr ?? 0) +
                                        (o.paymentOther ?? 0) +
                                        (o.paymentDeliveryApp ?? 0)) > 0 && (
                                        <div className="mt-1 pt-1 border-t border-dashed text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                                          {(o.paymentCash ?? 0) > 0 && <span>{t("posPaymentCash") || "현금"}: {(o.paymentCash ?? 0).toLocaleString()} ฿</span>}
                                          {(o.paymentCard ?? 0) > 0 && <span>{t("posPaymentCard") || "카드"}: {(o.paymentCard ?? 0).toLocaleString()} ฿</span>}
                                          {(o.paymentQr ?? 0) > 0 && <span>{t("posPaymentQr") || "QR"}: {(o.paymentQr ?? 0).toLocaleString()} ฿</span>}
                                          {(o.paymentOther ?? 0) > 0 && <span>{t("posPaymentOther") || "기타"}: {(o.paymentOther ?? 0).toLocaleString()} ฿</span>}
                                          {(o.paymentDeliveryApp ?? 0) > 0 && (
                                            <span>
                                              {t("posPaymentDeliveryApp") || "배달앱"} ({o.deliveryPaymentChannel === "grab"
                                                ? t("posDeliveryPayGrab") || "Grab"
                                                : o.deliveryPaymentChannel === "lineman"
                                                  ? t("posDeliveryPayLineman") || "Line Man"
                                                  : o.deliveryPaymentChannel === "shopee"
                                                    ? t("posDeliveryPayShopeeFood") || "Shopee Food"
                                                    : o.deliveryPaymentChannel === "dine_in"
                                                      ? t("posDeliveryPayDineIn") || "Dine in"
                                                      : o.deliveryPaymentChannel || "—"}
                                              ): {(o.paymentDeliveryApp ?? 0).toLocaleString()} ฿
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {(o.linkposResponseCode ||
                                        o.linkposApprovalCode ||
                                        o.linkposTraceNo ||
                                        o.linkposRefNo ||
                                        o.linkposBankId ||
                                        o.linkposReference1 ||
                                        (o.linkposApprovedAmount ?? 0) > 0 ||
                                        (o.linkposRequestedAmount ?? 0) > 0) && (
                                        <div className="mt-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2">
                                          <div className="mb-1 text-[11px] font-medium text-primary">
                                            LINKPOS
                                          </div>
                                          <div className="grid grid-cols-1 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-2 sm:gap-x-4">
                                            <span>응답코드: {o.linkposResponseCode || '-'}</span>
                                            <span>승인번호: {o.linkposApprovalCode || '-'}</span>
                                            <span>추적번호: {o.linkposTraceNo || '-'}</span>
                                            <span>참조번호: {o.linkposRefNo || '-'}</span>
                                            <span>Bank ID: {o.linkposBankId || '-'}</span>
                                            <span>R1: {o.linkposReference1 || '-'}</span>
                                            <span>요청금액: {(o.linkposRequestedAmount ?? 0).toLocaleString()} ฿</span>
                                            <span>승인금액: {(o.linkposApprovedAmount ?? 0).toLocaleString()} ฿</span>
                                            <span>
                                              요청시각:{' '}
                                              {o.linkposRequestedAt
                                                ? formatBangkokDateTime(o.linkposRequestedAt, bangkokDisplayLocale(lang))
                                                : '-'}
                                            </span>
                                            <span>
                                              응답시각:{' '}
                                              {o.linkposRespondedAt
                                                ? formatBangkokDateTime(o.linkposRespondedAt, bangkokDisplayLocale(lang))
                                                : '-'}
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {o.items?.length ? (
                                    <>
                                      <div className="mb-1 text-[11px] text-muted-foreground">
                                        {(() => {
                                          const activeItems = o.items.filter(
                                            (it: { cancelledAt?: string | null }) => !String(it.cancelledAt || '').trim()
                                          )
                                          const servedCount = activeItems.filter(
                                            (it: { servedAt?: string | null }) => Boolean(it.servedAt)
                                          ).length
                                          return `${t("posTableStatusServed") || "서빙 완료"}: ${servedCount}/${activeItems.length || o.items.length}`
                                        })()}
                                      </div>
                                      {o.items.map((it: {
                                        name?: string
                                        price?: number
                                        qty?: number
                                        servedAt?: string | null
                                        cancelledAt?: string | null
                                        cancelReason?: string | null
                                      }, idx: number) => {
                                        const itemReasonKey = normalizePosCancelReasonKey(String(it.cancelReason || ""))
                                        const reasonMatched =
                                          cancelReasonFilter !== "all" &&
                                          (cancelScopeFilter === "all" || cancelScopeFilter === "line") &&
                                          Boolean(String(it.cancelledAt || "").trim()) &&
                                          itemReasonKey === cancelReasonFilter
                                        return (
                                        <div
                                          key={idx}
                                          className={cn(
                                            "flex items-center justify-between gap-2 text-muted-foreground rounded px-1.5 py-0.5",
                                            reasonMatched && "bg-rose-100/70 ring-1 ring-rose-300/70 dark:bg-rose-950/35 dark:ring-rose-700/60"
                                          )}
                                        >
                                          <span className="min-w-0 truncate">
                                            {it.name} × {it.qty ?? 1}
                                          </span>
                                          <div className="flex items-center gap-2 shrink-0">
                                            {it.cancelledAt ? (
                                              <span className="rounded bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">
                                                {t('posCancel') || '취소'}
                                                {` · ${formatBangkokDateTime(it.cancelledAt, bangkokDisplayLocale(lang))}`}
                                              </span>
                                            ) : it.servedAt ? (
                                              <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                                                {t("posTableStatusServed")}{" "}
                                                {formatBangkokDateTime(it.servedAt, bangkokDisplayLocale(lang))}
                                              </span>
                                            ) : (
                                              <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                                {t("posItemNotServed")}
                                              </span>
                                            )}
                                            <span className="tabular-nums">
                                              {((it.price ?? 0) * (it.qty ?? 1)).toLocaleString()}{" "}
                                              ฿
                                            </span>
                                          </div>
                                        </div>
                                      )})}
                                      {o.items.some((it: { cancelledAt?: string | null }) => Boolean(String(it.cancelledAt || '').trim())) && (
                                        <div className="mt-1 space-y-0.5 text-[11px] text-rose-700">
                                          {o.items
                                            .filter((it: { cancelledAt?: string | null }) => Boolean(String(it.cancelledAt || '').trim()))
                                            .map((it: { name?: string; cancelReason?: string | null }, idx: number) => {
                                              const itemReasonKey = normalizePosCancelReasonKey(String(it.cancelReason || ""))
                                              const cancelReasonLabel = displayPosCancelReasonKey(
                                                itemReasonKey,
                                                t("posCancelReasonNotSet") || "사유 미입력"
                                              )
                                              const reasonMatched =
                                                cancelReasonFilter !== "all" &&
                                                (cancelScopeFilter === "all" || cancelScopeFilter === "line") &&
                                                itemReasonKey === cancelReasonFilter
                                              return (
                                              <div
                                                key={`cancel-reason-${idx}`}
                                                className={cn(
                                                  reasonMatched && "rounded bg-rose-100/80 px-1.5 py-0.5 font-semibold dark:bg-rose-950/40"
                                                )}
                                              >
                                                {it.name || '-'}: {cancelReasonLabel}
                                              </div>
                                            )})}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                  <div className="pt-2 flex flex-wrap gap-2">
                                    {(() => {
                                      const failureRec = getKitchenPrintFailure(resolveKitchenPrintOrderRef(o))
                                      const hasKitchenPrintFailure = Boolean(failureRec)
                                      return (
                                        <>
                                          <Button
                                            size="sm"
                                            variant={hasKitchenPrintFailure ? "destructive" : "outline"}
                                            className={ADMIN_BTN_XS_CN}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handlePrintKitchenSlip(o)
                                            }}
                                          >
                                            <Printer className="h-3 w-3" />
                                            {hasKitchenPrintFailure
                                              ? t("posKitchenSlipRetryAfterMiss") || "미출력 감지 재출력"
                                              : t("posKitchenSlip") || "주방 주문서"}
                                          </Button>
                                          {failureRec?.lastTrackingId ? (
                                            <span className="inline-flex items-center gap-1">
                                              <button
                                                type="button"
                                                className="h-7 rounded border border-amber-300 bg-amber-50 px-2 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  jumpToOrderByTraceId(failureRec.lastTrackingId || "")
                                                }}
                                                title={`${failureRec.lastTrackingId}\n${t("posTraceIdJumpOrder") || "Trace ID로 주문 이동"}`}
                                              >
                                                Trace ID: {formatTraceIdTail(failureRec.lastTrackingId)}
                                              </button>
                                              <button
                                                type="button"
                                                className="inline-flex h-7 w-7 items-center justify-center rounded border border-amber-200 bg-white text-amber-900 hover:bg-amber-50"
                                                onClick={(e) => copyTraceId(failureRec.lastTrackingId || "", e)}
                                                title={`${failureRec.lastTrackingId}\n${t("adminPosOrdersTraceIdCopy")}`}
                                                aria-label={t("adminPosOrdersTraceIdCopy")}
                                              >
                                                <Copy className="h-3.5 w-3.5" />
                                              </button>
                                            </span>
                                          ) : null}
                                        </>
                                      )
                                    })()}
                                    {EDITABLE_STATUSES.includes(o.status) && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className={ADMIN_BTN_XS_CN}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleOpenEdit(o)
                                        }}
                                      >
                                        <Pencil className="h-3 w-3" />
                                        {t("posOrderEdit") || "수정"}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cookTime" className={adminTabsContentFlushCn}>
            {!hasSearchedOrders ? (
              <div className="rounded-xl border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
                {t("posOrderListSearchHint") || "기간·매장·상태를 선택한 뒤 [조회] 버튼을 눌러 주세요."}
              </div>
            ) : (
            <>
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-muted px-2 py-1">
                {t("posCookTimeStatCompletedLines")}: {cookingRows.length}
                {t("posCount")}
              </span>
              <span className="rounded bg-muted px-2 py-1">
                {t("posCookTimeStatAvgElapsed")}: {cookSummary.avgMin}
                {t("posTimeMinUnit")}
              </span>
              <span className="rounded bg-muted px-2 py-1">
                {t("posCookTimeStatMin")}: {cookSummary.minMin}
                {t("posTimeMinUnit")}
              </span>
              <span className="rounded bg-muted px-2 py-1">
                {t("posCookTimeStatMax")}: {cookSummary.maxMin}
                {t("posTimeMinUnit")}
              </span>
              <span className="rounded bg-muted px-2 py-1">
                {t("posCookTimeStatNoBaseline")}: {cookingRows.filter((r) => r.targetMin == null).length}
                {t("posCount")}
              </span>
            </div>
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-24">{t("posServedAtTime")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">{t("store")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">{t("posOrderNo") || "주문번호"}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-16">{t("posTable") || "테이블"}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[220px]">{t("posMenuName")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-12">{t("qty") || "수량"}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-24">{t("posCookTimeActualElapsed")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-24">{t("posCookTimeTargetBaseline")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">{t("posCookTimeDiff")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-16">{t("posCookTimeVerdict")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cookingRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-5 py-12 text-center text-muted-foreground">
                          {t("posCookTimeNoServedRows")}
                        </td>
                      </tr>
                    ) : (
                      cookingRows.map((r) => (
                        <tr key={`${r.orderId}-${r.itemId}-${r.itemName}-${r.servedAt}`} className="border-b">
                          <td className="px-4 py-3 text-center text-muted-foreground">
                            {formatBangkokDateTime(r.servedAt, bangkokDisplayLocale(lang))}
                          </td>
                          <td className="px-4 py-3 text-center">{r.storeCode || "-"}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => copyOrderNo(r.orderNo, e)}
                              className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/20 transition"
                              title={t("posCopyOrderNo") || "복사"}
                            >
                              {r.orderNo}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center text-muted-foreground">{r.tableName || "-"}</td>
                          <td className="px-4 py-3">{r.itemName}</td>
                          <td className="px-4 py-3 text-center tabular-nums">{r.qty}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn(ADMIN_BADGE_BASE_CN, ADMIN_BADGE_WARNING_CN)}>
                              {r.elapsedMin}
                              {t("posTimeMinUnit")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            {r.targetMin != null ? `${r.targetMin}${t("posTimeMinUnit")}` : "-"}
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            {r.diffMin != null
                              ? `${r.diffMin > 0 ? "+" : ""}${r.diffMin}${t("posTimeMinUnit")}`
                              : "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={cn(
                                ADMIN_BADGE_BASE_CN,
                                r.compareKey === "ok" && ADMIN_BADGE_SUCCESS_CN,
                                r.compareKey === "warn" && ADMIN_BADGE_WARNING_CN,
                                r.compareKey === "late" && ADMIN_BADGE_DANGER_CN,
                                r.compareKey === "unset" && ADMIN_BADGE_NEUTRAL_CN
                              )}
                            >
                              {t(COOK_VERDICT_I18N[r.compareKey])}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            </>
            )}
          </TabsContent>
          <TabsContent value="linkposFailed" className={adminTabsContentFlushCn}>
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-muted px-2 py-1">
                조회: {filteredAttempts.length}
                {t("posCount") || "건"}
              </span>
              <span className="rounded bg-muted px-2 py-1">
                실패/거절: {filteredAttempts.filter((a) => a.status === "failed" || a.status === "declined").length}
                {t("posCount") || "건"}
              </span>
              <span className="rounded bg-muted px-2 py-1">
                승인: {filteredAttempts.filter((a) => a.status === "approved").length}
                {t("posCount") || "건"}
              </span>
            </div>
            <div className="mb-4 rounded-xl border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">{t("posLinkposAutoRuleTitle")}</div>
                <div className="text-xs text-muted-foreground">
                  {rulesLoading
                    ? t("posLinkposRulesLoading")
                    : i18nTr(t, "posLinkposRulesCountLabel", { count: tenderRules.length })}
                </div>
              </div>
              <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-6">
                <Select value={ruleScope} onValueChange={(v) => setRuleScope(v as "shared" | "store")}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared">{t("posLinkposScopeSharedWithCode")}</SelectItem>
                    <SelectItem value="store">{t("posLinkposScopeCurrentStore")}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={ruleKeyword}
                  onChange={(e) => setRuleKeyword(e.target.value)}
                  placeholder={t("posLinkposKeywordPlaceholder")}
                  className="h-8 text-xs md:col-span-2"
                />
                <Select value={ruleGroup} onValueChange={(v) => setRuleGroup(v as "card" | "qr")}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">{t("posLinkposGroupCard")}</SelectItem>
                    <SelectItem value="qr">{t("posLinkposGroupQr")}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={ruleKey}
                  onChange={(e) => setRuleKey(e.target.value)}
                  placeholder={t("posLinkposTenderKeyPlaceholder")}
                  className="h-8 text-xs"
                />
                <Input
                  value={rulePriority}
                  onChange={(e) => setRulePriority(e.target.value)}
                  placeholder={t("posLinkposPriorityPlaceholder")}
                  className="h-8 text-xs"
                />
              </div>
              <div className="mb-3 flex items-center gap-2">
                <Button size="sm" className="h-8 text-xs" onClick={() => void handleSaveTenderRule()} disabled={ruleSaving}>
                  {ruleSaving ? t("posLinkposSavingShort") : t("posLinkposAddRule")}
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={loadTenderRules}>
                  {t("posRefresh")}
                </Button>
                {reorderingRules && (
                  <span className="text-xs text-muted-foreground">{t("posLinkposPrioritySaving")}</span>
                )}
                {ruleScope === "store" && !currentStoreCode && (
                  <span className="text-xs text-amber-600">{t("posLinkposStoreScopeHint")}</span>
                )}
              </div>
              <div className="mb-2 text-[11px] text-muted-foreground">{t("posLinkposDragPriorityHint")}</div>
              <div className="max-h-44 overflow-y-auto rounded border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-2 py-1.5 text-left">{t("posLinkposColScope")}</th>
                      <th className="px-2 py-1.5 text-left">{t("posLinkposColKeyword")}</th>
                      <th className="px-2 py-1.5 text-center">{t("posLinkposColGroup")}</th>
                      <th className="px-2 py-1.5 text-left">{t("posLinkposColKey")}</th>
                      <th className="px-2 py-1.5 text-center">{t("posLinkposColPriority")}</th>
                      <th className="px-2 py-1.5 text-center">{t("status")}</th>
                      <th className="px-2 py-1.5 text-center">{t("action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenderRules.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-2 py-5 text-center text-muted-foreground">
                          {t("posLinkposRulesEmpty")}
                        </td>
                      </tr>
                    ) : (
                      tenderRules.map((r) => (
                        <tr
                          key={r.id}
                          className={cn(
                            "border-b last:border-b-0 cursor-grab active:cursor-grabbing",
                            dragRuleId === r.id && "opacity-60",
                            dropRuleId === r.id && "bg-primary/5"
                          )}
                          draggable
                          onDragStart={() => setDragRuleId(r.id)}
                          onDragEnter={() => setDropRuleId(r.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDragEnd={() => {
                            setDragRuleId(null)
                            setDropRuleId(null)
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            void handleRuleDrop(r)
                          }}
                        >
                          <td className="px-2 py-1.5">
                            {r.storeCode === "__shared__" ? t("posLinkposScopeShared") : r.storeCode}
                          </td>
                          <td className="px-2 py-1.5 font-mono">{r.matchKeyword}</td>
                          <td className="px-2 py-1.5 text-center">{r.tenderGroup}</td>
                          <td className="px-2 py-1.5">{r.tenderKey}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{r.priority}</td>
                          <td className="px-2 py-1.5 text-center">
                            <span className={cn("rounded px-1.5 py-0.5", r.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>
                              {r.isActive ? t("active") : t("off")}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => void handleToggleTenderRule(r)}
                                disabled={reorderingRules}
                              >
                                {r.isActive ? t("off") : t("on")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-destructive"
                                onClick={() => void handleDeleteTenderRule(r)}
                                disabled={reorderingRules}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-40">{t("posLinkposRequestedAt")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">{t("store")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">{t("posOrderNo")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[180px]">R1 (local_tx_id)</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">{t("status")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-14">{t("posLinkposResponse")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-24">{t("posLinkposRequestedApproved")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[180px]">{t("posLinkposOriginR1")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">{t("posLinkposRetryCount")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">{t("posLinkposApprovalCode")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">{t("posLinkposTraceNo")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[180px]">{t("posLinkposErrorReason")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">{t("action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!hasSearchedAttempts ? (
                      <tr>
                        <td colSpan={13} className="px-5 py-12 text-center text-muted-foreground">
                          {t("itemsSearchHint") || "검색 버튼을 눌러 주세요."}
                        </td>
                      </tr>
                    ) : filteredAttempts.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="px-5 py-12 text-center text-muted-foreground">
                          {t("posLinkposNoAttempts")}
                        </td>
                      </tr>
                    ) : (
                      filteredAttempts.map((a) => (
                        <tr key={a.id} className="border-b">
                          <td className="px-4 py-3 text-center text-muted-foreground">
                            {formatBangkokDateTime(a.createdAt, bangkokDisplayLocale(lang))}
                          </td>
                          <td className="px-4 py-3 text-center">{a.storeCode || "-"}</td>
                          <td className="px-4 py-3 text-center">{a.orderNo || "-"}</td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-[11px]">{a.localTxId || "-"}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={cn(
                                ADMIN_BADGE_BASE_CN,
                                a.status === "approved" && ADMIN_BADGE_SUCCESS_CN,
                                (a.status === "declined" || a.status === "failed") && ADMIN_BADGE_DANGER_CN,
                                a.status !== "approved" && a.status !== "declined" && a.status !== "failed" && ADMIN_BADGE_NEUTRAL_CN
                              )}
                            >
                              {a.status || "-"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-xs">{a.responseCode || "-"}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {a.requestAmount.toLocaleString()} / {a.approvedAmount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-[11px]">
                              {a.retryOfLocalTxId || "-"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            {(() => {
                              const total = retryStatsByAttemptId.get(a.id)?.total ?? 0
                              if (total <= 0) return <span>{total}</span>
                              return (
                                <button
                                  type="button"
                                  className="rounded px-1.5 py-0.5 text-primary hover:bg-primary/10"
                                  onClick={() => setChainDialogAttemptId(a.id)}
                                  title={t("posLinkposRetryChainTitle")}
                                >
                                  {total}
                                </button>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-xs">{a.approvalCode || "-"}</td>
                          <td className="px-4 py-3 text-center font-mono text-xs">{a.traceNo || "-"}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {a.errorReason || a.responseText || "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {(a.status === "failed" || a.status === "declined") && (a.requestAmount ?? 0) > 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className={ADMIN_BTN_XS_CN}
                                onClick={() => {
                                  void handleRetryAttempt(a)
                                }}
                                disabled={retryingAttemptId === a.id}
                              >
                                {retryingAttemptId === a.id ? t("posLinkposSavingShort") : t("posLinkposRetryButton")}
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="auditTrail" className={adminTabsContentFlushCn}>
            <div className="mb-3 rounded-lg border border-amber-200/70 bg-amber-50/40 px-3 py-2 text-xs text-amber-900">
              누가/언제/무엇을/이전값→변경값 기준으로 주문 변경 이력을 조회합니다.
              <div className="mt-1 text-[11px] text-amber-800/90">
                Enter: 즉시 조회 · Esc: 현재 입력 초기화 · Esc 2회(700ms 이내): 감사로그 필터 전체 초기화
              </div>
            </div>
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-40">변경시각</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-28">직원</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-24">액션</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-24">{t("posOrderNo") || "주문번호"}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[380px]">변경값 (이전 → 이후)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!hasSearchedAudit ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                          {t("itemsSearchHint") || "검색 버튼을 눌러 주세요."}
                        </td>
                      </tr>
                    ) : auditRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                          {t("itemsNoResults") || "조회된 내역이 없습니다."}
                        </td>
                      </tr>
                    ) : (
                      auditRows.map((row) => (
                        <tr key={row.id} className="border-b align-top">
                          <td className="px-4 py-3 text-center text-xs text-muted-foreground whitespace-nowrap">
                            {formatBangkokDateTime(row.changedAt, bangkokDisplayLocale(lang))}
                          </td>
                          <td className="px-4 py-3 text-center text-xs">
                            {row.changedBy ? (
                              <button
                                type="button"
                                className="font-medium text-primary hover:underline"
                                onClick={() => applyAuditQuickFilter({ employee: row.changedBy })}
                                title="직원 필터 적용"
                              >
                                {row.changedBy}
                              </button>
                            ) : (
                              <div className="font-medium">-</div>
                            )}
                            {row.changedByEmployeeCode ? (
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground hover:underline"
                                onClick={() => applyAuditQuickFilter({ employee: row.changedByEmployeeCode })}
                                title="사번 필터 적용"
                              >
                                {row.changedByEmployeeCode}
                              </button>
                            ) : (
                              <div className="text-muted-foreground">-</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-xs">
                            <span className="rounded bg-muted px-2 py-0.5">{row.actionType || "-"}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-xs">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                className="rounded bg-primary/10 px-2 py-0.5 font-semibold text-primary hover:bg-primary/20"
                                onClick={() => applyAuditQuickFilter({ orderNo: row.orderNo || "" })}
                                title="주문번호 필터 적용"
                              >
                                {row.orderNo || `#${row.orderId}`}
                              </button>
                              <button
                                type="button"
                                className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                                onClick={() => jumpToOrderByOrderNo(row.orderNo, row.orderId)}
                                title="주문 행으로 점프"
                              >
                                점프
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {row.changedFields.length === 0 ? (
                              <span className="text-muted-foreground">-</span>
                            ) : (
                              <div className="space-y-1">
                                {(expandedAuditRows[row.id] ? row.changedFields : row.changedFields.slice(0, 6)).map((c, idx) => (
                                  <div key={`${row.id}-${c.field}-${idx}`} className="flex flex-wrap items-center gap-1">
                                    <span className="rounded bg-muted px-1.5 py-0.5 font-semibold">{c.field}</span>
                                    <span className="text-muted-foreground">{formatAuditValue(c.before)}</span>
                                    <span className="text-muted-foreground">→</span>
                                    <span>{formatAuditValue(c.after)}</span>
                                  </div>
                                ))}
                                {row.changedFields.length > 6 ? (
                                  <button
                                    type="button"
                                    className="text-[11px] text-primary hover:underline"
                                    onClick={() => toggleAuditExpanded(row.id)}
                                  >
                                    {expandedAuditRows[row.id]
                                      ? "접기"
                                      : `전체 ${row.changedFields.length}건 보기 (+${row.changedFields.length - 6})`}
                                  </button>
                                ) : null}
                              </div>
                            )}
                            {row.reason ? (
                              <div className="mt-1 text-[11px] text-rose-700">사유: {row.reason}</div>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="grabIntegration" className={adminTabsContentFlushCn}>
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-24">{t("status")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[180px]">grabMerchantID</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[180px]">partnerMerchantID</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[180px]">lastRequestID</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[240px]">lastMessage</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-44">updatedAt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!hasSearchedGrab ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                          {t("itemsSearchHint") || "검색 버튼을 눌러 주세요."}
                        </td>
                      </tr>
                    ) : grabIntegrations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                          {t("adminGrabNoRows")}
                        </td>
                      </tr>
                    ) : (
                      grabIntegrations.map((row) => (
                        <tr key={row.id} className="border-b">
                          <td className="px-4 py-3 text-center">
                            <span
                              className={cn(
                                ADMIN_BADGE_BASE_CN,
                                row.integrationStatus === "ACTIVE" && ADMIN_BADGE_SUCCESS_CN,
                                row.integrationStatus === "SYNCING" && ADMIN_BADGE_WARNING_CN,
                                row.integrationStatus === "FAILED" && ADMIN_BADGE_DANGER_CN,
                                row.integrationStatus === "INACTIVE" && ADMIN_BADGE_NEUTRAL_CN
                              )}
                            >
                              {row.integrationStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px]">{row.grabMerchantID || "-"}</td>
                          <td className="px-4 py-3 font-mono text-[11px]">{row.partnerMerchantID || "-"}</td>
                          <td className="px-4 py-3 font-mono text-[11px]">{row.lastRequestID || "-"}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{row.lastMessage || "-"}</td>
                          <td className="px-4 py-3 text-center text-muted-foreground">
                            {formatBangkokDateTime(row.updatedAt, bangkokDisplayLocale(lang))}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* LINKPOS 재시도 체인 모달 */}
      <Dialog open={!!chainDialogAttemptId} onOpenChange={(open) => !open && setChainDialogAttemptId(null)}>
        <DialogContent className={cn("max-w-4xl", ADMIN_DIALOG_SCROLL_CN)}>
          <DialogHeader>
            <DialogTitle>{t("posLinkposRetryChainTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {chainRows.length === 0 ? (
              <div className="rounded border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                {t("posLinkposNoChainData")}
              </div>
            ) : (
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-2.5 text-[11px] font-bold text-center w-20">{t("posLinkposStep")}</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-left min-w-[180px]">R1</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-center w-16">{t("status")}</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-center w-14">{t("posLinkposResponse")}</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-center w-24">{t("posLinkposRequestedApproved")}</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-center w-24">{t("posLinkposApprovalCode")}</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-center w-20">{t("posLinkposRequestedAt")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chainRows.map((r) => (
                        <tr key={r.id} className="border-b last:border-b-0">
                          <td className="px-4 py-2.5 text-center">
                            <span className={cn(ADMIN_BADGE_BASE_CN, r.depth === 0 ? "bg-primary/10 text-primary" : ADMIN_BADGE_NEUTRAL_CN)}>
                              {r.depth === 0
                                ? t("posLinkposRetryDepthRoot")
                                : i18nTr(t, "posLinkposRetryDepthN", { n: r.depth })}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-[11px]">{r.localTxId || "-"}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span
                              className={cn(
                                ADMIN_BADGE_BASE_CN,
                                r.status === "approved" && ADMIN_BADGE_SUCCESS_CN,
                                (r.status === "declined" || r.status === "failed") && ADMIN_BADGE_DANGER_CN,
                                r.status !== "approved" && r.status !== "declined" && r.status !== "failed" && ADMIN_BADGE_NEUTRAL_CN
                              )}
                            >
                              {r.status || "-"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center font-mono text-xs">{r.responseCode || "-"}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {r.requestAmount.toLocaleString()} / {r.approvedAmount.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-center font-mono text-xs">{r.approvalCode || "-"}</td>
                          <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">
                            {formatBangkokDateTime(r.createdAt, bangkokDisplayLocale(lang))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChainDialogAttemptId(null)}>
              {t("close") || "닫기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 주문 수정 모달 */}
      <Dialog open={!!editOrder} onOpenChange={(open) => !open && setEditOrder(null)}>
        <DialogContent className={cn("max-w-md", ADMIN_DIALOG_SCROLL_CN)}>
          <DialogHeader>
            <DialogTitle>
              {t("posOrderEdit") || "주문 수정"} — {editOrder?.orderNo}
            </DialogTitle>
          </DialogHeader>
          {editOrder && (
            <div className="space-y-4 py-2">
              {editOrder.orderType === "dine_in" && (
                <div>
                  <label className="text-xs font-medium">{t("posTable") || "테이블"}</label>
                  <Input
                    value={editTableName}
                    onChange={(e) => setEditTableName(e.target.value)}
                    className="mt-1 h-9"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium">{t("posCustomerMemo") || "메모"}</label>
                <Input
                  value={editMemo}
                  onChange={(e) => setEditMemo(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium">{t("itemsList") || "항목"}</label>
                <div className="mt-1 space-y-1.5 max-h-40 overflow-y-auto">
                  {editItems.map((it, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm"
                    >
                      <span className="flex-1 truncate">{it.name}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditItemQty(idx, -1)}
                          className="rounded p-0.5 hover:bg-muted"
                        >
                          -
                        </button>
                        <span className="w-6 text-center tabular-nums">{it.qty}</span>
                        <button
                          type="button"
                          onClick={() => handleEditItemQty(idx, 1)}
                          className="rounded p-0.5 hover:bg-muted"
                        >
                          +
                        </button>
                      </div>
                      <span className="w-16 text-right tabular-nums">
                        {(it.price * it.qty).toLocaleString()} ฿
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive"
                        onClick={() => handleRemoveEditItem(idx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Select value={addMenuId} onValueChange={setAddMenuId}>
                    <SelectTrigger className="h-9 flex-1">
                      <SelectValue placeholder={t("posAddItem") || "항목 추가"} />
                    </SelectTrigger>
                    <SelectContent>
                      {menus
                        .filter((m) => m.isActive)
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} — {m.price.toLocaleString()} ฿
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={handleAddEditItem} disabled={!addMenuId}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium">{t("posDiscount") || "할인 (฿)"}</label>
                  <Input
                    type="number"
                    min={0}
                    value={editDiscountAmt}
                    onChange={(e) => setEditDiscountAmt(e.target.value)}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">{t("posDiscountReasonPh") || "사유"}</label>
                  <Input
                    value={editDiscountReason}
                    onChange={(e) => setEditDiscountReason(e.target.value)}
                    className="mt-1 h-9"
                  />
                </div>
              </div>
              <div className="flex justify-end border-t pt-3">
                <span className="text-sm font-bold">
                  {t("posInputTotal") || "합계"}:{" "}
                  {Math.max(
                    0,
                    editItems.reduce((s, it) => s + it.price * it.qty, 0) - (Number(editDiscountAmt) || 0)
                  ).toLocaleString()}{" "}
                  ฿
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)}>
              {t("close") || "닫기"}
            </Button>
            <Button onClick={handleSaveEdit} disabled={updatingId === editOrder?.id}>
              {updatingId === editOrder?.id ? "..." : t("itemsBtnSave") || "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {traceCopyToast ? (
        <div
          className={cn(
            "pointer-events-none fixed bottom-4 right-4 z-[10060] rounded-md px-3 py-2 text-xs font-semibold text-white shadow-lg",
            traceCopyToast.tone === "error" ? "bg-rose-600/95" : "bg-amber-600/95"
          )}
        >
          {traceCopyToast.message}
        </div>
      ) : null}
    </div>
  )
}
