/**
 * Supabase 브라우저 클라이언트 (Realtime 전용)
 *
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 필요.
 * 미설정 시 null 반환하여 Realtime 구독 없이 폴링만 동작.
 */

import { createClient, type RealtimeChannel } from '@supabase/supabase-js'

let _client: ReturnType<typeof createClient> | null = null

export type PosRealtimeSubscribeStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR'
  | string

export type PosOrdersRealtimeSubscribeOptions = {
  store?: string
  tenantId?: string
  /**
   * 같은 store의 INSERT/UPDATE 구독이 여러 개일 때 채널명 충돌 방지.
   * supabase-js는 동일 채널명을 재사용하므로, 키 없이 두 번 구독하면
   * 한쪽 unsubscribe가 다른 핸들러까지 끊고 QR 주방 인쇄가 폴링(8초)으로 떨어진다.
   */
  channelKey?: string
  /** subscribe() 콜백 — SUBSCRIBED / CHANNEL_ERROR 등 */
  onStatus?: (status: PosRealtimeSubscribeStatus, err?: Error) => void
}

export function posOrdersRealtimeChannelName(
  kind: 'insert' | 'update',
  options?: PosOrdersRealtimeSubscribeOptions
): string {
  const scope = String(options?.tenantId || options?.store || 'all').trim() || 'all'
  const extra = String(options?.channelKey || '').trim()
  return extra ? `pos-orders-${kind}-${extra}-${scope}` : `pos-orders-${kind}-${scope}`
}

export function getSupabaseClient() {
  if (typeof window === 'undefined') return null
  if (_client) return _client
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
  if (!url || !key) return null
  _client = createClient(url, key)
  return _client
}

/**
 * Realtime filter는 단일 컬럼이 안정적.
 * Omni: tenant_id 우선(동일 store_code 교차 테넌트 차단).
 * 충만: store_code.
 * 클라이언트에서 store/tenant 재검증.
 */
function buildPosOrdersChannelFilter(options?: PosOrdersRealtimeSubscribeOptions): string | undefined {
  const tenantId = String(options?.tenantId || '').trim()
  if (tenantId) return `tenant_id=eq.${tenantId}`
  const store = String(options?.store || '').trim()
  if (store) return `store_code=eq.${store}`
  return undefined
}

function rowMatchesPosRealtimeFilter(
  row: Record<string, unknown> | null | undefined,
  options?: PosOrdersRealtimeSubscribeOptions
): boolean {
  if (!row) return false
  const tenantId = String(options?.tenantId || '').trim().toLowerCase()
  if (tenantId) {
    const rowTid = String(row.tenant_id ?? '').trim().toLowerCase()
    if (rowTid && rowTid !== tenantId) return false
  }
  const store = String(options?.store || '').trim().toLowerCase()
  if (store) {
    const rowStore = String(row.store_code ?? '').trim().toLowerCase()
    if (rowStore && rowStore !== store) return false
  }
  return true
}

function attachSubscribeStatus(
  channel: RealtimeChannel,
  onStatus?: PosOrdersRealtimeSubscribeOptions['onStatus']
): RealtimeChannel {
  channel.subscribe((status, err) => {
    onStatus?.(status, err ?? undefined)
  })
  return channel
}

export function subscribePosOrdersInsert(
  onInsert: (payload: { new: Record<string, unknown> }) => void,
  options?: PosOrdersRealtimeSubscribeOptions
): RealtimeChannel | null {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const filter = buildPosOrdersChannelFilter(options)
  const channel = supabase
    .channel(posOrdersRealtimeChannelName('insert', options))
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pos_orders', ...(filter ? { filter } : {}) },
      (payload) => {
        const row = (payload as { new?: Record<string, unknown> }).new
        if (!rowMatchesPosRealtimeFilter(row, options)) return
        onInsert({ new: row || {} })
      }
    )
  return attachSubscribeStatus(channel, options?.onStatus)
}

/** 결제 반영 등 pos_orders UPDATE (메인 포스에서 결제 영수증 자동 인쇄용) */
export function subscribePosOrdersUpdate(
  onUpdate: (payload: { new: Record<string, unknown>; old?: Record<string, unknown> }) => void,
  options?: PosOrdersRealtimeSubscribeOptions
): RealtimeChannel | null {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const filter = buildPosOrdersChannelFilter(options)
  const channel = supabase
    .channel(posOrdersRealtimeChannelName('update', options))
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pos_orders', ...(filter ? { filter } : {}) },
      (payload) => {
        const row = (payload as { new?: Record<string, unknown>; old?: Record<string, unknown> }).new
        if (!rowMatchesPosRealtimeFilter(row, options)) return
        onUpdate({
          new: row || {},
          old: (payload as { old?: Record<string, unknown> }).old,
        })
      }
    )
  return attachSubscribeStatus(channel, options?.onStatus)
}

export function posPrintJobsInsertChannelName(store: string): string {
  return `pos-print-jobs-insert-${String(store || '').trim()}`
}

function posPrintJobsStoreRealtimeFilter(store: string): string | undefined {
  const s = String(store || '').trim()
  if (!s) return undefined
  // 공백·쉼표가 있으면 eq 필터가 이벤트를 놓친다. 그때는 테이블 전체 INSERT 후 클라이언트에서 매장 비교.
  if (!/^[A-Za-z0-9._-]+$/.test(s)) return undefined
  return `store_code=eq.${s}`
}

/** QR 주방 큐 INSERT — 주문 UI 갱신을 기다리지 않고 claim */
export function subscribePosPrintJobsInsert(
  onInsert: () => void,
  options?: {
    store?: string
    storeCodes?: string[]
    onStatus?: PosOrdersRealtimeSubscribeOptions['onStatus']
  }
): RealtimeChannel | null {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const stores = [
    ...new Set(
      [options?.store, ...(options?.storeCodes || [])]
        .map((s) => String(s || '').trim().toLowerCase())
        .filter(Boolean)
    ),
  ]
  const primary = stores[0] || String(options?.store || '').trim()
  if (!primary) return null
  const filter = stores.length === 1 ? posPrintJobsStoreRealtimeFilter(primary) : undefined
  const channel = supabase
    .channel(posPrintJobsInsertChannelName(primary))
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'pos_print_jobs',
        ...(filter ? { filter } : {}),
      },
      (payload) => {
        const row = (payload as { new?: Record<string, unknown> }).new
        const rowStore = String(row?.store_code ?? '').trim().toLowerCase()
        if (rowStore && stores.length > 0 && !stores.includes(rowStore)) return
        if (String(row?.job_type ?? '').trim() !== 'kitchen') return
        if (String(row?.status ?? '').trim() !== 'queued') return
        onInsert()
      }
    )
  return attachSubscribeStatus(channel, options?.onStatus)
}
