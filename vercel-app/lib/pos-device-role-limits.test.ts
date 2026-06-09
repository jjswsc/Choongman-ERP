import { describe, expect, it } from 'vitest'
import {
  clampMainDeviceMaxCount,
  clampOrderDeviceMaxCount,
  countMainDevicesFromRows,
  countRecentOrderDevicesFromRows,
  parsePosDeviceRoleLimitsRow,
  resolveDeviceRoleForRegister,
  DEFAULT_POS_DEVICE_ROLE_LIMITS,
} from '@/lib/pos-device-role-limits'

describe('pos-device-role-limits', () => {
  it('clamps main and order max counts', () => {
    expect(clampMainDeviceMaxCount(0)).toBe(1)
    expect(clampMainDeviceMaxCount(99)).toBe(5)
    expect(clampOrderDeviceMaxCount(0)).toBe(1)
    expect(clampOrderDeviceMaxCount(99)).toBe(30)
  })

  it('parses settings row with defaults', () => {
    expect(parsePosDeviceRoleLimitsRow(null)).toEqual({
      mainDeviceMaxCount: 1,
      orderDeviceMaxCount: 8,
      mainDeviceRoleLocked: false,
    })
    expect(
      parsePosDeviceRoleLimitsRow({
        main_device_max_count: 2,
        order_device_max_count: 5,
        main_device_role_locked: false,
      })
    ).toEqual({
      mainDeviceMaxCount: 2,
      orderDeviceMaxCount: 5,
      mainDeviceRoleLocked: false,
    })
  })

  it('counts mains and recent order devices', () => {
    const now = new Date().toISOString()
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const rows = [
      { device_token: 'a', role: 'main', last_seen_at: now },
      { device_token: 'b', role: 'order', last_seen_at: now },
      { device_token: 'c', role: 'order', last_seen_at: old },
      { device_token: 'd', role: 'attendance_display', last_seen_at: now },
    ]
    expect(countMainDevicesFromRows(rows)).toBe(1)
    expect(countRecentOrderDevicesFromRows(rows)).toBe(1)
    expect(countRecentOrderDevicesFromRows(rows, { excludeToken: 'b' })).toBe(0)
  })

  it('freezes role when locked (tablet cannot become main)', () => {
    const limits = { ...DEFAULT_POS_DEVICE_ROLE_LIMITS, mainDeviceRoleLocked: true }
    const rows = [{ device_token: 'tab1', role: 'order', last_seen_at: new Date().toISOString() }]
    expect(resolveDeviceRoleForRegister(rows, 'tab1', 'main', limits)).toEqual({ role: 'order' })
  })

  it('keeps main when locked even if client sends order', () => {
    const limits = { ...DEFAULT_POS_DEVICE_ROLE_LIMITS, mainDeviceRoleLocked: true }
    const rows = [{ device_token: 'pc1', role: 'main', last_seen_at: new Date().toISOString() }]
    expect(resolveDeviceRoleForRegister(rows, 'pc1', 'order', limits)).toEqual({ role: 'main' })
  })
})
