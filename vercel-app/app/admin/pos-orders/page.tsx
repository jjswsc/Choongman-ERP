"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { Receipt, Search, ChevronDown, Pencil, Plus, Trash2, Printer } from "lucide-react"
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
import { useT } from "@/lib/i18n"
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
  updatePosOrder,
  updatePosOrderStatus,
  useStoreList,
  type PosOrder,
  type PosPaymentAttempt,
  type PosLinkposTenderRule,
  type PosMenu,
  type PosDeliveryApp,
} from "@/lib/api-client"
import {
  getPosDeliveryPlatformName,
  formatPosOrderTypeChannelSuffix,
  getPosChannelOrderNoDisplay,
} from "@/lib/pos-delivery-platform"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import {
  adminTabsBarCn,
  adminTabsContentFlushCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn, escapeHtml } from "@/lib/utils"
import { buildKitchenSlipGroupOpts, buildKitchenSlipGroups } from "@/lib/pos-kitchen-slip-routing"
import { buildKitchenSlipDocumentHtml, resolveKitchenSlipDesign } from "@/lib/pos-kitchen-slip-html"
import { parsePosOrderMemo } from "@/lib/pos-tax-invoice"
import { translatePosMenuLineForReceipt } from "@/lib/pos-print-translate"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
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
  const [expandedId, setExpandedId] = React.useState<number | null>(null)
  const [activeTab, setActiveTab] = React.useState<"orders" | "cookTime" | "linkposFailed">("orders")
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

  const filteredOrders = React.useMemo(() => {
    if (!searchTerm.trim()) return orders
    const term = searchTerm.trim().toLowerCase()
    return orders.filter(
      (o) =>
        o.orderNo.toLowerCase().includes(term) ||
        (o.tableName && o.tableName.toLowerCase().includes(term)) ||
        (o.memo && o.memo.toLowerCase().includes(term)) ||
        o.items.some(
          (it: { name?: string }) =>
            it.name && String(it.name).toLowerCase().includes(term)
        )
    )
  }, [orders, searchTerm])

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
        void appAlert(t("posOrderNoCopied") || "주문번호가 복사되었습니다.")
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
    getPosMenus().then(setMenus).catch(() => setMenus([]))
  }

  const handleSaveEdit = async () => {
    if (!editOrder) return
    if (editItems.length === 0) {
      await appAlert(t("posEditItemsRequired") || "항목이 하나 이상 필요합니다.")
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
      await appAlert(String(e))
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
    if (newStatus === "cancelled") {
      if (!await appConfirm(t("posCancelConfirm") || "이 주문을 취소하시겠습니까?")) return
    }
    setUpdatingId(orderId)
    try {
      const res = await updatePosOrderStatus({ id: orderId, status: newStatus })
      if (res.success) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
        )
      } else {
        await appAlert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setUpdatingId(null)
    }
  }

  const handlePrintKitchenSlip = async (o: PosOrder) => {
    const storeCode = (o.storeCode ?? "").trim()
    if (!storeCode || !o.items?.length) {
      await appAlert(t("posPrintUnavailable") || "인쇄할 수 없습니다.")
      return
    }
    const win = window.open("", "_blank")
    if (!win) {
      await appAlert(t("posPrintBlocked") || "팝업이 차단되었습니다. 인쇄를 허용해 주세요.")
      return
    }
    try {
      const settings = await getPosPrinterSettings({ storeCode })
      const items = o.items as { id?: string; name?: string; price?: number; qty?: number }[]
      const kLabels = {
        unified: t("posKitchenOrder") || "주방 주문서",
        kitchen1: `${t("posKitchen1") || "주방 1"}`,
        kitchen2: `${t("posKitchen2") || "주방 2"}`,
        kitchen3: `${t("posKitchen3") || "주방 3"}`,
      }
      const slips = buildKitchenSlipGroups(items, buildKitchenSlipGroupOpts(settings, menus, kLabels))
      if (!slips.length) {
        win.close()
        await appAlert(t("posKitchenNoItemsToPrint") || "주방으로 인쇄할 품목이 없습니다.")
        return
      }
      const slipDesign = resolveKitchenSlipDesign(settings)
      const kitchenMemo = parsePosOrderMemo(o.memo).plainMemo
      const memoLine = kitchenMemo.trim()
        ? `${t("posCustomerMemo") || "메모"}: ${kitchenMemo.trim()}`
        : ""
      const dateStr =
        o.createdAt ? formatBangkokDateTime(o.createdAt, bangkokDisplayLocale(lang)) : "-"
      const printOne = (idx: number) => {
        if (idx >= slips.length) return
        const slip = slips[idx]
        const w = idx === 0 ? win : window.open("", "_blank")
        if (!w) return
        const tablePart =
          o.tableName && o.orderType !== "delivery"
            ? ` · ${t("posTable") || "테이블"}: ${o.tableName}`
            : ""
        const html = buildKitchenSlipDocumentHtml({
          label: slip.label,
          orderNo: String(o.orderNo ?? ""),
          storeCode,
          orderTypeLabel: formatListOrderType(o),
          tablePart,
          dateStr,
          items: slip.items.map((it) => {
            const row = it as { name?: string; qty?: number; note?: string }
            return {
              name: translatePosMenuLineForReceipt(String(row.name ?? "-"), t),
              qty: Number(row.qty ?? 1),
              note: row.note,
            }
          }),
          memoLine: memoLine || null,
          escapeHtml,
          design: slipDesign,
          printColorAdjust: "economy",
        })
        w.document.write(html)
        w.document.close()
        w.focus()
        let done = false
        const afterPrint = () => {
          if (done) return
          done = true
          w.close()
          if (idx + 1 < slips.length) setTimeout(() => printOne(idx + 1), 400)
        }
        w.onafterprint = afterPrint
        setTimeout(() => w.print(), 250)
        setTimeout(afterPrint, 30000)
      }
      printOne(0)
    } catch (e) {
      win.close()
      await appAlert(String(e))
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

  const handleSaveTenderRule = React.useCallback(async () => {
    const keyword = ruleKeyword.trim().toLowerCase().replace(/\s+/g, "")
    const tenderKey = ruleKey.trim()
    if (!keyword) {
      await appAlert("매칭 키워드를 입력해 주세요.")
      return
    }
    if (!tenderKey) {
      await appAlert("매핑 키를 입력해 주세요.")
      return
    }
    const targetStoreCode =
      ruleScope === "shared"
        ? "__shared__"
        : (currentStoreCode || "").trim()
    if (ruleScope === "store" && !targetStoreCode) {
      await appAlert("매장 규칙은 매장을 먼저 선택해야 저장할 수 있습니다.")
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
        await appAlert(res.message || "규칙 저장에 실패했습니다.")
        return
      }
      setRuleKeyword("")
      setRuleKey("")
      setRulePriority("100")
      loadTenderRules()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setRuleSaving(false)
    }
  }, [ruleKeyword, ruleKey, ruleScope, currentStoreCode, ruleGroup, rulePriority, loadTenderRules])

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
        await appAlert(res.message || "규칙 상태 변경에 실패했습니다.")
        return
      }
      loadTenderRules()
    } catch (e) {
      await appAlert(String(e))
    }
  }, [loadTenderRules, setTenderRules, appAlert])

  const handleDeleteTenderRule = React.useCallback(async (rule: PosLinkposTenderRule) => {
    const ok = await appConfirm(`규칙을 삭제하시겠습니까?\n[${rule.storeCode}] ${rule.matchKeyword} → ${rule.tenderKey}`)
    if (!ok) return
    try {
      const res = await deletePosLinkposTenderRule({ id: rule.id })
      if (!res.success) {
        await appAlert(res.message || "규칙 삭제에 실패했습니다.")
        return
      }
      loadTenderRules()
    } catch (e) {
      await appAlert(String(e))
    }
  }, [loadTenderRules, appAlert, appConfirm])

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
      await appAlert("드래그 정렬은 같은 범위(공통 또는 동일 매장) 안에서만 가능합니다.")
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
      await appAlert(`우선순위 저장 실패: ${String(e)}`)
      loadTenderRules()
    } finally {
      setReorderingRules(false)
      setDragRuleId(null)
      setDropRuleId(null)
    }
  }, [dragRuleId, tenderRules, loadTenderRules])

  const handleRetryAttempt = React.useCallback(
    async (attempt: PosPaymentAttempt) => {
      const amount = Number(attempt.requestAmount || 0)
      if (amount <= 0) {
        await appAlert("요청금액이 0이라 재시도할 수 없습니다.")
        return
      }
      const newReference1 = buildRetryReference1(attempt.localTxId)
      if (!newReference1 || newReference1 === String(attempt.localTxId || "").trim()) {
        await appAlert("신규 R1 생성에 실패했습니다. 다시 시도해 주세요.")
        return
      }
      const ok = await appConfirm(
        `동일 R1 재사용은 차단됩니다.\n` +
          `기존 R1: ${attempt.localTxId || "-"}\n` +
          `신규 R1: ${newReference1}\n\n` +
          `재시도하시겠습니까?`
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
            `재시도 승인 완료\n` +
              `R1: ${newReference1}\n` +
              `응답코드: ${res.payment?.responseCode || "00"}\n` +
              `승인번호: ${res.payment?.approvalCode || "-"}`
          )
        } else {
          await appAlert(`재시도 실패: ${res.message || "unknown_error"}`)
        }
        loadAttempts()
        if (attempt.orderId) loadOrders()
      } catch (e) {
        await appAlert(String(e))
      } finally {
        setRetryingAttemptId(null)
      }
    },
    [loadAttempts, loadOrders]
  )

  React.useEffect(() => {
    loadOrders()
  }, [loadOrders])

  React.useEffect(() => {
    if (activeTab !== "linkposFailed") return
    loadAttempts()
    loadTenderRules()
  }, [activeTab, loadAttempts, loadTenderRules])

  React.useEffect(() => {
    getPosMenus().then(setMenus).catch(() => setMenus([]))
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
    const cancelled = orders.filter((o) => o.status === 'cancelled')
    return {
      completedCount: completed.length,
      completedTotal: completed.reduce((s, o) => s + (o.total ?? 0), 0),
      pendingCount: pending.length,
      cancelledCount: cancelled.length,
      cancelledTotal: cancelled.reduce((s, o) => s + (o.total ?? 0), 0),
    }
  }, [isToday, orders, statusFilter])

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
          {activeTab !== "linkposFailed" && (
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
          <Button
            size="sm"
            className="h-9 gap-1.5 px-4"
            onClick={activeTab === "linkposFailed" ? loadAttempts : loadOrders}
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
          ) : (
            <Input
              placeholder={t("posSearchPh") || "주문번호, 테이블, 메뉴 검색"}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 flex-1 min-w-[160px] text-sm"
            />
          )}
        </div>

        {(loading || attemptsLoading) && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        {activeTab !== "linkposFailed" && todaySummary && (
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

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "orders" | "cookTime" | "linkposFailed")}
          className={adminTabsRootCn}
        >
          <div className={adminTabsBarCn}>
            <div className={adminTabsScrollCn}>
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
              </TabsList>
            </div>
          </div>

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
                    {filteredOrders.length === 0 ? (
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
                            className={cn(
                              "border-b cursor-pointer hover:bg-muted/20",
                              expandedId === o.id && "bg-muted/20",
                              o.status === "cancelled" &&
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
                                          const servedCount = o.items.filter((it: { servedAt?: string | null }) => Boolean(it.servedAt)).length
                                          return `${t("posTableStatusServed") || "서빙 완료"}: ${servedCount}/${o.items.length}`
                                        })()}
                                      </div>
                                      {o.items.map((it: { name?: string; price?: number; qty?: number; servedAt?: string | null }, idx: number) => (
                                        <div
                                          key={idx}
                                          className="flex items-center justify-between gap-2 text-muted-foreground"
                                        >
                                          <span className="min-w-0 truncate">
                                            {it.name} × {it.qty ?? 1}
                                          </span>
                                          <div className="flex items-center gap-2 shrink-0">
                                            {it.servedAt ? (
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
                                      ))}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                  <div className="pt-2 flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 gap-1 px-2 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handlePrintKitchenSlip(o)
                                      }}
                                    >
                                      <Printer className="h-3 w-3" />
                                      {t("posKitchenSlip") || "주방 주문서"}
                                    </Button>
                                    {EDITABLE_STATUSES.includes(o.status) && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 gap-1 px-2 text-xs"
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
                            <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
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
                                "rounded px-2 py-0.5 text-xs",
                                r.compareKey === "ok" && "bg-emerald-50 text-emerald-700",
                                r.compareKey === "warn" && "bg-amber-50 text-amber-700",
                                r.compareKey === "late" && "bg-rose-50 text-rose-700",
                                r.compareKey === "unset" && "bg-muted text-muted-foreground"
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
                <div className="text-sm font-semibold">LINKPOS 자동분류 규칙</div>
                <div className="text-xs text-muted-foreground">
                  {rulesLoading ? "불러오는 중..." : `규칙 ${tenderRules.length}${t("posCount") || "건"}`}
                </div>
              </div>
              <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-6">
                <Select value={ruleScope} onValueChange={(v) => setRuleScope(v as "shared" | "store")}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared">공통(__shared__)</SelectItem>
                    <SelectItem value="store">현재 매장</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={ruleKeyword}
                  onChange={(e) => setRuleKeyword(e.target.value)}
                  placeholder="keyword (예: promptpay)"
                  className="h-8 text-xs md:col-span-2"
                />
                <Select value={ruleGroup} onValueChange={(v) => setRuleGroup(v as "card" | "qr")}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">card</SelectItem>
                    <SelectItem value="qr">qr</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={ruleKey}
                  onChange={(e) => setRuleKey(e.target.value)}
                  placeholder="매핑 키 (예: Visa)"
                  className="h-8 text-xs"
                />
                <Input
                  value={rulePriority}
                  onChange={(e) => setRulePriority(e.target.value)}
                  placeholder="priority"
                  className="h-8 text-xs"
                />
              </div>
              <div className="mb-3 flex items-center gap-2">
                <Button size="sm" className="h-8 text-xs" onClick={() => void handleSaveTenderRule()} disabled={ruleSaving}>
                  {ruleSaving ? "..." : "규칙 추가"}
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={loadTenderRules}>
                  새로고침
                </Button>
                {reorderingRules && <span className="text-xs text-muted-foreground">우선순위 저장 중...</span>}
                {ruleScope === "store" && !currentStoreCode && (
                  <span className="text-xs text-amber-600">현재 매장을 선택하면 매장 규칙 저장이 가능합니다.</span>
                )}
              </div>
              <div className="mb-2 text-[11px] text-muted-foreground">행을 드래그해서 우선순위를 변경할 수 있습니다.</div>
              <div className="max-h-44 overflow-y-auto rounded border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-2 py-1.5 text-left">범위</th>
                      <th className="px-2 py-1.5 text-left">키워드</th>
                      <th className="px-2 py-1.5 text-center">그룹</th>
                      <th className="px-2 py-1.5 text-left">키</th>
                      <th className="px-2 py-1.5 text-center">우선순위</th>
                      <th className="px-2 py-1.5 text-center">상태</th>
                      <th className="px-2 py-1.5 text-center">액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenderRules.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-2 py-5 text-center text-muted-foreground">
                          규칙이 없습니다.
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
                          <td className="px-2 py-1.5">{r.storeCode === "__shared__" ? "공통" : r.storeCode}</td>
                          <td className="px-2 py-1.5 font-mono">{r.matchKeyword}</td>
                          <td className="px-2 py-1.5 text-center">{r.tenderGroup}</td>
                          <td className="px-2 py-1.5">{r.tenderKey}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{r.priority}</td>
                          <td className="px-2 py-1.5 text-center">
                            <span className={cn("rounded px-1.5 py-0.5", r.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>
                              {r.isActive ? "active" : "off"}
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
                                {r.isActive ? "off" : "on"}
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
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-40">요청시각</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">매장</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">주문번호</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[180px]">R1 (local_tx_id)</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">상태</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-14">응답</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-24">요청/승인</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[180px]">원시도 R1</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">재시도 횟수</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">승인번호</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">추적번호</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-left min-w-[180px]">오류사유</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-center w-20">액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttempts.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="px-5 py-12 text-center text-muted-foreground">
                          조회된 LINKPOS 결제 시도가 없습니다.
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
                                "rounded px-2 py-0.5 text-xs",
                                a.status === "approved" && "bg-emerald-50 text-emerald-700",
                                (a.status === "declined" || a.status === "failed") && "bg-rose-50 text-rose-700",
                                a.status !== "approved" && a.status !== "declined" && a.status !== "failed" && "bg-muted text-muted-foreground"
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
                                  title="재시도 체인 보기"
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
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  void handleRetryAttempt(a)
                                }}
                                disabled={retryingAttemptId === a.id}
                              >
                                {retryingAttemptId === a.id ? "..." : "재시도"}
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
        </Tabs>
      </div>

      {/* LINKPOS 재시도 체인 모달 */}
      <Dialog open={!!chainDialogAttemptId} onOpenChange={(open) => !open && setChainDialogAttemptId(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>LINKPOS 재시도 체인</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {chainRows.length === 0 ? (
              <div className="rounded border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                표시할 체인 데이터가 없습니다.
              </div>
            ) : (
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-2.5 text-[11px] font-bold text-center w-20">단계</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-left min-w-[180px]">R1</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-center w-16">상태</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-center w-14">응답</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-center w-24">요청/승인</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-center w-24">승인번호</th>
                        <th className="px-4 py-2.5 text-[11px] font-bold text-center w-20">요청시각</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chainRows.map((r) => (
                        <tr key={r.id} className="border-b last:border-b-0">
                          <td className="px-4 py-2.5 text-center">
                            <span className={cn("rounded px-2 py-0.5 text-xs", r.depth === 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                              {r.depth === 0 ? "원시도" : `${r.depth}차`}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-[11px]">{r.localTxId || "-"}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span
                              className={cn(
                                "rounded px-2 py-0.5 text-xs",
                                r.status === "approved" && "bg-emerald-50 text-emerald-700",
                                (r.status === "declined" || r.status === "failed") && "bg-rose-50 text-rose-700",
                                r.status !== "approved" && r.status !== "declined" && r.status !== "failed" && "bg-muted text-muted-foreground"
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
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
    </div>
  )
}
