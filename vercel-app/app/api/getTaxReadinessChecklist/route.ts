import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { getBangkokDateRangeUtc, getBangkokMonthRange } from '@/lib/bangkok-time'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

const BASE_LIMIT = 50000
const SOURCE_TYPES = ['bank_transaction', 'petty_cash', 'card_transaction', 'store_purchase', 'pos_order'] as const
type SourceType = (typeof SOURCE_TYPES)[number]

type JournalEntryRow = {
  source_type?: string | null
  source_id?: number | null
  accounting_date?: string | null
}

type SimpleIdRow = { id?: number | null }
type OrderIdRow = { order_id?: number | null }
type PosOrderRow = { id?: number | null; created_at?: string | null }

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').slice(0, 10))
}

function getYearMonth(value: string): string {
  const ymd = String(value || '').slice(0, 10)
  return isYmd(ymd) ? ymd.slice(0, 7) : ''
}

function toBangkokYmd(iso: string | null | undefined): string {
  const raw = String(iso || '').trim()
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

function summarizeCoverage(sourceIds: number[], journalRows: JournalEntryRow[], sourceType: SourceType) {
  const sourceSet = new Set(sourceIds.filter((id) => Number.isFinite(id) && id > 0))
  const journalMap = new Map<number, JournalEntryRow[]>()

  for (const row of journalRows) {
    if (String(row.source_type || '') !== sourceType) continue
    const sid = Number(row.source_id || 0)
    if (!sid) continue
    const arr = journalMap.get(sid) || []
    arr.push(row)
    journalMap.set(sid, arr)
  }

  let missing = 0
  let multi = 0
  const missingIds: number[] = []
  const multiIds: number[] = []

  for (const sid of sourceSet) {
    const rows = journalMap.get(sid) || []
    if (rows.length === 0) {
      missing += 1
      if (missingIds.length < 20) missingIds.push(sid)
      continue
    }
    if (rows.length > 1) {
      multi += 1
      if (multiIds.length < 20) multiIds.push(sid)
    }
  }

  return {
    sourceCount: sourceSet.size,
    journalLinkedCount: sourceSet.size - missing,
    missingJournalCount: missing,
    multiJournalSourceCount: multi,
    sampleMissingSourceIds: missingIds,
    sampleMultiSourceIds: multiIds,
  }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    authResult.errorResponse.headers.set('Cache-Control', 'no-store')
    return authResult.errorResponse
  }

  const { searchParams } = new URL(request.url)
  const userRole = String(authResult.auth.role || '').trim()
  const yearMonthInput = String(searchParams.get('yearMonth') || '').trim()
  const requestedStoreFilter = String(searchParams.get('storeFilter') || '').trim()
  const allowedStores =
    (Array.isArray(authResult.auth.allowedStores) ? authResult.auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(String(authResult.auth.store || '').trim())
  const isOfficeLevel = isOfficeRole(userRole) || isAccountingRole(userRole)
  let normalizedStore = requestedStoreFilter && requestedStoreFilter !== 'All' ? requestedStoreFilter : ''
  if (!isOfficeLevel) {
    if (!normalizedStore) {
      normalizedStore = String(allowedStores[0] || '').trim()
      if (!normalizedStore) {
        return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, normalizedStore))
      if (!allowed) {
        return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    }
  }

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const { yearMonth, startStr, endStr } = getBangkokMonthRange(yearMonthInput)
    const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)

    const storeLike = normalizedStore ? `&store=ilike.${encodeURIComponent(normalizedStore)}` : ''
    const storeNameLike = normalizedStore ? `&store_name=ilike.${encodeURIComponent(normalizedStore)}` : ''
    const storeCodeLike = normalizedStore ? `&store_code=ilike.${encodeURIComponent(normalizedStore)}` : ''
    const vendorTargetLike = normalizedStore ? `&vendor_target=ilike.${encodeURIComponent(normalizedStore)}` : ''

    const journalFilter =
      `accounting_date=gte.${startStr}&accounting_date=lte.${endStr}` +
      `&source_type=in.(${SOURCE_TYPES.join(',')})` +
      storeNameLike

    const [bankRows, pettyRows, cardRows, purchaseRows, salesRows, journalRows] = await Promise.all([
      supabaseSelectFilter(
        'bank_transactions',
        `trans_date=gte.${startStr}&trans_date=lte.${endStr}${storeLike}`,
        { select: 'id', limit: BASE_LIMIT }
      ) as Promise<SimpleIdRow[] | null>,
      supabaseSelectFilter(
        'petty_cash_transactions',
        `trans_date=gte.${startStr}&trans_date=lte.${endStr}${storeLike}`,
        { select: 'id', limit: BASE_LIMIT }
      ) as Promise<SimpleIdRow[] | null>,
      supabaseSelectFilter('card_transactions', `trans_date=gte.${startStr}&trans_date=lte.${endStr}`, {
        select: 'id',
        limit: BASE_LIMIT,
      }) as Promise<SimpleIdRow[] | null>,
      supabaseSelectFilter(
        'stock_logs',
        `log_type=eq.Outbound&is_deleted=is.false&location=eq.${encodeURIComponent('본사')}&order_id=not.is.null&log_date=gte.${startStr}&log_date=lte.${endStr}${vendorTargetLike}`,
        { select: 'order_id', limit: BASE_LIMIT }
      ) as Promise<OrderIdRow[] | null>,
      supabaseSelectFilter(
        'pos_orders',
        `status=eq.completed&created_at=gte.${encodeURIComponent(dayStartUtcIso)}&created_at=lt.${encodeURIComponent(nextDayStartUtcIso)}${storeCodeLike}`,
        { select: 'id,created_at', limit: BASE_LIMIT }
      ) as Promise<PosOrderRow[] | null>,
      supabaseSelectFilter('journal_entries', journalFilter, {
        select: 'source_type,source_id,accounting_date',
        limit: BASE_LIMIT,
      }) as Promise<JournalEntryRow[] | null>,
    ])

    const bankIds = (bankRows || []).map((r) => Number(r.id || 0)).filter((id) => id > 0)
    const pettyIds = (pettyRows || []).map((r) => Number(r.id || 0)).filter((id) => id > 0)
    const cardIds = (cardRows || []).map((r) => Number(r.id || 0)).filter((id) => id > 0)
    const purchaseIds = Array.from(new Set((purchaseRows || []).map((r) => Number(r.order_id || 0)).filter((id) => id > 0)))
    const sales = (salesRows || [])
      .map((r) => ({ id: Number(r.id || 0), createdAt: String(r.created_at || '') }))
      .filter((r) => r.id > 0)
    const salesIds = sales.map((r) => r.id)
    const journals = journalRows || []

    const bankCoverage = summarizeCoverage(bankIds, journals, 'bank_transaction')
    const pettyCoverage = summarizeCoverage(pettyIds, journals, 'petty_cash')
    const cardCoverage = summarizeCoverage(cardIds, journals, 'card_transaction')
    const purchaseCoverage = summarizeCoverage(purchaseIds, journals, 'store_purchase')
    const salesCoverage = summarizeCoverage(salesIds, journals, 'pos_order')

    const posJournalBySource = new Map<number, JournalEntryRow[]>()
    for (const row of journals) {
      if (String(row.source_type || '') !== 'pos_order') continue
      const sid = Number(row.source_id || 0)
      if (!sid) continue
      const arr = posJournalBySource.get(sid) || []
      arr.push(row)
      posJournalBySource.set(sid, arr)
    }

    let salesMonthMismatchCount = 0
    const salesMonthMismatchIds: number[] = []
    for (const sale of sales) {
      const sourceMonth = getYearMonth(toBangkokYmd(sale.createdAt))
      if (!sourceMonth) continue
      const linked = posJournalBySource.get(sale.id) || []
      if (!linked.length) continue
      const mismatch = linked.every((j) => getYearMonth(String(j.accounting_date || '')) !== sourceMonth)
      if (mismatch) {
        salesMonthMismatchCount += 1
        if (salesMonthMismatchIds.length < 20) salesMonthMismatchIds.push(sale.id)
      }
    }

    const criticalIssues =
      cardCoverage.missingJournalCount + purchaseCoverage.missingJournalCount + salesCoverage.missingJournalCount
    const warningIssues =
      bankCoverage.missingJournalCount +
      pettyCoverage.missingJournalCount +
      bankCoverage.multiJournalSourceCount +
      pettyCoverage.multiJournalSourceCount +
      salesMonthMismatchCount

    return NextResponse.json(
      {
        period: { yearMonth, startDate: startStr, endDate: endStr, storeFilter: normalizedStore || 'All' },
        limits: {
          sourceLimit: BASE_LIMIT,
          hit: {
            bank: (bankRows || []).length >= BASE_LIMIT,
            petty: (pettyRows || []).length >= BASE_LIMIT,
            card: (cardRows || []).length >= BASE_LIMIT,
            purchase: (purchaseRows || []).length >= BASE_LIMIT,
            sales: (salesRows || []).length >= BASE_LIMIT,
            journal: journals.length >= BASE_LIMIT,
          },
        },
        domains: {
          bank: bankCoverage,
          pettyCash: pettyCoverage,
          cardExpense: cardCoverage,
          purchase: purchaseCoverage,
          sales: {
            ...salesCoverage,
            monthMismatchCount: salesMonthMismatchCount,
            sampleMonthMismatchSourceIds: salesMonthMismatchIds,
          },
        },
        score: {
          criticalIssues,
          warningIssues,
        },
        recommendations: [
          cardCoverage.missingJournalCount > 0
            ? '카드지출(card_transactions) 분개 자동생성 또는 월말 백필을 우선 적용하세요.'
            : null,
          salesMonthMismatchCount > 0
            ? 'POS 완료 분개일(accounting_date)과 주문일(created_at)의 귀속월 규칙을 통일하세요.'
            : null,
          bankCoverage.multiJournalSourceCount > 0 || pettyCoverage.multiJournalSourceCount > 0
            ? '통장/패티의 일반등록과 지출·매입 연결 API 혼용으로 인한 중복분개 여부를 점검하세요.'
            : null,
          purchaseCoverage.missingJournalCount > 0
            ? '매입(수령) 소스(order_id)와 store_purchase 분개 매핑 누락을 백필로 해소하세요.'
            : null,
        ].filter(Boolean),
      },
      { headers }
    )
  } catch (e) {
    console.error('getTaxReadinessChecklist:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

