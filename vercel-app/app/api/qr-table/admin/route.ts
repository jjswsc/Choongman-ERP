import { NextRequest, NextResponse } from 'next/server'
import {
  deleteBuffetTier,
  ensureQrTokensForTables,
  listQrTokensForStore,
  loadBuffetTiersForStore,
  loadQrOrderStoreSettings,
  saveBuffetTier,
  upsertQrOrderStoreSettings,
} from '@/lib/qr-table-server'
import { requirePosStoreWriteAuth, posApiCorsHeaders, applyPosApiCors } from '@/lib/pos-api-write-auth'
import { requireAuth } from '@/lib/verify-auth'
import type { QrOrderMode, QrPaymentMode } from '@/lib/qr-table-types'

export async function OPTIONS() {
  return applyPosApiCors(new NextResponse(null, { status: 204, headers: posApiCorsHeaders() }))
}

export async function GET(req: NextRequest) {
  const headers = posApiCorsHeaders()
  const authResult = await requireAuth(req, 'any')
  if (authResult.errorResponse) return applyPosApiCors(authResult.errorResponse)

  const storeCode = String(req.nextUrl.searchParams.get('storeCode') || '').trim()
  if (!storeCode) {
    return applyPosApiCors(NextResponse.json({ success: false, message: 'store_required' }, { status: 400, headers }))
  }
  const write = await requirePosStoreWriteAuth(req, storeCode, headers)
  if (!write.ok) return write.response

  const settings = await loadQrOrderStoreSettings(storeCode)
  const tiers = await loadBuffetTiersForStore(storeCode, { includeInactive: true, withMenus: true })
  const tokens = await listQrTokensForStore(storeCode, req.nextUrl.origin)
  return applyPosApiCors(NextResponse.json({ success: true, settings, tiers, tokens }, { headers }))
}

export async function PUT(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    const body = (await req.json()) as Record<string, unknown>
    const storeCode = String(body.storeCode || '').trim()
    const write = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!write.ok) return write.response

    const settings = await upsertQrOrderStoreSettings({
      storeCode,
      enabled: Boolean(body.enabled),
      mode: (String(body.mode || 'buffet') as QrOrderMode) || 'buffet',
      entryPaymentMode: (String(body.entryPaymentMode || 'postpay') as QrPaymentMode) || 'postpay',
      extrasPaymentMode: (String(body.extrasPaymentMode || 'postpay') as QrPaymentMode) || 'postpay',
      requireStaffOpen: body.requireStaffOpen !== false,
      maxOpenMinutes: Number(body.maxOpenMinutes || 240),
      allowReorderAfterPaid: Boolean(body.allowReorderAfterPaid),
    })
    return applyPosApiCors(NextResponse.json({ success: true, settings }, { headers }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return applyPosApiCors(NextResponse.json({ success: false, message: msg }, { status: 400, headers }))
  }
}

export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    const body = (await req.json()) as Record<string, unknown>
    const action = String(body.action || '').trim()
    const storeCode = String(body.storeCode || '').trim()
    const write = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!write.ok) return write.response

    if (action === 'saveTier') {
      const tier = await saveBuffetTier({
        id: body.id != null ? Number(body.id) : undefined,
        storeCode,
        code: String(body.code || ''),
        nameTh: String(body.nameTh || ''),
        nameEn: String(body.nameEn || ''),
        nameKo: String(body.nameKo || ''),
        pricePerPerson: Number(body.pricePerPerson || 0),
        sortOrder: Number(body.sortOrder || 0),
        active: body.active !== false,
        validFrom: body.validFrom != null ? String(body.validFrom) : null,
        validTo: body.validTo != null ? String(body.validTo) : null,
        includedMenuIds: Array.isArray(body.includedMenuIds)
          ? (body.includedMenuIds as unknown[]).map((x) => Number(x))
          : undefined,
      })
      return applyPosApiCors(NextResponse.json({ success: true, tier }, { headers }))
    }

    if (action === 'deleteTier') {
      await deleteBuffetTier(Number(body.tierId || 0))
      return applyPosApiCors(NextResponse.json({ success: true }, { headers }))
    }

    if (action === 'generateTokens') {
      const tableNames = Array.isArray(body.tableNames)
        ? (body.tableNames as unknown[]).map((x) => String(x))
        : []
      const tokens = await ensureQrTokensForTables({
        storeCode,
        tableNames,
        origin: req.nextUrl.origin,
      })
      return applyPosApiCors(NextResponse.json({ success: true, tokens }, { headers }))
    }

    return applyPosApiCors(NextResponse.json({ success: false, message: 'unknown_action' }, { status: 400, headers }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return applyPosApiCors(NextResponse.json({ success: false, message: msg }, { status: 400, headers }))
  }
}
