/** 미수/미지급 목록 — 브라우저 탭 간 캐시 무효화·재조회 동기화 */

const CHANNEL_NAME = 'cm-erp-rec-pay-list'
const STORAGE_KEY = 'cm:erp:rec-pay-list:invalidated'

const TAB_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`

export type RecPayListInvalidationPayload = {
  at: number
  sourceTabId: string
}

export function publishReceivablePayableListInvalidated(): void {
  if (typeof window === 'undefined') return
  const payload: RecPayListInvalidationPayload = { at: Date.now(), sourceTabId: TAB_ID }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore localStorage write errors
  }
  try {
    const bc = new BroadcastChannel(CHANNEL_NAME)
    bc.postMessage(payload)
    bc.close()
  } catch {
    // BroadcastChannel unsupported -> storage event fallback only
  }
}

export function subscribeReceivablePayableListInvalidated(
  onInvalidate: (payload: RecPayListInvalidationPayload) => void
): () => void {
  if (typeof window === 'undefined') return () => {}

  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      const parsed = JSON.parse(e.newValue) as RecPayListInvalidationPayload
      if (parsed?.sourceTabId === TAB_ID) return
      onInvalidate(parsed)
    } catch {
      // ignore invalid payload
    }
  }
  window.addEventListener('storage', onStorage)

  let bc: BroadcastChannel | null = null
  try {
    bc = new BroadcastChannel(CHANNEL_NAME)
    bc.onmessage = (event: MessageEvent<RecPayListInvalidationPayload>) => {
      const data = event.data
      if (!data?.at || data.sourceTabId === TAB_ID) return
      onInvalidate(data)
    }
  } catch {
    bc = null
  }

  return () => {
    window.removeEventListener('storage', onStorage)
    try {
      bc?.close()
    } catch {
      // ignore
    }
  }
}
