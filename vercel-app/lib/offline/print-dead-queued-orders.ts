'use client'

import { printPosHtmlDocument } from '@/lib/pos-print-html'
import { getAllPending, type PendingRequest } from '@/lib/offline/queue'
import { formatQueuedAtBangkok, isQueueItemDeadLetter, normalQueuedApiPath } from '@/lib/offline/queued-request-display'

const ORDER_APIS = new Set(['/api/savePosOrder', '/api/updatePosOrder'])

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type QueuedLine = { name?: unknown; qty?: unknown; quantity?: unknown; price?: unknown; note?: unknown }

export function isDeadQueuedOrderItem(item: PendingRequest): boolean {
  return isQueueItemDeadLetter(item) && ORDER_APIS.has(normalQueuedApiPath(item.api))
}

/** 전송 실패로 삭제될 주문(신규·추가주문)을 손으로 다시 입력할 수 있게 80mm 한 장으로 */
export function buildDeadQueuedOrdersHtml(items: PendingRequest[], title: string): string {
  const blocks = items.map((item) => {
    let body: Record<string, unknown> = {}
    try {
      body = JSON.parse(item.body || '{}') as Record<string, unknown>
    } catch {
      /* 본문 손상 — 머리글만 */
    }
    const lines = (Array.isArray(body.items) ? body.items : []) as QueuedLine[]
    const isAdd = normalQueuedApiPath(item.api) === '/api/updatePosOrder'
    const head = [
      formatQueuedAtBangkok(item.createdAt),
      isAdd ? `+ #${esc(body.id)}` : esc(body.orderType),
      esc(body.tableName),
    ]
      .filter(Boolean)
      .join(' · ')
    let sum = 0
    const rows = lines
      .map((ln) => {
        const qty = Math.max(0, Number(ln.qty ?? ln.quantity ?? 1) || 0)
        const price = Number(ln.price ?? 0) || 0
        sum += qty * price
        const note = String(ln.note ?? '').trim()
        return `<tr><td>${esc(ln.name)}${note ? `<div class="n">${esc(note)}</div>` : ''}</td><td class="r">x${qty}</td></tr>`
      })
      .join('')
    const localNo = String(item.metadata?.localOrderNo ?? '').trim()
    return `<section><div class="h">${head}</div>${localNo ? `<div class="n">${esc(localNo)}</div>` : ''}<table>${rows}</table><div class="r">${sum.toFixed(2)}</div></section>`
  })
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:80mm auto;margin:0}
body{margin:0;padding:2mm 17mm 6mm 5mm;font-family:sans-serif;font-size:12px}
h1{font-size:14px;margin:0 0 2mm}
section{border-top:1px dashed #000;padding:2mm 0}
.h{font-weight:bold}.n{font-size:10px}.r{text-align:right}
table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:0.5mm 0}
</style></head><body><h1>${esc(title)}</h1>${blocks.join('')}</body></html>`
}

/** @returns 인쇄한 주문 건수 */
export async function printDeadQueuedOrders(title: string): Promise<number> {
  const dead = (await getAllPending()).filter(isDeadQueuedOrderItem)
  if (dead.length === 0) return 0
  await printPosHtmlDocument(buildDeadQueuedOrdersHtml(dead, title), { title, printRole: 'receipt' })
  return dead.length
}

export async function countDeadQueuedOrders(): Promise<number> {
  return (await getAllPending()).filter(isDeadQueuedOrderItem).length
}
