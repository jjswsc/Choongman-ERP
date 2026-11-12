import { afterEach, describe, expect, it } from 'vitest'
import {
  POS_PENDING_EDC_CLOSE_STORAGE_KEY,
  POS_PENDING_EDC_CLOSE_TTL_MS,
  clearPendingEdcClose,
  findPendingEdcCloseForTable,
  getPendingEdcClose,
  listPendingEdcCloseForStore,
  pendingEdcCloseFromLinkpos,
  shouldWarnUnpaidOpenTable,
  upsertPendingEdcClose,
} from '@/lib/pos-pending-edc-close'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null
  }
  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}

describe('pos-pending-edc-close', () => {
  const storage = new MemoryStorage()

  afterEach(() => {
    storage.clear()
  })

  it('upserts, gets, lists, and clears by order id', () => {
    const now = 1_700_000_000_000
    const rec = upsertPendingEdcClose(
      {
        orderId: 181760,
        storeCode: 'CM The street',
        tableName: '12번',
        amount: 140,
        approvalCode: 'abc123',
        mode: 'linkpos',
      },
      { storage, now }
    )
    expect(rec?.approvalCode).toBe('ABC123')
    expect(getPendingEdcClose(181760, { storage, now })?.amount).toBe(140)
    expect(listPendingEdcCloseForStore('cm the street', { storage, now })).toHaveLength(1)
    expect(findPendingEdcCloseForTable('CM The street', '12번', { storage, now })?.orderId).toBe(181760)
    expect(clearPendingEdcClose(181760, { storage, now })).toBe(true)
    expect(getPendingEdcClose(181760, { storage, now })).toBeNull()
  })

  it('keeps linkpos approval when later manual_intent upserts', () => {
    const now = 1_700_000_000_000
    upsertPendingEdcClose(
      {
        orderId: 10,
        storeCode: 'S1',
        amount: 100,
        approvalCode: 'OK99',
        mode: 'linkpos',
      },
      { storage, now }
    )
    upsertPendingEdcClose(
      {
        orderId: 10,
        storeCode: 'S1',
        amount: 100,
        mode: 'manual_intent',
      },
      { storage, now: now + 1000 }
    )
    const hit = getPendingEdcClose(10, { storage, now: now + 1000 })
    expect(hit?.mode).toBe('linkpos')
    expect(hit?.approvalCode).toBe('OK99')
  })

  it('prunes records past TTL', () => {
    const now = 1_700_000_000_000
    upsertPendingEdcClose(
      {
        orderId: 1,
        storeCode: 'S1',
        amount: 50,
        mode: 'manual_intent',
        createdAt: now - POS_PENDING_EDC_CLOSE_TTL_MS - 1,
      },
      { storage, now: now - POS_PENDING_EDC_CLOSE_TTL_MS - 1 }
    )
    expect(getPendingEdcClose(1, { storage, now })).toBeNull()
    expect(storage.getItem(POS_PENDING_EDC_CLOSE_STORAGE_KEY)).toBe('{}')
  })

  it('builds input from linkpos or card intent', () => {
    expect(
      pendingEdcCloseFromLinkpos({
        orderId: 1,
        storeCode: 'S1',
        amount: 200,
        linkposPayment: { approvalCode: 'x1', traceNo: 't9' },
      })
    ).toMatchObject({ mode: 'linkpos', approvalCode: 'x1', traceNo: 't9' })
    expect(
      pendingEdcCloseFromLinkpos({
        orderId: 1,
        storeCode: 'S1',
        amount: 200,
        linkposPayment: null,
      })
    ).toMatchObject({ mode: 'manual_intent' })
  })

  it('warns unpaid open tables after threshold', () => {
    const now = 1_700_000_000_000
    expect(
      shouldWarnUnpaidOpenTable({
        status: 'ready',
        total: 140,
        paidSum: 0,
        createdAtMs: now - 45 * 60 * 1000,
        nowMs: now,
      })
    ).toBe(true)
    expect(
      shouldWarnUnpaidOpenTable({
        status: 'ready',
        total: 140,
        paidSum: 0,
        createdAtMs: now - 10 * 60 * 1000,
        nowMs: now,
      })
    ).toBe(false)
    expect(
      shouldWarnUnpaidOpenTable({
        status: 'completed',
        total: 140,
        paidSum: 0,
        createdAtMs: now - 60 * 60 * 1000,
        nowMs: now,
      })
    ).toBe(false)
  })
})
