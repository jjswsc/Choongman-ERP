/**
 * Supabase 브라우저 클라이언트 (Realtime 전용)
 *
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 필요.
 * 미설정 시 null 반환하여 Realtime 구독 없이 폴링만 동작.
 */

import { createClient, type RealtimeChannel } from '@supabase/supabase-js'

let _client: ReturnType<typeof createClient> | null = null

export function getSupabaseClient() {
  if (typeof window === 'undefined') return null
  if (_client) return _client
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
  if (!url || !key) return null
  _client = createClient(url, key)
  return _client
}

export function subscribePosOrdersInsert(
  onInsert: (payload: { new: Record<string, unknown> }) => void
): RealtimeChannel | null {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const channel = supabase
    .channel('pos-orders-insert')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pos_orders' }, onInsert)
    .subscribe()
  return channel
}
