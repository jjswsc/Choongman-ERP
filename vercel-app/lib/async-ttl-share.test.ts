import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAsyncTtlShare } from './async-ttl-share'

describe('createAsyncTtlShare', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shares one in-flight load per key', async () => {
    const share = createAsyncTtlShare<number>(60_000)
    let calls = 0
    const load = async () => {
      calls++
      await new Promise((r) => setTimeout(r, 10))
      return 7
    }
    const [a, b] = await Promise.all([share('k', load), share('k', load)])
    expect([a, b]).toEqual([7, 7])
    expect(calls).toBe(1)
    expect(await share('other', load)).toBe(7)
    expect(calls).toBe(2)
  })

  it('does not keep failed loads', async () => {
    const share = createAsyncTtlShare<number>(60_000)
    await expect(share('k', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(await share('k', async () => 3)).toBe(3)
  })

  it('reloads after ttl', async () => {
    vi.useFakeTimers()
    const share = createAsyncTtlShare<number>(1_000)
    let calls = 0
    const load = async () => ++calls
    expect(await share('k', load)).toBe(1)
    vi.advanceTimersByTime(500)
    expect(await share('k', load)).toBe(1)
    vi.advanceTimersByTime(600)
    expect(await share('k', load)).toBe(2)
  })

  it('evicts the oldest entry when full', async () => {
    const share = createAsyncTtlShare<string>(60_000, 2)
    let calls = 0
    const load = (v: string) => async () => {
      calls++
      return v
    }
    await share('a', load('a'))
    await share('b', load('b'))
    await share('c', load('c'))
    expect(calls).toBe(3)
    await share('b', load('b'))
    expect(calls).toBe(3)
    await share('a', load('a'))
    expect(calls).toBe(4)
  })
})
