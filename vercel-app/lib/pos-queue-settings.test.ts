import { describe, expect, it } from 'vitest'
import {
  isPosQueueEnabledForStore,
  posQueueConfigFromMap,
  posQueueSettingValueText,
} from './pos-queue-settings'

describe('posQueueSettingValueText', () => {
  it('keeps jsonb array store codes as stored by pos_queue_tickets_02 SQL', () => {
    const cfg = posQueueConfigFromMap(
      new Map([
        ['pos_queue_store_codes', posQueueSettingValueText(['CM Union Mall'])],
        ['pos_queue_all_stores', posQueueSettingValueText(false)],
        ['pos_queue_line_notify_enabled', posQueueSettingValueText(true)],
      ])
    )
    expect(isPosQueueEnabledForStore(cfg, 'CM Union Mall')).toBe(true)
    expect(cfg.allStores).toBe(false)
    expect(cfg.lineNotifyEnabled).toBe(true)
  })

  it('handles empty and plain string values', () => {
    expect(posQueueSettingValueText(null)).toBe('')
    expect(posQueueSettingValueText({})).toBe('')
    expect(posQueueSettingValueText(' CM Silom ')).toBe('CM Silom')
  })
})

describe('posQueueConfigFromMap', () => {
  it('parses a missing map as all-stores off and LINE notify on', () => {
    const cfg = posQueueConfigFromMap(new Map())
    expect(cfg.allStores).toBe(false)
    expect(cfg.lineNotifyEnabled).toBe(true)
    expect(cfg.storeCodes.size).toBe(0)
  })

  it('parses listed stores case-insensitively', () => {
    const cfg = posQueueConfigFromMap(new Map([['pos_queue_store_codes', '["CM Union Mall"]']]))
    expect(cfg.storeCodes.has('cm union mall')).toBe(true)
    expect(cfg.storeCodes.has('cm silom')).toBe(false)
  })

  it('accepts comma text and the all-stores flag', () => {
    const cfg = posQueueConfigFromMap(
      new Map([
        ['pos_queue_store_codes', 'CM Silom, CM MBK'],
        ['pos_queue_line_notify_enabled', 'false'],
      ])
    )
    expect(cfg.storeCodes.has('cm mbk')).toBe(true)
    expect(cfg.lineNotifyEnabled).toBe(false)
    const all = posQueueConfigFromMap(new Map([['pos_queue_all_stores', 'true']]))
    expect(all.allStores).toBe(true)
  })
})

describe('isPosQueueEnabledForStore', () => {
  it('enables every store, including when the pilot allowlist is only Union Mall', () => {
    const pilot = posQueueConfigFromMap(
      new Map([
        ['pos_queue_store_codes', '["CM Union Mall"]'],
        ['pos_queue_all_stores', 'false'],
      ])
    )
    expect(isPosQueueEnabledForStore(pilot, 'CM Union Mall')).toBe(true)
    expect(isPosQueueEnabledForStore(pilot, 'cm  union mall')).toBe(true)
    expect(isPosQueueEnabledForStore(pilot, 'CM Silom')).toBe(true)
    expect(isPosQueueEnabledForStore(pilot, '1042')).toBe(true)
    expect(isPosQueueEnabledForStore(posQueueConfigFromMap(new Map()), 'CM Anything')).toBe(true)
    expect(isPosQueueEnabledForStore(pilot, '')).toBe(false)
    expect(isPosQueueEnabledForStore(pilot, '   ')).toBe(false)
  })
})
