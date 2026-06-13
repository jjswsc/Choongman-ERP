import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  isCompanyHybridDocsListAllStoresParam,
  companyHybridDocVisibilityFromDocType,
} from '@/lib/company-hybrid-documents'
import {
  canViewCompanyHybridDocument,
  resolveCompanyHybridListScope,
} from '@/lib/company-hybrid-documents-access'
import { getBangkokTodayDateString, addBangkokCalendarDays } from '@/lib/bangkok-time'
import { COMPANY_HYBRID_DOC_EXPIRY_SOON_DAYS } from '@/lib/company-hybrid-documents-expiry'
import { documentHasCorrespondence } from '@/lib/company-hybrid-correspondence'

export const dynamic = 'force-dynamic'

type SummaryPayload = {
  today: string
  total: number
  expiring_soon: number
  expired: number
  corr_overdue: number
  stores: Array<{
    store: string
    total: number
    expiring_soon: number
    expired: number
    compliance_pct: number
  }>
}

async function fallbackSummary(storeParam: string, auth: Parameters<typeof canViewCompanyHybridDocument>[0]): Promise<SummaryPayload> {
  const today = getBangkokTodayDateString()
  const soonEnd = addBangkokCalendarDays(today, COMPANY_HYBRID_DOC_EXPIRY_SOON_DAYS)
  const filterParts = isCompanyHybridDocsListAllStoresParam(storeParam)
    ? ['deleted_at=is.null']
    : [`store=eq.${encodeURIComponent(storeParam)}`, 'deleted_at=is.null']
  const rows = (await supabaseSelectFilter('company_hybrid_documents', filterParts.join('&'), {
    limit: 5000,
  })) as Array<{
    store?: string
    valid_to?: string | null
    doc_type?: string | null
    metadata?: unknown
  }>

  const visible = (rows || []).filter((row) => {
    const rowStore = String(row.store || '')
    const visibility = companyHybridDocVisibilityFromDocType(row.doc_type)
    return canViewCompanyHybridDocument(auth, rowStore, visibility)
  })

  const byStore = new Map<string, { total: number; expiring_soon: number; expired: number }>()
  let corrOverdue = 0

  for (const row of visible) {
    const st = String(row.store || '')
    if (!byStore.has(st)) byStore.set(st, { total: 0, expiring_soon: 0, expired: 0 })
    const bucket = byStore.get(st)!
    bucket.total += 1

    const vt = row.valid_to ? String(row.valid_to).slice(0, 10) : ''
    if (vt) {
      if (vt < today) bucket.expired += 1
      else if (vt <= soonEnd) bucket.expiring_soon += 1
    }

    if (documentHasCorrespondence(row.metadata)) {
      const meta = row.metadata as { correspondence?: { replyDue?: string; status?: string } }
      const rd = meta.correspondence?.replyDue ? String(meta.correspondence.replyDue).slice(0, 10) : ''
      const stt = String(meta.correspondence?.status || '')
      if (rd && rd < today && stt !== 'replied' && stt !== 'filed') {
        corrOverdue += 1
      }
    }
  }

  let expiringSoon = 0
  let expired = 0
  const stores = [...byStore.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([store, s]) => {
      expiringSoon += s.expiring_soon
      expired += s.expired
      return {
        store,
        total: s.total,
        expiring_soon: s.expiring_soon,
        expired: s.expired,
        compliance_pct: s.total === 0 ? 100 : Math.round(((s.total - s.expired) / s.total) * 1000) / 10,
      }
    })

  return {
    today,
    total: visible.length,
    expiring_soon: expiringSoon,
    expired,
    corr_overdue: corrOverdue,
    stores,
  }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      const er = authResult.errorResponse
      er.headers.set('Access-Control-Allow-Origin', '*')
      return er
    }
    const auth = authResult.auth
    const { searchParams } = new URL(request.url)
    const storeParam = String(searchParams.get('store') || '').trim()
    const scopeRes = resolveCompanyHybridListScope(auth, storeParam || '__cm_all_stores__')
    if (!scopeRes.ok) {
      return NextResponse.json({ success: false, message: scopeRes.message }, { status: 400, headers })
    }
    const rpcStore =
      scopeRes.scope.kind === 'all' ? null : scopeRes.scope.store

    try {
      const raw = await supabaseRpc<SummaryPayload>('get_company_hybrid_documents_summary', {
        p_store: rpcStore,
      })
      if (raw && typeof raw === 'object' && 'total' in (raw as object)) {
        return NextResponse.json({ success: true, summary: raw }, { headers })
      }
    } catch {
      // RPC 미배포 — fallback
    }

    const summary = await fallbackSummary(
      scopeRes.scope.kind === 'all' ? '__cm_all_stores__' : scopeRes.scope.store,
      auth
    )
    return NextResponse.json({ success: true, summary }, { headers })
  } catch (e) {
    console.error('getCompanyHybridDocumentsSummary:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
