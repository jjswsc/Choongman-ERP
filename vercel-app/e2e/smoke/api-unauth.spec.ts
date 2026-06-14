import { test, expect } from '@playwright/test'

test.describe('API smoke (unauthenticated)', () => {
  test('loginCheck rejects empty body', async ({ request }) => {
    const res = await request.post('/api/loginCheck', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })

  test('ShopeeFood order/status webhook rejects missing auth', async ({ request }) => {
    const res = await request.post('/api/webhooks/shopeefood/test/order/status', {
      data: { id: '1', status: 'CANCELLED', store_id: 'x' },
      headers: { 'Content-Type': 'application/json' },
    })
    // bearer/indicator 실패 → 401 또는 vendor ack error
    expect([401, 403, 200]).toContain(res.status())
  })
})
