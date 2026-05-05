import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'

function nowBangkokIso(): string {
  const dtf = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = dtf.formatToParts(new Date())
  const pick = (type: string) => parts.find((p) => p.type === type)?.value || '00'
  const y = pick('year')
  const m = pick('month')
  const d = pick('day')
  const hh = pick('hour')
  const mm = pick('minute')
  const ss = pick('second')
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}+07:00`
}

/** POS 주문 라인별 서빙/취소 상태 저장 (items_json servedAt/cancelledAt 등) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { headers })
    }
    const id = Number(body?.id)
    const itemId = String(body?.itemId ?? '').trim()
    const served = body?.served === true
    const servedBy = String(body?.servedBy ?? '').trim()
    const cancelled = body?.cancelled === true
    const cancelledBy = String(body?.cancelledBy ?? '').trim()
    const cancelReason = String(body?.cancelReason ?? '').trim()

    if (!id || Number.isNaN(id) || !itemId) {
      return NextResponse.json({ success: false, message: 'id, itemId required' }, { headers })
    }

    const rows = (await supabaseSelectFilter(
      'pos_orders',
      `id=eq.${id}`,
      { limit: 1, select: 'id,status,items_json' }
    )) as { id?: number; status?: string; items_json?: string }[] | null

    if (!rows?.length) {
      return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { headers })
    }

    const status = String(rows[0]?.status ?? '').toLowerCase()
    if (status === 'cancelled') {
      return NextResponse.json({ success: false, message: '취소 주문은 변경할 수 없습니다.' }, { headers })
    }

    let items: Array<Record<string, unknown>> = []
    try {
      const parsed = JSON.parse(rows[0]?.items_json || '[]')
      items = Array.isArray(parsed) ? parsed : []
    } catch {
      items = []
    }

    let idx = items.findIndex((it) => String(it?.id ?? '') === itemId)
    /** `pos-store` `normalizePosOrderItemsForUi`: DB에 id가 비어 있으면 UI는 `line-{배열순번}`을 씀 → id 매칭 실패 방지 */
    if (idx < 0) {
      const indexMatch = /^line-(\d+)$/.exec(itemId)
      if (indexMatch) {
        const n = Number(indexMatch[1])
        if (Number.isInteger(n) && n >= 0 && n < items.length) idx = n
      }
    }
    if (idx < 0) {
      return NextResponse.json({ success: false, message: '주문 항목을 찾을 수 없습니다.' }, { headers })
    }

    const target = { ...(items[idx] || {}) }
    if (cancelled) {
      target.cancelledAt = String(target.cancelledAt || nowBangkokIso())
      if (cancelledBy) target.cancelledBy = cancelledBy
      if (cancelReason) target.cancelReason = cancelReason
      // 취소 항목은 서빙/포장 완료 카운트에서 제외
      target.servedAt = null
      target.servedBy = null
    } else {
      if (body && Object.prototype.hasOwnProperty.call(body, 'cancelled')) {
        target.cancelledAt = null
        target.cancelledBy = null
        target.cancelReason = null
      }
      if (served) {
        target.servedAt = String(target.servedAt || nowBangkokIso())
        if (servedBy) target.servedBy = servedBy
      } else {
        target.servedAt = null
        target.servedBy = null
      }
    }
    items[idx] = target

    await supabaseUpdate('pos_orders', id, {
      items_json: JSON.stringify(items),
    })

    const activeItems = items.filter((it) => !String(it?.cancelledAt ?? '').trim())
    const servedCount = activeItems.filter((it) => Boolean(String(it?.servedAt ?? '').trim())).length
    const cancelledCount = items.length - activeItems.length
    return NextResponse.json(
      { success: true, servedCount, totalCount: items.length, cancelledCount },
      { headers }
    )
  } catch (e) {
    console.error('markPosOrderItemServed:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        success: false,
        message: msg.slice(0, 500),
        retryAfterQueue: true,
      },
      { headers }
    )
  }
}
