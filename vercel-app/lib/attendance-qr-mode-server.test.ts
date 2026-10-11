import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseUpsertMock = vi.fn()

vi.mock('@/lib/supabase-server', () => ({
  supabaseSelectFilter: vi.fn(),
  supabaseUpsert: (...args: unknown[]) => supabaseUpsertMock(...args),
}))

import { saveAttendanceQrStoreMode } from '@/lib/attendance-qr-mode-server'

describe('saveAttendanceQrStoreMode', () => {
  beforeEach(() => {
    supabaseUpsertMock.mockReset()
    supabaseUpsertMock.mockResolvedValue(undefined)
  })

  it('saves per company so another company with the same store code does not overwrite it', async () => {
    await saveAttendanceQrStoreMode({
      storeCode: 'S01',
      mode: 'fixed',
      scope: { enforce: true, tenantId: 'banjoo' },
    })
    expect(supabaseUpsertMock).toHaveBeenCalledTimes(1)
    const [table, rows, conflict] = supabaseUpsertMock.mock.calls[0]
    expect(table).toBe('attendance_qr_store_settings')
    expect(conflict).toBe('tenant_id,store_code')
    expect(rows[0]).toMatchObject({ tenant_id: 'banjoo', store_code: 'S01', mode: 'fixed' })
  })

  it('uses empty tenant_id when the scope is not enforced', async () => {
    await saveAttendanceQrStoreMode({
      storeCode: 'S01',
      mode: 'rotating',
      scope: { enforce: false, tenantId: '' },
    })
    const [, rows, conflict] = supabaseUpsertMock.mock.calls[0]
    expect(conflict).toBe('tenant_id,store_code')
    expect(rows[0]).toMatchObject({ tenant_id: '', store_code: 'S01', mode: 'rotating' })
  })

  it('falls back to store_code conflict before the tenant primary key SQL is applied', async () => {
    supabaseUpsertMock
      .mockRejectedValueOnce(new Error('42P10 there is no unique or exclusion constraint'))
      .mockResolvedValueOnce(undefined)
    await saveAttendanceQrStoreMode({
      storeCode: 'S01',
      mode: 'fixed',
      scope: { enforce: true, tenantId: 'banjoo' },
    })
    expect(supabaseUpsertMock).toHaveBeenCalledTimes(2)
    expect(supabaseUpsertMock.mock.calls[1][2]).toBe('store_code')
  })
})
