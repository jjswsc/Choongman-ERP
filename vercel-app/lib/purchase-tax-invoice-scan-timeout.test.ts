/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withVisibleScanTimeout } from './purchase-tax-invoice-scan-timeout'

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('withVisibleScanTimeout', () => {
  afterEach(() => {
    setVisibility('visible')
    vi.useRealTimers()
  })

  it('rejects after the limit while the tab stays visible', async () => {
    vi.useFakeTimers()
    setVisibility('visible')
    const p = withVisibleScanTimeout(new Promise(() => undefined), 1_000)
    const caught = p.then(
      () => 'ok',
      (e: Error) => e.message
    )
    await vi.advanceTimersByTimeAsync(999)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(2)
    await expect(caught).resolves.toBe('ptiOcrPageTimeout')
  })

  it('does not count hidden time against the limit', async () => {
    vi.useFakeTimers()
    setVisibility('visible')
    const p = withVisibleScanTimeout(new Promise(() => undefined), 5_000)
    const caught = p.then(
      () => 'ok',
      (e: Error) => e.message
    )
    await vi.advanceTimersByTimeAsync(1_000)
    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(60_000)
    await Promise.resolve()
    expect(await Promise.race([caught, Promise.resolve('pending')])).toBe('pending')
    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(3_999)
    await Promise.resolve()
    expect(await Promise.race([caught, Promise.resolve('pending')])).toBe('pending')
    await vi.advanceTimersByTimeAsync(2)
    await expect(caught).resolves.toBe('ptiOcrPageTimeout')
  })

  it('resolves if the page finishes after coming back', async () => {
    vi.useFakeTimers()
    setVisibility('visible')
    let resolvePage: (v: string) => void = () => undefined
    const page = new Promise<string>((resolve) => {
      resolvePage = resolve
    })
    const p = withVisibleScanTimeout(page, 5_000)
    await vi.advanceTimersByTimeAsync(500)
    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(30_000)
    setVisibility('visible')
    resolvePage('done')
    await expect(p).resolves.toBe('done')
  })
})
