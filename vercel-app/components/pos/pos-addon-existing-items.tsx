'use client'

import { Fragment, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, ReceiptText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Order } from '@/lib/pos-types'
import { translatePosMenuLineForReceipt } from '@/lib/pos-print-translate'
import {
  computePosOrderLineRounds,
  countPosOrderRounds,
  formatPosOrderRoundLabel,
} from '@/lib/pos-order-rounds'

const OPEN_STORAGE_KEY = 'cm_pos_addon_existing_open_v1'

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** 추가 주문 중 카트 위 — 이미 주문된 줄(읽기 전용). 접힘/펼침은 기기별로 기억 */
export function PosAddonExistingItems({ order, t }: { order: Order; t: (k: string) => string }) {
  const [open, setOpen] = useState(readOpen)
  const tr = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }

  const lineRounds = useMemo(
    () => computePosOrderLineRounds(order.items, { orderCreatedAt: order.createdAt }),
    [order.items, order.createdAt]
  )
  const roundCount = useMemo(() => countPosOrderRounds(lineRounds), [lineRounds])
  const rows = useMemo(() => {
    const idx = order.items.map((_, i) => i).filter((i) => !order.items[i]?.isBuffetEntry)
    if (roundCount < 2) return idx
    return idx.sort((a, b) => (lineRounds[a]?.round ?? 1) - (lineRounds[b]?.round ?? 1) || a - b)
  }, [order.items, lineRounds, roundCount])

  const activeQty = rows.reduce((sum, i) => {
    const it = order.items[i]
    return it && !it.cancelledAt ? sum + Math.max(0, Number(it.quantity) || 0) : sum
  }, 0)
  const roundTemplate = t('posOrderRoundN')

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(OPEN_STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* 저장 불가 — 이번 화면에서만 유지 */
      }
      return next
    })
  }

  return (
    <div className="shrink-0 border-b border-border bg-muted/40">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold touch-manipulation hover:bg-muted/70"
        onClick={toggle}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <ReceiptText className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {tr('posAddonExistingItems', '기존 주문')}
          <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{activeQty}</span>
        </span>
        <span className="shrink-0 tabular-nums">{order.total.toLocaleString()} ฿</span>
      </button>
      {open ? (
        <ul className="max-h-[32vh] space-y-0.5 overflow-auto px-3 pb-2">
          {rows.map((i, pos) => {
            const it = order.items[i]
            if (!it) return null
            const round = lineRounds[i]
            const prev = pos > 0 ? lineRounds[rows[pos - 1]] : undefined
            const showRoundHeader = roundCount >= 2 && round && prev?.round !== round.round
            const cancelled = Boolean(it.cancelledAt)
            const note = (it.note ?? '').trim()
            return (
              <Fragment key={`${it.id}-${i}`}>
                {showRoundHeader ? (
                  <li className="pt-1 text-[11px] font-bold text-muted-foreground">
                    {formatPosOrderRoundLabel(round, roundTemplate)}
                  </li>
                ) : null}
                <li
                  className={cn(
                    'flex items-baseline gap-2 text-sm leading-snug',
                    cancelled && 'text-muted-foreground line-through'
                  )}
                >
                  <span className="min-w-0 flex-1 break-words">
                    {translatePosMenuLineForReceipt(it.name, t)}
                    {note ? <span className="ml-1.5 text-xs text-blue-700 dark:text-blue-300">{note}</span> : null}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">×{it.quantity}</span>
                  {it.servedAt && !cancelled ? (
                    <Check className="h-3.5 w-3.5 shrink-0 self-center text-emerald-600" aria-hidden />
                  ) : (
                    <span className="w-3.5 shrink-0" aria-hidden />
                  )}
                </li>
              </Fragment>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
