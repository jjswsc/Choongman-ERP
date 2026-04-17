/**
 * 오프라인 IndexedDB 큐 항목 — 배너·상세 다이얼로그용 표시 문자열
 */

import type { PendingRequest } from './queue'
import { OFFLINE_QUEUE_MAX_RETRIES } from './queue'

export function formatQueuedAtBangkok(createdAt: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(createdAt))
}

export function formatLastTriedBangkok(lastTriedAt: number | undefined, createdAt: number): string | null {
  if (lastTriedAt == null || lastTriedAt === createdAt) return null
  return formatQueuedAtBangkok(lastTriedAt)
}

export function isQueueItemDeadLetter(item: PendingRequest): boolean {
  return item.retryCount >= OFFLINE_QUEUE_MAX_RETRIES
}

/**
 * JSON body 일부를 사람이 읽을 수 있는 한 줄로 (민감·대용량 필드는 생략·요약)
 */
export function summarizeQueuedRequestBody(item: PendingRequest): string {
  const path = (item.api || '').split('?')[0] || ''
  if (!item.body?.trim()) return '—'
  try {
    const j = JSON.parse(item.body) as Record<string, unknown>
    if (path.endsWith('/api/savePosOrder')) {
      const store = String(j.storeCode ?? '')
      const ot = String(j.orderType ?? '')
      const table = j.tableName != null ? String(j.tableName) : ''
      const n = Array.isArray(j.items) ? j.items.length : 0
      return `store=${store} · ${ot}${table ? ` · table=${table}` : ''} · items=${n}`
    }
    if (path.endsWith('/api/updatePosOrder')) {
      const id = j.id != null ? String(j.id) : '—'
      const n = Array.isArray(j.items) ? j.items.length : 0
      return `orderId=${id} · items=${n}`
    }
    if (path.endsWith('/api/updatePosOrderStatus')) {
      const id = j.id != null ? String(j.id) : '—'
      return `orderId=${id} · status=${String(j.status ?? '')}`
    }
    if (path.endsWith('/api/markPosOrderItemServed')) {
      return `orderId=${j.id != null ? String(j.id) : '—'} · item=${j.itemId != null ? String(j.itemId) : '—'}`
    }
    if (path.endsWith('/api/savePosSettlement')) {
      return `store=${String(j.storeCode ?? '')} · date=${String(j.settleDate ?? '')}`
    }
    if (path.endsWith('/api/processPosStockDeduction')) {
      const oid = j.orderId ?? j.id
      return `orderId=${oid != null ? String(oid) : '—'}`
    }
    const keys = Object.keys(j).slice(0, 5)
    if (keys.length === 0) return '—'
    return keys.join(', ') + (Object.keys(j).length > 5 ? ', …' : '')
  } catch {
    const b = item.body
    return b.length > 220 ? `${b.slice(0, 220)}…` : b
  }
}

export function normalQueuedApiPath(api: string): string {
  try {
    const u = new URL(api, 'http://local')
    return u.pathname
  } catch {
    return api.split('?')[0] || api
  }
}
