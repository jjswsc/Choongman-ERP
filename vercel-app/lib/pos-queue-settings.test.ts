import { describe, expect, it } from 'vitest'
import { isPosQueueEnabledForStore, posQueueConfigFromMap } from './pos-queue-settings'

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
