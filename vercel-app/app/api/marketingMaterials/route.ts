import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import { campaignNoByIdMap } from '@/lib/marketing-campaign-code-resolve'
import {
  fetchCampaignMetaForExpenseMemo,
  syncMarketingExpenseAccrual,
} from '@/lib/marketing-expense-accrual-sync'

function parseNum(val: unknown): number {
  if (val == null || val === '') return 0
  const n = typeof val === 'number' ? val : parseFloat(String(val))
  return Number.isNaN(n) ? 0 : n
}

function parseDate(val: unknown): string | null {
  if (val == null || val === '') return null
  const s = String(val).trim()
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function parseBranchesJson(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String)
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val) as unknown
      if (Array.isArray(p)) return p.map(String)
    } catch {/* ignore */}
  }
  return []
}

const ALLOWED_PLACEMENT_SPOTS = new Set(['counter', 'tv', 'table', 'entrance'])

function parsePlacementSpots(val: unknown): string[] {
  let list: unknown[] = []
  if (Array.isArray(val)) {
    list = val
  } else if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val) as unknown
      if (Array.isArray(parsed)) list = parsed
    } catch {
      list = []
    }
  }
  const cleaned = list
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter((v) => v.length > 0 && ALLOWED_PLACEMENT_SPOTS.has(v))
  return Array.from(new Set(cleaned))
}

function isColumnSchemaError(e: unknown): boolean {
  const s = String(e)
  return (
    s.includes('42703') ||
    s.includes('PGRST204') ||
    s.includes('schema cache') ||
    /Could not find the .* column/i.test(s) ||
    /column .* does not exist/i.test(s)
  )
}

