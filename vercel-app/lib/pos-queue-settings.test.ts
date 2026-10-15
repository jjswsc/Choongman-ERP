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
  it('defaults to disabled stores and LINE notify on', () => {
    const cfg = posQueueConfigFromMap(new Map())
    expect(cfg.allStores).toBe(false)
    expect(cfg.lineNotifyEnabled).toBe(true)
    expect(isPosQueueEnabledForStore(cfg, 'CM Union Mall')).toBe(false)
  })

  it('enables listed stores case-insensitively', () => {
    const cfg = posQueueConfigFromMap(new Map([['pos_queue_store_codes', '["CM Union Mall"]']]))
    expect(isPosQueueEnabledForStore(cfg, 'cm  union mall')).toBe(true)
    expect(isPosQueueEnabledForStore(cfg, 'CM Silom')).toBe(false)
  })

  it('accepts comma text and all-stores flag', () => {
    const cfg = posQueueConfigFromMap(
      new Map([
        ['pos_queue_store_codes', 'CM Silom, CM MBK'],
        ['pos_queue_line_notify_enabled', 'false'],
      ])
    )
    expect(isPosQueueEnabledForStore(cfg, 'CM MBK')).toBe(true)
    expect(cfg.lineNotifyEnabled).toBe(false)
    const all = posQueueConfigFromMap(new Map([['pos_queue_all_stores', 'true']]))
    expect(isPosQueueEnabledForStore(all, 'CM Anything')).toBe(true)
    expect(isPosQueueEnabledForStore(all, '')).toBe(false)
  })
})
