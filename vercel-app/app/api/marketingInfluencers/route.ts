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
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function parsePlatformLinks(val: unknown): Record<string, string> {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(val)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim()
    }
    return out
  }
  return {}
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

/** 인플루언서 목록 조회 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get('campaignId')?.trim()

    let filter = ''
    if (campaignId) filter = `campaign_id=eq.${encodeURIComponent(campaignId)}`

    const listLimit = 8000
    const rows = filter
      ? ((await supabaseSelectFilter('marketing_influencers', filter, {
          order: 'publish_date.desc.nullslast,id.desc',
          limit: listLimit,
        })) as Record<string, unknown>[])
      : ((await supabaseSelect('marketing_influencers', {
          order: 'publish_date.desc.nullslast,id.desc',
          limit: listLimit,
        })) as Record<string, unknown>[])

    const base = (rows || []).map((row) => ({
      id: String(row.id ?? ''),
      campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
      name: String(row.name ?? ''),
      followers: String(row.followers ?? ''),
      contentFormat: String(row.content_format ?? ''),
      contentTopic: String(row.content_topic ?? ''),
      status: String(row.status ?? 'finish'),
      branchReview: String(row.branch_review ?? ''),
      hireType: String(row.hire_type ?? 'pay'),
      budget: parseNum(row.budget),
      actualCost: parseNum(row.actual_cost),
      shootingDate: row.shooting_date ? parseDate(row.shooting_date) : null,
      publishDate: row.publish_date ? parseDate(row.publish_date) : null,
      platformLinks: parsePlatformLinks(row.platform_links),
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
    console.error('marketingInfluencers GET:', e)
    return NextResponse.json([], { headers })
  }
}

/** 인플루언서 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as {
      id?: string
      campaignId?: string | null
      name?: string
      followers?: string
      contentFormat?: string
      contentTopic?: string
      status?: string
      branchReview?: string
      hireType?: string
      budget?: number
      actualCost?: number
      shootingDate?: string | null
      publishDate?: string | null
      platformLinks?: Record<string, string>
      note?: string
      userRole?: string
      userName?: string
      user_role?: string
      user_name?: string
    }

    const name = String(body.name ?? '').trim()
    const editingId = body.id?.trim()
    const campaignId = String(body.campaignId ?? '').trim()
    const userRole = String(body.userRole ?? body.user_role ?? '')
    const userName = String(body.userName ?? body.user_name ?? '').trim()

    if (!name) {
      return NextResponse.json(
        { success: false, message: '이름이 필요합니다.' },
        { headers }
      )
    }
    if (!campaignId) {
      return NextResponse.json(
        { success: false, message: '캠페인 선택은 필수입니다. 캠페인 허브에서 먼저 등록·선택해 주세요.' },
        { headers }
      )
    }

    let priorAccrualId: number | null = null
    if (editingId) {
      try {
        const prev = (await supabaseSelectFilter(
          'marketing_influencers',
          `id=eq.${encodeURIComponent(editingId)}`,
          { limit: 1, select: 'id,expense_accrual_id' }
        )) as { expense_accrual_id?: number | null }[] | null
        const pid = prev?.[0]?.expense_accrual_id
        priorAccrualId = pid != null && Number(pid) > 0 ? Number(pid) : null
      } catch {
        priorAccrualId = null
      }
    }

    const platformLinks = body.platformLinks && typeof body.platformLinks === 'object'
      ? body.platformLinks
      : {}

    const row: Record<string, unknown> = {
      campaign_id: Number(campaignId),
      name,
      followers: String(body.followers ?? '').trim(),
      content_format: String(body.contentFormat ?? '').trim(),
      content_topic: String(body.contentTopic ?? '').trim(),
      status: String(body.status ?? 'finish').trim(),
      branch_review: String(body.branchReview ?? '').trim(),
      hire_type: String(body.hireType ?? 'pay').trim(),
      budget: parseNum(body.budget),
      actual_cost: parseNum(body.actualCost),
      shooting_date: body.shootingDate ? parseDate(body.shootingDate) : null,
      publish_date: body.publishDate ? parseDate(body.publishDate) : null,
      platform_links: platformLinks,
      note: String(body.note ?? '').trim(),
    }

    let recordId = editingId || ''
    let expenseSyncMessage: string | undefined

    if (editingId) {
      const existing = (await supabaseSelectFilter(
        'marketing_influencers',
        `id=eq.${encodeURIComponent(editingId)}`,
        { limit: 1 }
      )) as { id?: number }[] | null
      if (existing?.length) {
        await supabaseUpdateByFilter('marketing_influencers', `id=eq.${editingId}`, row)
        recordId = editingId
      } else {
        return NextResponse.json({ success: false, message: '수정할 항목을 찾을 수 없습니다.' }, { headers })
      }
    } else {
      const inserted = (await supabaseInsert('marketing_influencers', row)) as { id?: number }[]
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
    const expenseDate = body.publishDate
      ? String(body.publishDate).slice(0, 10)
      : body.shootingDate
        ? String(body.shootingDate).slice(0, 10)
        : ''

    const sync = await syncMarketingExpenseAccrual({
      userRole,
      userName,
      campaignId,
      campaignTopic: topic,
      campaignNo,
      channel: 'influencer',
      recordId,
      amount: actual,
      expenseDate,
      dueDate: null,
      detailLine: name,
      existingExpenseAccrualId: priorAccrualId,
    })

    expenseSyncMessage = sync.message
    if (sync.linkExpenseAccrualId !== undefined) {
      try {
        await supabaseUpdateByFilter('marketing_influencers', `id=eq.${recordId}`, {
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
    console.error('marketingInfluencers POST:', e)
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '저장 실패' }, { headers })
  }
}
