import { NextRequest, NextResponse } from 'next/server'
import {
  assertStoreAccess,
  POS_TAX_INVOICE_SHARED_STORE_CODE,
  searchTaxInvoiceRecipients,
  upsertTaxInvoiceRecipient,
  type SearchBy,
} from '@/lib/pos-tax-invoice-recipients-server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import {
  canAccessPosOrder,
  canAccessPosOrders,
  canAccessPosSettlement,
  isFranchiseeRole,
  isOfficeRole,
} from '@/lib/permissions'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import { normalizedAllowedStoresFromJwt } from '@/lib/franchisee-multi-store'

async function franchiseeStoreAccessOpts(req: NextRequest): Promise<{ allowedStores?: string[] }> {
  const jwt = await tryVerifyBearerFromRequest(req)
  if (!jwt || !isFranchiseeRole(jwt.role || '')) return {}
  const list = normalizedAllowedStoresFromJwt(jwt)
  return list.length > 0 ? { allowedStores: list } : {}
}

const cors = () => {
  const h = new Headers()
  h.set('Access-Control-Allow-Origin', '*')
  return h
}

function parseBy(v: string | null): SearchBy {
  if (v === 'taxId' || v === 'name' || v === 'memberNo') return v
  return 'phone'
}

/** GET: 검색·목록 (POS·관리자) */
export async function GET(req: NextRequest) {
  const headers = cors()
  try {
    const { searchParams } = new URL(req.url)
    const userRole = String(searchParams.get('userRole') || '')
    const userStore = String(searchParams.get('userStore') || '').trim()
    const storeCode = String(searchParams.get('storeCode') || '').trim()
    const q = String(searchParams.get('q') || '').trim()
    const by = parseBy(searchParams.get('by'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50))

    if (!canAccessPosOrders(userRole) && !canAccessPosOrder(userRole)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
    }

    const accessOpts = await franchiseeStoreAccessOpts(req)
    const authorized =
      isOfficeRole(userRole) ||
      (!!storeCode && assertStoreAccess(userRole, userStore, storeCode, accessOpts))
    if (!authorized) {
      if (!storeCode) {
        return NextResponse.json({ success: false, message: 'storeCode가 필요합니다.' }, { status: 400, headers })
      }
      return NextResponse.json({ success: false, message: '매장 접근 권한이 없습니다.' }, { status: 403, headers })
    }

    const rows = await searchTaxInvoiceRecipients({
      globalPool: true,
      storeCode: storeCode || null,
      q,
      by,
      limit,
    })

    return NextResponse.json({ success: true, rows }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg }, { status: 500, headers })
  }
}

/** POST: upsert (결제 후·POS) */
export async function POST(req: NextRequest) {
  const headers = cors()
  try {
    const body = await req.json()
    const userRole = String(body.userRole || '')
    const userStore = String(body.userStore || '').trim()
    const storeCode = String(body.storeCode || '').trim()

    if (!canAccessPosOrder(userRole)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
    }
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode가 필요합니다.' }, { status: 400, headers })
    }
    const postAccessOpts = await franchiseeStoreAccessOpts(req)
    if (!assertStoreAccess(userRole, userStore, storeCode, postAccessOpts)) {
      return NextResponse.json({ success: false, message: '매장 접근 권한이 없습니다.' }, { status: 403, headers })
    }

    const customerType = body.customerType === 'company' ? 'company' : 'person'
    const taxId = String(body.taxId || '').replace(/\D/g, '')
    if (taxId.length !== 13) {
      return NextResponse.json({ success: false, message: 'Tax ID 13자리가 필요합니다.' }, { status: 400, headers })
    }

    const row = await upsertTaxInvoiceRecipient({
      storeCode,
      memberId: body.memberId != null ? Number(body.memberId) : null,
      memberNo: body.memberNo != null ? String(body.memberNo).trim() : null,
      customerType,
      name: String(body.name || ''),
      taxId,
      branchNo: String(body.branchNo || '').replace(/\D/g, '').slice(0, 5),
      phone: String(body.phone || ''),
      email: String(body.email || ''),
      address: String(body.address || ''),
      source: body.source != null ? String(body.source) : 'pos_payment',
    })

    return NextResponse.json({ success: true, row }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg }, { status: 500, headers })
  }
}

/** PATCH: 관리자 수정·비활성화 */
export async function PATCH(req: NextRequest) {
  const headers = cors()
  try {
    const body = await req.json()
    const userRole = String(body.userRole || '')
    const userStore = String(body.userStore || '').trim()
    const id = String(body.id || '').trim()

    if (!canAccessPosSettlement(userRole) && !isOfficeRole(userRole)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
    }
    if (!id) {
      return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { status: 400, headers })
    }

    const existing = (await supabaseSelectFilter(
      'pos_tax_invoice_recipients',
      `id=eq.${encodeURIComponent(id)}`,
      { limit: 1 }
    )) as { store_code: string }[]

    if (!Array.isArray(existing) || existing.length === 0) {
      return NextResponse.json({ success: false, message: '데이터가 없습니다.' }, { status: 404, headers })
    }
    const sc = existing[0].store_code
    const patchAccessOpts = await franchiseeStoreAccessOpts(req)
    if (
      sc !== POS_TAX_INVOICE_SHARED_STORE_CODE &&
      !assertStoreAccess(userRole, userStore, sc, patchAccessOpts)
    ) {
      return NextResponse.json({ success: false, message: '매장 접근 권한이 없습니다.' }, { status: 403, headers })
    }

    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { updated_at: now }
    if (typeof body.is_active === 'boolean') patch.is_active = body.is_active
    if (body.notes !== undefined) patch.notes = body.notes === null || body.notes === '' ? null : String(body.notes)
    if (body.name !== undefined) patch.name = String(body.name || '')
    if (body.taxId !== undefined) patch.tax_id = String(body.taxId || '').replace(/\D/g, '')
    if (body.branchNo !== undefined) patch.branch_no = String(body.branchNo || '').replace(/\D/g, '').slice(0, 5)
    if (body.phone !== undefined) {
      patch.phone = String(body.phone || '')
      patch.phone_normalized = String(body.phone || '').replace(/\D/g, '')
    }
    if (body.email !== undefined) patch.email = String(body.email || '')
    if (body.address !== undefined) patch.address = String(body.address || '')
    if (body.customerType !== undefined)
      patch.customer_type = body.customerType === 'company' ? 'company' : 'person'
    if (body.member_no !== undefined) patch.member_no = body.member_no ? String(body.member_no).trim() : null
    if (body.member_id !== undefined)
      patch.member_id =
        body.member_id != null && Number(body.member_id) > 0 ? Math.trunc(Number(body.member_id)) : null

    await supabaseUpdateByFilter('pos_tax_invoice_recipients', `id=eq.${encodeURIComponent(id)}`, patch)

    const rows = (await supabaseSelectFilter(
      'pos_tax_invoice_recipients',
      `id=eq.${encodeURIComponent(id)}`,
      { limit: 1 }
    )) as unknown[]

    return NextResponse.json({ success: true, row: Array.isArray(rows) ? rows[0] : null }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg }, { status: 500, headers })
  }
}
