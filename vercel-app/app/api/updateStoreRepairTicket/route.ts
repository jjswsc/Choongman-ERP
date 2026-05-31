import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { lookupVendorNameByCode, resolveVendorCodeFromStore, resolveVendorCodeLoose } from '@/lib/vendor-code-policy'

function normalizePhotoUrls(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined
  if (Array.isArray(raw)) {
    return raw.map((u) => String(u || '').trim()).filter(Boolean)
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const j = JSON.parse(raw) as unknown
      if (Array.isArray(j)) return j.map((u) => String(u || '').trim()).filter(Boolean)
    } catch {
      return [raw.trim()]
    }
  }
  return []
}

/** 매장 수리·수선 신고 수정 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const rowOrId = String(body.rowOrId ?? body.id ?? '').trim()
    const data = body.dataStr ? JSON.parse(body.dataStr) : (body.data || body)

    if (!rowOrId) {
      return NextResponse.json({ success: false, message: '잘못된 행입니다.' }, { status: 400 })
    }

    const rows = (await supabaseSelectFilter('store_repair_tickets', `id=eq.${encodeURIComponent(rowOrId)}`, {
      limit: 1,
    })) as {
      id?: number
      started_at?: string | null
      completed_at?: string | null
      status?: string
    }[]
    const prev = rows?.[0]
    if (!prev) {
      return NextResponse.json({ success: false, message: '해당 건을 찾을 수 없습니다.' }, { status: 404 })
    }

    const nowIso = new Date().toISOString()
    const nextStatus = String(data.status ?? '').trim()
    const store = String(data.store || '').trim()
    const requestedVendorCodeLoose = await resolveVendorCodeLoose(
      data.vendorCode ?? data.vendor_code ?? data.vendorName ?? data.vendor_name
    )
    const requestedVendorCode =
      requestedVendorCodeLoose || (store ? await resolveVendorCodeFromStore(store) : '')
    const vendorName =
      (requestedVendorCode ? await lookupVendorNameByCode(requestedVendorCode) : '') ||
      String(data.vendorName ?? data.vendor_name ?? '').trim()
    const patch: Record<string, unknown> = {
      store_name: store,
      reporter: String(data.reporter || '').trim(),
      category: String(data.category || '').trim(),
      priority: String(data.priority || '').trim(),
      area: String(data.area || '').trim(),
      title: String(data.title || '').trim(),
      description: String(data.description || '').trim(),
      status: nextStatus || String(prev.status || '접수'),
      handler: String(data.handler || '').trim(),
      resolution_note: String(data.resolutionNote ?? data.resolution_note ?? '').trim(),
      vendor_name: vendorName,
      vendor_code: requestedVendorCode || null,
      estimated_cost: data.estimatedCost != null && data.estimatedCost !== '' ? Number(data.estimatedCost) : null,
      actual_cost: data.actualCost != null && data.actualCost !== '' ? Number(data.actualCost) : null,
    }

    const urls = normalizePhotoUrls(data.photoUrls ?? data.photo_urls)
    if (urls !== undefined) patch.photo_urls = urls

    if (data.startedAt !== undefined || data.started_at !== undefined) {
      const s = String(data.startedAt ?? data.started_at ?? '').trim()
      patch.started_at = s || null
    }
    if (data.completedAt !== undefined || data.completed_at !== undefined) {
      const s = String(data.completedAt ?? data.completed_at ?? '').trim()
      patch.completed_at = s || null
    }

    const st = String(patch.status || '')
    if (st === '진행중' && !prev.started_at && !patch.started_at) {
      patch.started_at = nowIso
    }
    if (st === '완료' && !prev.completed_at && !patch.completed_at) {
      patch.completed_at = nowIso
    }

    try {
      await supabaseUpdateByFilter('store_repair_tickets', `id=eq.${encodeURIComponent(rowOrId)}`, patch)
    } catch (e) {
      const msg = String(e || '').toLowerCase()
      if (!msg.includes('vendor_code')) throw e
      delete patch.vendor_code
      await supabaseUpdateByFilter('store_repair_tickets', `id=eq.${encodeURIComponent(rowOrId)}`, patch)
    }

    return NextResponse.json({ success: true, message: '수정되었습니다.' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('updateStoreRepairTicket:', msg)
    return NextResponse.json({ success: false, message: '수정 실패: ' + msg }, { status: 500 })
  }
}