/** 판촉물 목록 조회 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get('campaignId')?.trim()

    const rows = campaignId
      ? ((await supabaseSelectFilter(
          'marketing_materials',
          `campaign_id=eq.${encodeURIComponent(campaignId)}`,
          { order: 'id.asc', limit: 500 }
        )) as Record<string, unknown>[])
      : ((await supabaseSelect('marketing_materials', {
          order: 'id.desc',
          limit: 500,
        })) as Record<string, unknown>[])

    const base = (rows || []).map((row) => ({
      id: String(row.id ?? ''),
      campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
      type: String(row.type ?? 'tentcard'),
      name: String(row.name ?? ''),
      quantity: Number(row.quantity) || 1,
      unitCost: parseNum(row.unit_cost),
      actualCost: parseNum(row.actual_cost),
      branches: parseBranchesJson(row.branches),
      isHqWide: Boolean(row.is_hq_wide),
      displayStartDate: parseDate(row.display_start_date),
      displayEndDate: parseDate(row.display_end_date),
      placementSpots: parsePlacementSpots(row.placement_spots),
      status: String(row.status ?? 'planning'),
      note: String(row.note ?? ''),
      expenseAccrualId:
        row.expense_accrual_id != null && row.expense_accrual_id !== ''
          ? String(row.expense_accrual_id)
          : null,
    }))
    const cmap = await campaignNoByIdMap(base.map((r) => r.campaignId))
    const list = base.map((r) => ({
      ...r,
      campaignNo:
        r.campaignId != null && String(r.campaignId).trim() !== ''
          ? cmap.get(Number(r.campaignId)) ?? ''
          : null,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('marketingMaterials GET:', e)
    return NextResponse.json([], { headers })
  }
}

/** 판촉물 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as {
      id?: string
      campaignId: string
      type?: string
      name?: string
      quantity?: number
      unitCost?: number
      actualCost?: number
      branches?: string[]
      isHqWide?: boolean
      displayStartDate?: string | null
      displayEndDate?: string | null
      placementSpots?: string[]
      status?: string
      note?: string
      userRole?: string
      userName?: string
      user_role?: string
      user_name?: string
    }

    const campaignId = String(body.campaignId ?? '').trim()
    const name = String(body.name ?? '').trim()
    const editingId = body.id?.trim()
    const userRole = String(body.userRole ?? body.user_role ?? '')
    const userName = String(body.userName ?? body.user_name ?? '').trim()

    if (!campaignId || !name) {
      return NextResponse.json(
        { success: false, message: '캠페인 ID와 이름이 필요합니다.' },
        { headers }
      )
    }

    let priorAccrualId: number | null = null
    if (editingId) {
      try {
        const prev = (await supabaseSelectFilter(
          'marketing_materials',
          `id=eq.${encodeURIComponent(editingId)}`,
          { limit: 1, select: 'id,expense_accrual_id' }
        )) as { expense_accrual_id?: number | null }[] | null
        const pid = prev?.[0]?.expense_accrual_id
        priorAccrualId = pid != null && Number(pid) > 0 ? Number(pid) : null
      } catch {
        priorAccrualId = null
      }
    }

    const row: Record<string, unknown> = {
      campaign_id: Number(campaignId),
      type: String(body.type ?? 'tentcard').trim(),
      name,
      quantity: Math.max(1, Number(body.quantity) || 1),
      unit_cost: parseNum(body.unitCost),
      actual_cost: parseNum(body.actualCost),
      branches: Array.isArray(body.branches) ? body.branches : [],
      is_hq_wide: Boolean(body.isHqWide),
      display_start_date: parseDate(body.displayStartDate),
      display_end_date: parseDate(body.displayEndDate),
      placement_spots: parsePlacementSpots(body.placementSpots),
      status: String(body.status ?? 'planning').trim(),
      note: String(body.note ?? '').trim(),
      updated_at: new Date().toISOString(),
    }

    let recordId = editingId || ''
    let expenseSyncMessage: string | undefined

    if (editingId) {
      const existing = (await supabaseSelectFilter(
        'marketing_materials',
        `id=eq.${encodeURIComponent(editingId)}`,
        { limit: 1 }
      )) as { id?: number }[] | null
      if (existing?.length) {
        await supabaseUpdateByFilter('marketing_materials', `id=eq.${editingId}`, row)
        recordId = editingId
      } else {
        return NextResponse.json({ success: false, message: '수정할 항목을 찾을 수 없습니다.' }, { headers })
      }
    } else {
      const inserted = (await supabaseInsert('marketing_materials', row)) as { id?: number }[]
      const created = Array.isArray(inserted) ? inserted[0] : inserted
      recordId = created?.id != null ? String(created.id) : ''
      if (!recordId) {
        return NextResponse.json({ success: false, message: '저장 후 ID를 확인할 수 없습니다.' }, { headers })
      }
    }

    const camp = await fetchCampaignMetaForExpenseMemo(campaignId)
    const topic = camp?.topic || ''
    const campaignNo = camp?.campaignNo || ''
    const actual = parseNum(body.actualCost)
    const expenseDate = body.displayEndDate
      ? String(body.displayEndDate).slice(0, 10)
      : body.displayStartDate
        ? String(body.displayStartDate).slice(0, 10)
        : ''

    const typeLabel = String(body.type ?? 'tentcard').trim()
    const sync = await syncMarketingExpenseAccrual({
      userRole,
      userName,
      campaignId,
      campaignTopic: topic,
      campaignNo,
      channel: 'material',
      recordId,
      amount: actual,
      expenseDate,
      dueDate: null,
      detailLine: `${typeLabel} · ${name}`.slice(0, 120),
      existingExpenseAccrualId: priorAccrualId,
    })

    expenseSyncMessage = sync.message
    if (sync.linkExpenseAccrualId !== undefined) {
      try {
        await supabaseUpdateByFilter('marketing_materials', `id=eq.${recordId}`, {
          expense_accrual_id: sync.linkExpenseAccrualId,
        })
      } catch (e) {
        if (!isColumnSchemaError(e)) throw e
        expenseSyncMessage =
          (expenseSyncMessage ? expenseSyncMessage + ' ' : '') +
          'DB에 actual_cost/expense_accrual_id 컬럼이 없습니다. sql/marketing_expense_accrual_link.sql 을 실행하세요.'
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: editingId ? '수정되었습니다.' : '저장되었습니다.',
        id: recordId,
        expenseSyncMessage,
      },
      { headers }
    )
  } catch (e) {
    console.error('marketingMaterials POST:', e)
    const msg = e instanceof Error ? e.message : '저장 실패'
    return NextResponse.json({ success: false, message: msg }, { headers })
  }
}
