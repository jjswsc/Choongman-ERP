import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc, supabaseSelectFilter, supabaseSelectAllPages } from '@/lib/supabase-server'
import {
  bangkokTodayYmd,
  isInteriorVendorTrackDelayed,
  isInteriorWorkPackageScheduleRisk,
} from '@/lib/interior-dashboard-metrics'
import { requireInteriorTenantRead } from '@/lib/interior-tenant-guard'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'

const INTERIOR_DASHBOARD_SCAN_MAX_ROWS = 1_000_000

type DashboardRpcPayload = {
  generatedAt?: string
  totals?: {
    activeProjectCount?: number
    scheduleOverdueCount?: number
    vendorDelayedCount?: number
    overBudgetProjectCount?: number
    projectsWithAnyAlert?: number
  }
  projects?: {
    id?: number
    paidTotal?: number
    scheduleLateCount?: number
    vendorDelayedCount?: number
    overBudget?: boolean
    hasAlert?: boolean
  }[]
}

function emptyDashboardPayload() {
  return {
    generatedAt: bangkokTodayYmd(),
    totals: {
      activeProjectCount: 0,
      scheduleOverdueCount: 0,
      vendorDelayedCount: 0,
      overBudgetProjectCount: 0,
      projectsWithAnyAlert: 0,
    },
    projects: [] as {
      id: number
      paidTotal: number
      scheduleLateCount: number
      vendorDelayedCount: number
      overBudget: boolean
      hasAlert: boolean
    }[],
  }
}

function normalizeDashboardPayload(raw: DashboardRpcPayload | null | undefined) {
  const totals = raw?.totals ?? {}
  return {
    generatedAt: raw?.generatedAt || bangkokTodayYmd(),
    totals: {
      activeProjectCount: Number(totals.activeProjectCount) || 0,
      scheduleOverdueCount: Number(totals.scheduleOverdueCount) || 0,
      vendorDelayedCount: Number(totals.vendorDelayedCount) || 0,
      overBudgetProjectCount: Number(totals.overBudgetProjectCount) || 0,
      projectsWithAnyAlert: Number(totals.projectsWithAnyAlert) || 0,
    },
    projects: (raw?.projects ?? [])
      .map((p) => ({
        id: Number(p.id),
        paidTotal: Number(p.paidTotal) || 0,
        scheduleLateCount: Number(p.scheduleLateCount) || 0,
        vendorDelayedCount: Number(p.vendorDelayedCount) || 0,
        overBudget: !!p.overBudget,
        hasAlert: !!p.hasAlert,
      }))
      .filter((p) => Number.isFinite(p.id)),
  }
}

