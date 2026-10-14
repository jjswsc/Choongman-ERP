import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
const addToQueue = vi.fn()

vi.mock('./fetch', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('@/lib/offline/queue', () => ({ addToQueue: (...args: unknown[]) => addToQueue(...args) }))
vi.mock('@/lib/offline/network', () => ({
  isBrowserOnline: () => true,
  isNetworkDegraded: () => false,
  shouldPreferOfflineCache: () => false,
  reportNetworkFailure: vi.fn(),
  reportNetworkSuccess: vi.fn(),
}))

import { apiFetchWithOffline } from '@/lib/api/fetch-offline'

function hangingFetch(_input: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
  })
}

describe('apiFetchWithOffline savePosOrder timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    apiFetch.mockReset()
    addToQueue.mockReset()
    addToQueue.mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('localOrderNo 있는 신규 저장은 10초 무응답이면 큐로 넘기고 로컬 번호를 돌려준다', async () => {
    apiFetch.mockImplementation(hangingFetch)
    const pending = apiFetchWithOffline('/api/savePosOrder', {
      method: 'POST',
      body: JSON.stringify({ localOrderNo: 'pos-abc', items: [] }),
    })
    await vi.advanceTimersByTimeAsync(10_000)
    const res = await pending
    expect(res.headers.get('X-Offline-Queued')).toBe('1')
    expect(await res.json()).toEqual({ success: true, orderNo: 'pos-abc', queued: true })
    expect(addToQueue).toHaveBeenCalledTimes(1)
  })

  it('추가주문(updatePosOrder)은 시간 제한을 걸지 않는다', async () => {
    let signal: AbortSignal | undefined
    apiFetch.mockImplementation((_input: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    await apiFetchWithOffline('/api/updatePosOrder', { method: 'POST', body: JSON.stringify({ id: 1 }) })
    expect(signal).toBeUndefined()
  })
})
