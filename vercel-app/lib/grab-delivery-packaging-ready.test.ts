import { describe, expect, it, vi, beforeEach } from 'vitest'
import { markPosDeliveryPackagedWithGrab } from '@/lib/grab-delivery-packaging-ready'

vi.mock('@/lib/api-client', () => ({
  updatePosOrderStatus: vi.fn(),
  grabMarkOrderReadyApi: vi.fn(),
}))

import { grabMarkOrderReadyApi, updatePosOrderStatus } from '@/lib/api-client'

describe('markPosDeliveryPackagedWithGrab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns invalid when order id is bad', async () => {
    const res = await markPosDeliveryPackagedWithGrab({ orderId: 0 })
    expect(res).toEqual({ posOk: false, grabOk: false, grabError: 'invalid_order_id' })
  })

  it('skips Grab when grabOrderId is empty', async () => {
    vi.mocked(updatePosOrderStatus).mockResolvedValue({ success: true })
    const res = await markPosDeliveryPackagedWithGrab({ orderId: 42 })
    expect(res).toEqual({ posOk: true, grabOk: true })
    expect(grabMarkOrderReadyApi).not.toHaveBeenCalled()
  })

  it('calls Grab markOrderReady after POS ready', async () => {
    vi.mocked(updatePosOrderStatus).mockResolvedValue({ success: true })
    vi.mocked(grabMarkOrderReadyApi).mockResolvedValue({ success: true })
    const res = await markPosDeliveryPackagedWithGrab({ orderId: 42, grabOrderId: 'G-1' })
    expect(res).toEqual({ posOk: true, grabOk: true })
    expect(grabMarkOrderReadyApi).toHaveBeenCalledWith({ orderID: 'G-1', markStatus: 1 })
  })

  it('reports grab failure when POS ok', async () => {
    vi.mocked(updatePosOrderStatus).mockResolvedValue({ success: true })
    vi.mocked(grabMarkOrderReadyApi).mockResolvedValue({ success: false, message: 'grab_down' })
    const res = await markPosDeliveryPackagedWithGrab({ orderId: 42, grabOrderId: 'G-1' })
    expect(res.posOk).toBe(true)
    expect(res.grabOk).toBe(false)
    expect(res.grabError).toBe('grab_down')
  })
})