async function loadTenantScopedProjects(scope: SaasTenantScope) {
  const baseFilter = 'id=gte.0'
  const filter = appendSaasTenantFilter(baseFilter, scope, 'interior_projects')
  try {
    return (await supabaseSelectFilter('interior_projects', filter, {
      order: 'code.asc',
      limit: 500,
      select: 'id,code,name,status,budget_total',
    })) as {
      id?: number
      code?: string
      name?: string
      status?: string
      budget_total?: number | null
    }[]
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('interior_projects')
      return (await supabaseSelectFilter('interior_projects', baseFilter, {
        order: 'code.asc',
        limit: 500,
        select: 'id,code,name,status,budget_total',
      })) as {
        id?: number
        code?: string
        name?: string
        status?: string
        budget_total?: number | null
      }[]
    }
    throw e
  }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const guard = await requireInteriorTenantRead(request)
  if (!guard.ok) {
    guard.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return guard.errorResponse
  }

  if (isSaasTenantQueryBlocked(guard.scope, 'interior_projects')) {
    return NextResponse.json(emptyDashboardPayload(), { headers })
  }

  try {
    try {
      const rpcParams = guard.scope.enforce
        ? { p_tenant_id: guard.scope.tenantId || null }
        : {}
      const rpc = await supabaseRpc<DashboardRpcPayload>('get_interior_dashboard_summary', rpcParams)
      if (rpc && typeof rpc === 'object') {
        return NextResponse.json(normalizeDashboardPayload(rpc), { headers })
      }
    } catch (rpcErr) {
      console.warn('getInteriorDashboardSummary RPC fallback:', rpcErr)
    }

    const todayYmd = bangkokTodayYmd()
    const projectRows = await loadTenantScopedProjects(guard.scope)
    const projects = Array.isArray(projectRows) ? projectRows : []
    const allowedProjectIds = new Set<number>()
    for (const p of projects) {
      const id = Number(p.id)
      if (Number.isFinite(id)) allowedProjectIds.add(id)
    }

    const activeProjectCount = projects.filter((p) => String(p.status || 'active') !== 'completed').length

    const budgetByProject = new Map<number, number>()
    for (const p of projects) {
      const id = Number(p.id)
      if (!Number.isFinite(id)) continue
      budgetByProject.set(id, Math.max(0, Number(p.budget_total) || 0))
    }

    const wpRows = (await supabaseSelectAllPages('interior_work_packages', {
      order: 'id.asc',
      select: 'id,project_id,end_date,status',
      pageSize: 4000,
      maxRows: INTERIOR_DASHBOARD_SCAN_MAX_ROWS,
    })) as {
      project_id?: number
      end_date?: string | null
      status?: string | null
    }[]

    const legacySchedRows = (await supabaseSelectAllPages('interior_schedule_items', {
      order: 'id.asc',
      select: 'project_id,end_date',
      pageSize: 4000,
      maxRows: INTERIOR_DASHBOARD_SCAN_MAX_ROWS,
    })) as { project_id?: number; end_date?: string | null }[]

    const projectsWithWorkPackages = new Set<number>()
    for (const wp of wpRows || []) {
      const pid = Number(wp.project_id)
      if (Number.isFinite(pid) && allowedProjectIds.has(pid)) projectsWithWorkPackages.add(pid)
    }

    let scheduleOverdueCount = 0
    for (const wp of wpRows || []) {
      const pid = Number(wp.project_id)
      if (!Number.isFinite(pid) || !allowedProjectIds.has(pid)) continue
      if (
        isInteriorWorkPackageScheduleRisk(
          {
            endDate: wp.end_date ?? null,
            status: wp.status ?? null,
          },
          todayYmd
        )
      ) {
        scheduleOverdueCount += 1
      }
    }
    for (const row of legacySchedRows || []) {
      const pid = Number(row.project_id)
      if (!Number.isFinite(pid) || !allowedProjectIds.has(pid) || projectsWithWorkPackages.has(pid)) continue
      if (
        isInteriorWorkPackageScheduleRisk(
          {
            endDate: row.end_date ?? null,
            status: 'planned',
          },
          todayYmd
        )
      ) {
        scheduleOverdueCount += 1
      }
    }

    const vtRows = (await supabaseSelectAllPages('interior_vendor_tracks', {
      order: 'id.asc',
      select:
        'id,project_id,status,payment_due_date,payment_paid_date,material_eta_date,material_received_date,work_completed_date',
      pageSize: 4000,
      maxRows: INTERIOR_DASHBOARD_SCAN_MAX_ROWS,
    })) as {
      project_id?: number
      status?: string | null
      payment_due_date?: string | null
      payment_paid_date?: string | null
      material_eta_date?: string | null
      material_received_date?: string | null
      work_completed_date?: string | null
    }[]

    let vendorDelayedCount = 0
    for (const v of vtRows || []) {
      const pid = Number(v.project_id)
      if (!Number.isFinite(pid) || !allowedProjectIds.has(pid)) continue
      if (
        isInteriorVendorTrackDelayed(
          {
            status: v.status,
            paymentDueDate: v.payment_due_date ?? null,
            paymentPaidDate: v.payment_paid_date ?? null,
            materialEtaDate: v.material_eta_date ?? null,
            materialReceivedDate: v.material_received_date ?? null,
            workCompletedDate: v.work_completed_date ?? null,
          },
          todayYmd
        )
      ) {
        vendorDelayedCount += 1
      }
    }

    const expRows = (await supabaseSelectAllPages('interior_expense_items', {
      order: 'id.asc',
      select: 'project_id,paid',
      pageSize: 4000,
      maxRows: INTERIOR_DASHBOARD_SCAN_MAX_ROWS,
    })) as { project_id?: number; paid?: number | null }[]

    const paidSumByProject = new Map<number, number>()
    for (const e of expRows || []) {
      const pid = Number(e.project_id)
      if (!Number.isFinite(pid) || !allowedProjectIds.has(pid)) continue
      const paid = Math.max(0, Number(e.paid) || 0)
      paidSumByProject.set(pid, (paidSumByProject.get(pid) ?? 0) + paid)
    }

    let overBudgetProjectCount = 0
    const alertProjectIds = new Set<number>()

    for (const [pid, budget] of budgetByProject) {
      if (budget <= 0) continue
      const spent = paidSumByProject.get(pid) ?? 0
      if (spent > budget) {
        overBudgetProjectCount += 1
        alertProjectIds.add(pid)
      }
    }

    for (const wp of wpRows || []) {
      const pid = Number(wp.project_id)
      if (!Number.isFinite(pid) || !allowedProjectIds.has(pid)) continue
      if (
        isInteriorWorkPackageScheduleRisk(
          {
            endDate: wp.end_date ?? null,
            status: wp.status ?? null,
          },
          todayYmd
        )
      ) {
        alertProjectIds.add(pid)
      }
    }
    for (const row of legacySchedRows || []) {
      const pid = Number(row.project_id)
      if (!Number.isFinite(pid) || !allowedProjectIds.has(pid) || projectsWithWorkPackages.has(pid)) continue
      if (
        isInteriorWorkPackageScheduleRisk(
          {
            endDate: row.end_date ?? null,
            status: 'planned',
          },
          todayYmd
        )
      ) {
        alertProjectIds.add(pid)
      }
    }

    for (const v of vtRows || []) {
      const pid = Number(v.project_id)
      if (!Number.isFinite(pid) || !allowedProjectIds.has(pid)) continue
      if (
        isInteriorVendorTrackDelayed(
          {
            status: v.status,
            paymentDueDate: v.payment_due_date ?? null,
            paymentPaidDate: v.payment_paid_date ?? null,
            materialEtaDate: v.material_eta_date ?? null,
            materialReceivedDate: v.material_received_date ?? null,
            workCompletedDate: v.work_completed_date ?? null,
          },
          todayYmd
        )
      ) {
        alertProjectIds.add(pid)
      }
    }

    const projectsWithAnyAlert = alertProjectIds.size

    return NextResponse.json(
      {
        generatedAt: todayYmd,
        totals: {
          activeProjectCount,
          scheduleOverdueCount,
          vendorDelayedCount,
          overBudgetProjectCount,
          projectsWithAnyAlert,
        },
        projects: Array.from(alertProjectIds).map((id) => ({
          id,
          paidTotal: paidSumByProject.get(id) ?? 0,
          scheduleLateCount: 0,
          vendorDelayedCount: 0,
          overBudget: (() => {
            const budget = budgetByProject.get(id) ?? 0
            const spent = paidSumByProject.get(id) ?? 0
            return budget > 0 && spent > budget
          })(),
          hasAlert: true,
        })),
      },
      { headers }
    )
  } catch (e) {
    console.error('getInteriorDashboardSummary:', e)
    return NextResponse.json(emptyDashboardPayload(), { headers })
  }
}
