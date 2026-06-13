import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  companyHybridDocVisibilityFromDocType,
  companyHybridDocVisibilityToDocType,
  isCompanyHybridDocVisibility,
  isCompanyHybridRelatedType,
} from '@/lib/company-hybrid-documents'
import { canViewCompanyHybridDocument, resolveCompanyHybridListScope } from '@/lib/company-hybrid-documents-access'
import {
  COMPANY_HYBRID_CORRESPONDENCE_DIRECTIONS,
  COMPANY_HYBRID_CORRESPONDENCE_STATUSES,
  documentHasCorrespondence,
} from '@/lib/company-hybrid-correspondence'
import {
  companyHybridDocExpiryFilterBounds,
  matchesCompanyHybridDocExpiryFilter,
  type CompanyHybridDocExpiryFilter,
} from '@/lib/company-hybrid-documents-expiry'

export const dynamic = 'force-dynamic'

const MAX_FETCH = 5000
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

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
    const scopeRes = resolveCompanyHybridListScope(auth, storeParam)
    if (!scopeRes.ok) {
      return NextResponse.json({ success: false, list: [], total: 0, message: scopeRes.message }, { status: 400, headers })
    }
    const listScope = scopeRes.scope

    const categoryIdRaw = String(searchParams.get('categoryId') || '').trim()
    const titleSearch = String(searchParams.get('searchTitle') || '').trim().slice(0, 200)
    const relatedType = String(searchParams.get('relatedType') || '').trim().toLowerCase()
    const relatedId = String(searchParams.get('relatedId') || '').trim().slice(0, 120)
    const sourceFilter = String(searchParams.get('source') || searchParams.get('sourceFilter') || '').trim().toLowerCase()
    const visibilityFilter = String(searchParams.get('visibility') || searchParams.get('visibilityFilter') || '')
      .trim()
      .toLowerCase()
    const expiryFilter = String(searchParams.get('expiryFilter') || 'all').trim().toLowerCase() as CompanyHybridDocExpiryFilter

    const offset = Math.max(0, Math.floor(Number(searchParams.get('offset') || 0)))
    const limitRaw = Math.floor(Number(searchParams.get('limit') || DEFAULT_LIMIT))
    const limit = Number.isFinite(limitRaw)
      ? Math.min(MAX_LIMIT, Math.max(1, limitRaw))
      : DEFAULT_LIMIT

    const filterParts =
      listScope.kind === 'all'
        ? ['deleted_at=is.null']
        : [`store=eq.${encodeURIComponent(listScope.store)}`, 'deleted_at=is.null']

    if (categoryIdRaw === 'none' || categoryIdRaw === '0' || categoryIdRaw === 'uncategorized') {
      filterParts.push('category_id=is.null')
    } else if (categoryIdRaw && /^\d+$/.test(categoryIdRaw)) {
      filterParts.push(`category_id=eq.${categoryIdRaw}`)
    }
    if (titleSearch) {
      const pat = `*${titleSearch.replace(/\*/g, ' ').trim().replace(/%/g, '')}*`
      if (pat.length > 2) {
        filterParts.push(`title=ilike.${encodeURIComponent(pat)}`)
      }
    }
    if (relatedType && isCompanyHybridRelatedType(relatedType) && relatedType !== 'none') {
      filterParts.push(`related_type=eq.${encodeURIComponent(relatedType)}`)
      if (relatedId) {
        filterParts.push(`related_id=eq.${encodeURIComponent(relatedId)}`)
      }
    } else if (relatedType === 'none') {
      filterParts.push('related_type=eq.none')
    }
    if (sourceFilter === 'drive' || sourceFilter === 'supabase') {
      filterParts.push(`source=eq.${sourceFilter}`)
    }
    if (isCompanyHybridDocVisibility(visibilityFilter)) {
      filterParts.push(`doc_type=eq.${encodeURIComponent(companyHybridDocVisibilityToDocType(visibilityFilter))}`)
    }

    const expiryBounds = companyHybridDocExpiryFilterBounds()
    if (expiryFilter === 'expired') {
      filterParts.push(`valid_to=lt.${expiryBounds.today}`)
    } else if (expiryFilter === 'expiring_soon') {
      filterParts.push(`valid_to=gte.${expiryBounds.today}`)
      filterParts.push(`valid_to=lte.${expiryBounds.soonEnd}`)
    } else if (expiryFilter === 'no_expiry') {
      filterParts.push('valid_to=is.null')
    }

    const corrPresence = String(searchParams.get('corrPresence') || '').trim().toLowerCase()

    const corrDirection = String(searchParams.get('corrDirection') || '').trim().toLowerCase()
    if (
      corrDirection &&
      (COMPANY_HYBRID_CORRESPONDENCE_DIRECTIONS as readonly string[]).includes(corrDirection)
    ) {
      filterParts.push(`metadata->correspondence->>direction=eq.${encodeURIComponent(corrDirection)}`)
    }

    const corrStatus = String(searchParams.get('corrStatus') || '').trim().toLowerCase()
    if (corrStatus && (COMPANY_HYBRID_CORRESPONDENCE_STATUSES as readonly string[]).includes(corrStatus)) {
      filterParts.push(`metadata->correspondence->>status=eq.${encodeURIComponent(corrStatus)}`)
    }

    const corrCounterpartySearch = String(searchParams.get('corrCounterpartySearch') || '').trim().slice(0, 120)
    if (corrCounterpartySearch) {
      const pat = `*${corrCounterpartySearch.replace(/\*/g, ' ').replace(/%/g, '')}*`
      if (pat.length > 2) {
        filterParts.push(`metadata->correspondence->>counterparty=ilike.${encodeURIComponent(pat)}`)
      }
    }

    const sortTitleRaw = String(searchParams.get('sortTitle') || '').trim().toLowerCase()
    const sortCreatedRaw = String(searchParams.get('sortCreated') || '').trim().toLowerCase()
    const sortValidToRaw = String(searchParams.get('sortValidTo') || '').trim().toLowerCase()
    const order =
      sortTitleRaw === 'asc'
        ? 'title.asc'
        : sortTitleRaw === 'desc'
          ? 'title.desc'
          : sortValidToRaw === 'asc'
            ? 'valid_to.asc.nullslast'
            : sortValidToRaw === 'desc'
              ? 'valid_to.desc.nullslast'
              : sortCreatedRaw === 'asc'
                ? 'created_at.asc'
                : 'created_at.desc'

    const rows = (await supabaseSelectFilter('company_hybrid_documents', filterParts.join('&'), {
      order,
      limit: MAX_FETCH,
    })) as Record<string, unknown>[]

    const truncated = (rows || []).length >= MAX_FETCH

    let visibleRows = (rows || []).filter((row) => {
      const rowStore = String((row as { store?: string | null }).store || '')
      const visibility = companyHybridDocVisibilityFromDocType((row as { doc_type?: string | null }).doc_type)
      return canViewCompanyHybridDocument(auth, rowStore, visibility)
    })

    if (expiryFilter !== 'all' && expiryFilter !== 'expired' && expiryFilter !== 'expiring_soon' && expiryFilter !== 'no_expiry') {
      // unknown — no extra filter
    } else if (expiryFilter === 'all') {
      // already handled in SQL for specific filters; for 'all' no filter
    } else if (expiryFilter !== 'no_expiry' && expiryFilter !== 'expired' && expiryFilter !== 'expiring_soon') {
      visibleRows = visibleRows.filter((row) =>
        matchesCompanyHybridDocExpiryFilter(
          (row as { valid_to?: string | null }).valid_to,
          expiryFilter,
          expiryBounds.today
        )
      )
    }

    const list =
      corrPresence === 'yes'
        ? visibleRows.filter((row) => documentHasCorrespondence((row as { metadata?: unknown }).metadata))
        : corrPresence === 'no'
          ? visibleRows.filter((row) => !documentHasCorrespondence((row as { metadata?: unknown }).metadata))
          : visibleRows

    const total = list.length
    const page = list.slice(offset, offset + limit)

    return NextResponse.json({ success: true, list: page, total, offset, limit, truncated }, { headers })
  } catch (e) {
    console.error('getCompanyHybridDocuments:', e)
    return NextResponse.json(
      {
        success: false,
        list: [],
        total: 0,
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500, headers }
    )
  }
}
