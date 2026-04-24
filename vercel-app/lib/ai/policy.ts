import { addBangkokCalendarDays, getBangkokTodayDateString } from "@/lib/bangkok-time"
import { canApproveAiActions, isAccountingRole, isFranchiseeRole, isManagerRole, isOfficeRole } from "@/lib/permissions"
import type { AiIntent, AiScopedAuth } from "@/lib/ai/types"

export type AiRoleTier = "office" | "accounting" | "manager" | "franchisee" | "other"
export type AiStoreScope = "all" | "own_store"
export type AiDataDomain =
  | "knowledge"
  | "external_context"
  | "staffing"
  | "usage_metrics"
  | "action_requests"
  | "accounting_workflow"

export interface AiDataPolicy {
  roleTier: AiRoleTier
  storeScope: AiStoreScope
  allowedDomains: AiDataDomain[]
  canApproveActions: boolean
  canSyncExternalContext: boolean
  maxDateRangeDays: number
  requestedStore: string
  resolvedStore: string
  isStoreCoerced: boolean
}

export interface AiDateRangePolicyResult {
  start?: string
  end?: string
  maxDays: number
  isClamped: boolean
}

function normalizeYmd(v: unknown): string {
  const s = String(v || "").trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""
}

function roleTier(role: string): AiRoleTier {
  if (isOfficeRole(role)) return "office"
  if (isAccountingRole(role)) return "accounting"
  if (isManagerRole(role)) return "manager"
  if (isFranchiseeRole(role)) return "franchisee"
  return "other"
}

function maxDateRangeDaysForTier(tier: AiRoleTier): number {
  if (tier === "office" || tier === "accounting") return 90
  if (tier === "manager" || tier === "franchisee") return 45
  return 31
}

function allowedDomainsForTier(tier: AiRoleTier): AiDataDomain[] {
  if (tier === "office") {
    return ["knowledge", "external_context", "staffing", "usage_metrics", "action_requests", "accounting_workflow"]
  }
  if (tier === "accounting") {
    return ["knowledge", "external_context", "staffing", "usage_metrics", "action_requests", "accounting_workflow"]
  }
  if (tier === "manager" || tier === "franchisee") {
    return ["knowledge", "external_context", "staffing", "action_requests"]
  }
  return ["knowledge"]
}

export function buildAiDataPolicy(input: {
  scoped: AiScopedAuth
  intent: AiIntent
  requestedStore?: string
}): AiDataPolicy {
  void input.intent
  const tier = roleTier(input.scoped.role)
  const requestedStore = String(input.requestedStore || "").trim() || input.scoped.store || "All"
  const ownStore = String(input.scoped.store || "").trim()
  const canSeeAllStores = tier === "office" || tier === "accounting"
  const resolvedStore = canSeeAllStores ? requestedStore : ownStore || "All"

  return {
    roleTier: tier,
    storeScope: canSeeAllStores ? "all" : "own_store",
    allowedDomains: allowedDomainsForTier(tier),
    canApproveActions: canApproveAiActions(input.scoped.role),
    canSyncExternalContext: tier === "office",
    maxDateRangeDays: maxDateRangeDaysForTier(tier),
    requestedStore,
    resolvedStore,
    isStoreCoerced: requestedStore !== resolvedStore,
  }
}

export function applyAiDateRangePolicy(input: {
  start?: string
  end?: string
  maxDays: number
}): AiDateRangePolicyResult {
  const start = normalizeYmd(input.start)
  const end = normalizeYmd(input.end)
  const maxDays = Math.max(1, Math.min(input.maxDays || 31, 365))
  if (!start && !end) return { maxDays, isClamped: false }

  const today = getBangkokTodayDateString()
  const safeEnd = end || today
  const safeStart = start || addBangkokCalendarDays(safeEnd, -(maxDays - 1))
  const minStart = addBangkokCalendarDays(safeEnd, -(maxDays - 1))
  const clampedStart = safeStart < minStart ? minStart : safeStart

  return {
    start: clampedStart,
    end: safeEnd,
    maxDays,
    isClamped: clampedStart !== safeStart,
  }
}
