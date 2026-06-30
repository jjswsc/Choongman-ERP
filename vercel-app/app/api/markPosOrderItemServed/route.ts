import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import {
  listPosSetChildKeys,
  readPosSetChildrenState,
  type PosSetChildrenState,
} from '@/lib/pos-set-children-state'
import { reserveRequestIdempotencyKey } from '@/lib/request-idempotency'
import { posApiCorsHeaders, requirePosOrderWriteAuth } from '@/lib/pos-api-write-auth'

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
  const headers = posApiCorsHeaders()

  try {
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { headers })
    }
    const id = Number(body?.id)
    const idempotencyKey = String(req.headers.get('x-idempotency-key') ?? '').trim()
    const itemId = String(body?.itemId ?? '').trim()
    const childKey = String(body?.childKey ?? '').trim()
    const mode = String(body?.mode ?? '').trim().toLowerCase() === 'packed' ? 'packed' : 'served'
    const served = body?.served === true
    const servedBy = String(body?.servedBy ?? '').trim()
    const cancelled = body?.cancelled === true
    const cancelledBy = String(body?.cancelledBy ?? '').trim()
    const cancelReason = String(body?.cancelReason ?? '').trim()

    if (!id || Number.isNaN(id) || !itemId) {
      return NextResponse.json({ success: false, message: 'id, itemId required' }, { headers })
    }

    const authGate = await requirePosOrderWriteAuth(req, id, headers)
    if (!authGate.ok) return authGate.response

    if (idempotencyKey) {
      const duplicated = await reserveRequestIdempotencyKey({
        scope: `mark_pos_order_item_served:${id}`,
        key: idempotencyKey,
        payload: { id, itemId, mode, childKey: childKey || null },
      })
      if (duplicated) {
        return NextResponse.json({ success: true, noop: true, duplicate: true }, { headers })
      }
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
    const setChildKeys = listPosSetChildKeys(
      Array.isArray(target.promoItems)
        ? (target.promoItems as Array<{ menuId?: string | null; optionId?: string | null; quantity?: number }>)
        : []
    )
    const hasSetChildren = setChildKeys.length > 0
    const setChildrenState: PosSetChildrenState = readPosSetChildrenState(target.setChildrenState)

    const getChildDone = (state: PosSetChildrenState, key: string): boolean => {
      const row = state[key]
      if (!row) return false
      if (mode === 'packed') return Boolean(String(row.packedAt ?? '').trim())
      return Boolean(String(row.servedAt ?? '').trim())
    }
    const recomputeParentDone = (state: PosSetChildrenState): boolean => {
      if (!hasSetChildren) return served
      if (!setChildKeys.length) return false
      for (const k of setChildKeys) {
        if (!getChildDone(state, k)) return false
      }
      return true
    }

    if (cancelled) {
      target.cancelledAt = String(target.cancelledAt || nowBangkokIso())
      if (cancelledBy) target.cancelledBy = cancelledBy
      if (cancelReason) target.cancelReason = cancelReason
      // 취소 항목은 서빙/포장 완료 카운트에서 제외
      target.servedAt = null
      target.servedBy = null
      if (hasSetChildren) {
        for (const key of setChildKeys) {
          setChildrenState[key] = {
            ...(setChildrenState[key] || {}),
            servedAt: null,
            servedBy: null,
            packedAt: null,
            packedBy: null,
          }
        }
        target.setChildrenState = setChildrenState
      }
    } else {
      if (body && Object.prototype.hasOwnProperty.call(body, 'cancelled')) {
        target.cancelledAt = null
        target.cancelledBy = null
        target.cancelReason = null
      }
      if (childKey && hasSetChildren) {
        if (!setChildKeys.includes(childKey)) {
          return NextResponse.json({ success: false, message: '세트 하위 항목 키가 유효하지 않습니다.' }, { headers })
        }
        const next = { ...(setChildrenState[childKey] || {}) }
        if (mode === 'packed') {
          if (served) {
            next.packedAt = String(next.packedAt || nowBangkokIso())
            if (servedBy) next.packedBy = servedBy
          } else {
            next.packedAt = null
            next.packedBy = null
          }
        } else if (served) {
          next.servedAt = String(next.servedAt || nowBangkokIso())
          if (servedBy) next.servedBy = servedBy
        } else {
          next.servedAt = null
          next.servedBy = null
        }
        setChildrenState[childKey] = next
        const parentDone = recomputeParentDone(setChildrenState)
        if (parentDone) {
          target.servedAt = String(target.servedAt || nowBangkokIso())
          if (servedBy) target.servedBy = servedBy
        } else {
          target.servedAt = null
          target.servedBy = null
        }
        target.setChildrenState = setChildrenState
      } else {
        if (served) {
          target.servedAt = String(target.servedAt || nowBangkokIso())
          if (servedBy) target.servedBy = servedBy
        } else {
          target.servedAt = null
          target.servedBy = null
        }
        if (hasSetChildren) {
          for (const key of setChildKeys) {
            setChildrenState[key] = {
              ...(setChildrenState[key] || {}),
              servedAt: served ? String(setChildrenState[key]?.servedAt || nowBangkokIso()) : null,
              servedBy: served ? servedBy || setChildrenState[key]?.servedBy || null : null,
              packedAt: served ? String(setChildrenState[key]?.packedAt || nowBangkokIso()) : null,
              packedBy: served ? servedBy || setChildrenState[key]?.packedBy || null : null,
            }
          }
          target.setChildrenState = setChildrenState
        }
      }
    }
    items[idx] = target

    await supabaseUpdate('pos_orders', id, {
      items_json: JSON.stringify(items),
    })

    const activeItems = items.filter((it) => !String(it?.cancelledAt ?? '').trim())
    const servedCount = activeItems.filter((it) => Boolean(String(it?.servedAt ?? '').trim())).length
    const cancelledCount = items.length - activeItems.length
    const childDoneCount = hasSetChildren
      ? setChildKeys.filter((k) => getChildDone(setChildrenState, k)).length
      : undefined
    return NextResponse.json(
      {
        success: true,
        servedCount,
        totalCount: items.length,
        cancelledCount,
        ...(hasSetChildren ? { childServedCount: childDoneCount, childTotalCount: setChildKeys.length } : {}),
      },
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
