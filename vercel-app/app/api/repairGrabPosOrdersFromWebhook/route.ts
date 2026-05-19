import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { extractGrabOrderIdFromMemo } from '@/lib/grab-order-memo'
import { buildGrabPosOrderSnapshot } from '@/lib/grab-order-to-pos'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

type PosOrderRow = {
  id?: number
  store_code?: string
  memo?: string
  status?: string
  total?: number
  items_json?: string
}

type GrabWebhookEventRow = {
  id?: number
  payload_json?: unknown
  received_at?: string
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  if (typeof value === 'object') return value as Record<string, unknown>
  return null
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const authResult = await requireAuth(request, 'office')
    if (authResult.errorResponse) {
      const res = authResult.errorResponse
      res.headers.set('Access-Control-Allow-Origin', '*')
      return res
    }

    const body = (await request.json().catch(() => ({}))) as {
      days?: number
      limit?: number
      storeCode?: string
      dryRun?: boolean
    }
    const days = Number.isFinite(Number(body.days)) ? Math.max(1, Math.trunc(Number(body.days))) : 2
    const limit = Number.isFinite(Number(body.limit))
      ? Math.min(1000, Math.max(1, Math.trunc(Number(body.limit))))
      : 200
    const storeCode = String(body.storeCode ?? '').trim()
    /** 기본 dry-run: body 생략 시 DB 미변경. 실제 반영은 `"dryRun": false` 명시 */
    const dryRun = body.dryRun !== false

    const statusFilter = 'status=in.(pending,cooking,preparing,ready)'
    const baseFilters = [
      statusFilter,
      `created_at=gte.${encodeURIComponent(new Date(Date.now() - days * 86400_000).toISOString())}`,
    ]
    if (storeCode) baseFilters.push(`store_code=eq.${encodeURIComponent(storeCode)}`)
    const orderRows = (await supabaseSelectFilter('pos_orders', baseFilters.join('&'), {
      limit: Math.min(1000, limit * 3),
      order: 'created_at.desc',
      select: 'id,store_code,memo,status,total,items_json,delivery_app_code',
    })) as (PosOrderRow & { delivery_app_code?: string })[] | null

    const rows = (orderRows || [])
      .filter((row) => {
        const memo = String(row.memo ?? '')
        if (extractGrabOrderIdFromMemo(memo)) return true
        return String(row.delivery_app_code ?? '').trim().toLowerCase() === 'grab'
      })
      .slice(0, limit)
    let scanned = 0
    let updated = 0
    let skipped = 0
    let failed = 0
    const details: string[] = []
    const actor = [authResult.auth.name, authResult.auth.employeeCode].filter(Boolean).join(' ').trim()

    for (const row of rows) {
      scanned += 1
      const id = Number(row.id ?? 0)
      if (!id) {
        skipped += 1
        continue
      }
      const memo = String(row.memo ?? '')
      const grabOrderId = extractGrabOrderIdFromMemo(memo)
      if (!grabOrderId) {
        skipped += 1
        details.push(`skip#${id}:missing_grab_order_id`)
        continue
      }
      try {
        const evRows = (await supabaseSelectFilter(
          'pos_grab_webhook_events',
          `event_kind=eq.submit_order&order_id=eq.${encodeURIComponent(grabOrderId)}`,
          {
            limit: 1,
            order: 'received_at.desc',
            select: 'id,payload_json,received_at',
          }
        )) as GrabWebhookEventRow[] | null
        const event = evRows?.[0]
        const payload = parseObject(event?.payload_json)
        if (!payload) {
          skipped += 1
          details.push(`skip#${id}:missing_payload`)
          continue
        }

        const snapshot = await buildGrabPosOrderSnapshot(payload)
        if (!snapshot.items.length) {
          skipped += 1
          details.push(`skip#${id}:no_items`)
          continue
        }

        const nextItemsJson = JSON.stringify(snapshot.items)
        const oldItemsJson = String(row.items_json ?? '')
        const oldTotal = round2(Number(row.total ?? 0))
        const nextTotal = round2(snapshot.total)
        const changed = oldItemsJson !== nextItemsJson || Math.abs(oldTotal - nextTotal) > 0.009
        if (!changed) {
          skipped += 1
          continue
        }

        if (!dryRun) {
          const stamp = `[GRAB_REPAIR ${new Date().toISOString()}${actor ? ` ${actor}` : ''}] rebuilt from webhook payload`
          const nextMemo = memo ? `${memo}\n${stamp}` : stamp
          await supabaseUpdateByFilter('pos_orders', `id=eq.${id}`, {
            items_json: nextItemsJson,
            subtotal: snapshot.subtotal,
            discount_amt: snapshot.discountAmt,
            delivery_fee: snapshot.deliveryFee,
            packaging_fee: snapshot.packagingFee,
            vat: snapshot.vat,
            total: snapshot.total,
            payment_cash: snapshot.paymentCash,
            payment_delivery_app: snapshot.paymentDeliveryApp,
            memo: nextMemo,
          })
        }
        updated += 1
      } catch (e) {
        failed += 1
        details.push(`fail#${id}:${String(e instanceof Error ? e.message : e)}`)
      }
    }

    return NextResponse.json(
      {
        success: true,
        dryRun,
        scanned,
        updated,
        skipped,
        failed,
        details: details.slice(0, 50),
      },
      { headers }
    )
  } catch (e) {
    console.error('repairGrabPosOrdersFromWebhook:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'failed' },
      { status: 500, headers }
    )
  }
}

