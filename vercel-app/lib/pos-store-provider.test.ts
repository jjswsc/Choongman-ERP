/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  POS_STORE_CUSTOMER_DISPLAY_STUB,
  PosStoreStubProvider,
  usePosStore,
} from '@/lib/pos-store-provider'

function Probe() {
  const store = usePosStore()
  return createElement('span', null, `${store.loadingTables ? 'loading' : 'ready'}:${store.stores.length}`)
}

describe('PosStoreStubProvider / customer-display safety', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/')
    vi.restoreAllMocks()
  })

  it('provides a stub context so usePosStore does not throw', () => {
    const html = renderToStaticMarkup(
      createElement(PosStoreStubProvider, null, createElement(Probe))
    )
    expect(html).toContain('ready:0')
  })

  it('falls back to stub when pathname is customer-display and provider is missing', () => {
    window.history.replaceState({}, '', '/pos/customer-display?store=The%20Street')
    const html = renderToStaticMarkup(createElement(Probe))
    expect(html).toContain('ready:0')
    expect(POS_STORE_CUSTOMER_DISPLAY_STUB.refetchStores).toBeTypeOf('function')
  })

  it('still throws outside provider on normal POS paths', () => {
    window.history.replaceState({}, '', '/pos/terminal')
    expect(() => renderToStaticMarkup(createElement(Probe))).toThrow(
      /usePosStore must be used within PosStoreProvider/
    )
  })
})
