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
  /** subscribe() 콜백 — SUBSCRIBED / CHANNEL_ERROR 등 */
  onStatus?: (status: PosRealtimeSubscribeStatus, err?: Error) => void
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

function buildPosOrdersChannelFilter(options?: PosOrdersRealtimeSubscribeOptions): string | undefined {
  if (options?.tenantId) return `tenant_id=eq.${options.tenantId}`
  if (options?.store) return `store_code=eq.${options.store}`
  return undefined
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
    .channel(`pos-orders-insert-${options?.tenantId || options?.store || 'all'}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pos_orders', ...(filter ? { filter } : {}) },
      onInsert
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
    .channel(`pos-orders-update-${options?.tenantId || options?.store || 'all'}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pos_orders', ...(filter ? { filter } : {}) },
      onUpdate
    )
  return attachSubscribeStatus(channel, options?.onStatus)
}
