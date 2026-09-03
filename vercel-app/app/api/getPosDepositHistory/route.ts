import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilterStrippingUnknownColumns } from '@/lib/supabase-pgrst204-retry'
import { requireAuth } from '@/lib/verify-auth'
import { posApiCorsHeaders } from '@/lib/pos-api-write-auth'
import { memberPhoneLookupVariants, canonicalMemberPhoneForStorage } from '@/lib/member-phone-lookup'
import { posDepositBalanceFromLedger } from '@/lib/pos-deposit-domain'
import { appendSaasTenantFilter, resolveSaasTenantScope } from '@/lib/saas-tenant-scope'

export async function GET(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    const authResult = await requireAuth(req, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth!
    const { searchParams } = new URL(req.url)
    const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
    const memberId = Math.trunc(Number(searchParams.get('memberId') || 0) || 0)
    const phoneRaw = String(searchParams.get('phone') || '').trim()
    const orderId = Math.trunc(Number(searchParams.get('orderId') || 0) || 0)
    const limit = Math.min(200, Math.max(1, Math.trunc(Number(searchParams.get('limit') || 50) || 50)))

    const tenantScope = await resolveSaasTenantScope({
      auth: { tenantId: auth.tenantId, company: auth.company },
      storeCode: storeCode || null,
    })

    const parts: string[] = []
    if (orderId > 0) parts.push(`pos_order_id=eq.${orderId}`)
    if (memberId > 0) parts.push(`member_id=eq.${memberId}`)
    if (phoneRaw) {
      const canonical = canonicalMemberPhoneForStorage(phoneRaw)
      const variants = memberPhoneLookupVariants(phoneRaw)
      const phones = Array.from(new Set([canonical, ...variants].filter(Boolean)))
      if (phones.length === 1) {
        parts.push(`guest_phone=eq.${encodeURIComponent(phones[0]!)}`)
      } else if (phones.length > 1) {
        const or = phones.map((p) => `guest_phone.eq.${encodeURIComponent(p)}`).join(',')
        parts.push(`or=(${or})`)
      }
    }
    if (storeCode) parts.push(`store_code=ilike.${encodeURIComponent(storeCode)}`)
    if (parts.length === 0) {
      return NextResponse.json({ success: false, message: 'phone_or_member_required' }, { headers })
    }

    const filter = appendSaasTenantFilter(parts.join('&'), tenantScope, 'pos_deposit_ledger')
    const rows = (await supabaseSelectFilterStrippingUnknownColumns(
      'pos_deposit_ledger',
      filter,
      {
        select: 'id,created_at,store_code,pos_order_id,member_id,guest_phone,guest_name,kind,amount,tender,memo',
        order: 'created_at.desc',
        limit,
      },
      'getPosDepositHistory'
    )) as Record<string, unknown>[] | null

    const orderIds = Array.from(
      new Set((rows || []).map((r) => Math.trunc(Number(r.pos_order_id) || 0)).filter((n) => n > 0))
    )
    const orderNoById = new Map<number, string>()
    if (orderIds.length) {
      const orderRows = (await supabaseSelectFilterStrippingUnknownColumns(
        'pos_orders',
        `id=in.(${orderIds.join(',')})`,
        { select: 'id,order_no', limit: orderIds.length },
        'getPosDepositHistory/orders'
      )) as { id?: number; order_no?: string }[] | null
      for (const o of orderRows || []) {
        const id = Number(o.id || 0)
        if (id > 0) orderNoById.set(id, String(o.order_no ?? ''))
      }
    }

    const heldBalance = posDepositBalanceFromLedger(rows || [])
    return NextResponse.json(
      {
        success: true,
        heldBalance,
        rows: (rows || []).map((r) => ({
          id: Number(r.id || 0),
          createdAt: String(r.created_at ?? ''),
          storeCode: String(r.store_code ?? ''),
          posOrderId: Number(r.pos_order_id || 0),
          orderNo: orderNoById.get(Number(r.pos_order_id || 0)) || '',
          kind: String(r.kind ?? ''),
          amount: Number(r.amount || 0),
          tender: String(r.tender ?? ''),
          memo: String(r.memo ?? ''),
          guestPhone: String(r.guest_phone ?? ''),
          guestName: String(r.guest_name ?? ''),
          memberId: Number(r.member_id || 0) || undefined,
        })),
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosDepositHistory:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'history_failed', rows: [] },
      { headers }
    )
  }
}
